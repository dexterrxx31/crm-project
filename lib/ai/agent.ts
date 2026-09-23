import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, FALLBACK_BETA, MODEL } from "@/lib/ai/client";
import {
  ALL_TOOLS,
  describeWriteTool,
  executeWriteTool,
  isWriteTool,
  type ReadToolName,
  runReadTool,
  type WriteToolName,
} from "@/lib/ai/tools";

/**
 * The CRM agent's turn loop. Protocol, enforced here (never trust the model
 * to self-limit) as well as the system prompt: any number of read tools may
 * run together immediately (RLS already scopes what they see), but at most
 * one write tool may be called, alone — breaking that rule gets an
 * instructional error and the loop retries with no client round-trip. Only a
 * lone write pauses the loop for confirmation. Result: at most one pending
 * confirmation at a time, and `messages` is the only state — held by the
 * client, this server is stateless.
 */

const SYSTEM_PROMPT = `You are the CRM assistant inside Synapse CRM, with read and write access to
the current user's accounts, contacts, leads, deals and activities — scoped
automatically to their organization; you cannot see or affect any other
organization's data.

Always search_records before acting on a record named in conversation — you
need its real id, never guess one. For deal stage changes, call
list_pipeline_stages first to get a real stageId.

Call read tools (search_records, get_record, list_pipeline_stages) as freely
as you need, including several in the same turn. Call write tools
(create_activity, create_task, update_deal_stage) **one at a time, alone** —
never combine a write with a read or another write in the same turn. Every
write requires the user's explicit confirmation before it takes effect, so
after proposing one, wait for the result before continuing.

Keep responses concise and concrete — this is a working sales tool, not a
chat companion. When you report on records, cite what you actually found via
the tools; don't guess or fill in gaps.`;

export type AgentEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; name: string; input: unknown }
  | { type: "tool-result"; id: string; name: string; summary: string }
  | { type: "confirmation-required"; id: string; name: string; input: unknown; description: string }
  | { type: "assistant-message"; content: Anthropic.Beta.BetaContentBlockParam[] }
  // Tool-result turns the server appended internally (auto-resolved reads, or
  // a confirmed/denied write). The client must persist these into its copy of
  // `messages` too — the next request replays the whole transcript, and the
  // API 400s if a tool_use block's matching tool_result is missing.
  | { type: "user-message"; content: Anthropic.Beta.BetaToolResultBlockParam[] }
  | { type: "done" }
  | { type: "error"; message: string };

type Emit = (event: AgentEvent) => void;

const MAX_ITERATIONS = 8;

/** Short, human-readable summary of a read tool's result, for the transcript. */
function summarizeReadResult(name: ReadToolName, result: unknown): string {
  if (name === "search_records" && result && typeof result === "object") {
    const counts = Object.entries(result as Record<string, unknown[]>)
      .map(([key, rows]) => `${rows.length} ${key}`)
      .join(", ");
    return `Found ${counts || "no matches"}`;
  }
  if (name === "list_pipeline_stages") return "Listed pipeline stages";
  return "Retrieved record";
}

/** Per the fallback-echo rule, drops thinking/redacted_thinking/tool_use blocks that
 * appear before a `fallback` marker (the fallback model never saw them). No-op
 * when the turn has no fallback block — the common case. */
function filterFallbackTurn(
  content: Anthropic.Beta.BetaContentBlockParam[],
): Anthropic.Beta.BetaContentBlockParam[] {
  const fallbackIndex = content.findIndex((block) => block.type === "fallback");
  if (fallbackIndex === -1) return content;

  return content.filter((block, index) => {
    if (index >= fallbackIndex) return true;
    return (
      block.type !== "thinking" && block.type !== "redacted_thinking" && block.type !== "tool_use"
    );
  });
}

export type AgentOutcome =
  | { status: "done" }
  | { status: "paused"; toolUseId: string; name: WriteToolName; input: unknown };

export class ConfirmationMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfirmationMismatchError";
  }
}

/**
 * Resolves a paused write confirmation and appends the result to `messages`.
 *
 * Ground truth for what's being confirmed comes from the tool_use block in the
 * caller-supplied transcript, not client-asserted fields — a client can only
 * approve/deny the call the model actually made. This server stays stateless
 * (no server-side record ties a confirmation id to what was proposed): the
 * same user could already perform any of these writes via the ordinary CRM
 * forms, so skipping the dialog isn't privilege escalation, just the same RLS
 * + role checks the underlying Server Actions already enforce. The remaining
 * threat — a third-party site forging this request — is covered by the
 * session cookie's SameSite=Lax default, same as Next.js Server Actions.
 */
export async function resolvePendingWrite(
  organizationId: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  toolUseId: string,
  decision: "allow" | "deny",
  emit: Emit,
): Promise<void> {
  const last = messages.at(-1);
  if (last?.role !== "assistant" || !Array.isArray(last.content)) {
    throw new ConfirmationMismatchError("No pending assistant turn to confirm.");
  }
  const block = last.content.find(
    (b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use" && b.id === toolUseId,
  );
  if (!block || !isWriteTool(block.name)) {
    throw new ConfirmationMismatchError("No matching pending write tool call found.");
  }

  const result: Anthropic.Beta.BetaToolResultBlockParam =
    decision === "deny"
      ? { type: "tool_result", tool_use_id: toolUseId, content: "The user declined this action." }
      : await (async () => {
          const outcome = await executeWriteTool(
            organizationId,
            block.name as WriteToolName,
            block.input,
          );
          return outcome.ok
            ? {
                type: "tool_result" as const,
                tool_use_id: toolUseId,
                content: JSON.stringify(outcome.result),
              }
            : {
                type: "tool_result" as const,
                tool_use_id: toolUseId,
                content: outcome.error,
                is_error: true,
              };
        })();

  messages.push({ role: "user", content: [result] });
  emit({ type: "user-message", content: [result] });
}

/** Runs the agent loop, mutating `messages` in place, until it finishes, pauses on a
 * write confirmation, or hits the iteration cap. */
export async function runAgent(
  organizationId: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  emit: Emit,
): Promise<AgentOutcome> {
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const stream = anthropic().beta.messages.stream({
      model: MODEL,
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      tools: ALL_TOOLS,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        emit({ type: "text-delta", text: event.delta.text });
      }
    }

    const final = await stream.finalMessage();

    if (final.stop_reason === "refusal") {
      emit({ type: "error", message: "Claude declined this request." });
      return { status: "done" };
    }

    const assistantContent = filterFallbackTurn(
      final.content as Anthropic.Beta.BetaContentBlockParam[],
    );
    messages.push({ role: "assistant", content: assistantContent });
    emit({ type: "assistant-message", content: assistantContent });

    if (final.stop_reason === "pause_turn") {
      // Server-side tool loop (e.g. an in-flight fallback) hit its own
      // iteration cap — resend as-is to let the API resume automatically.
      continue;
    }

    if (final.stop_reason !== "tool_use") {
      emit({ type: "done" });
      return { status: "done" };
    }

    const toolUses = assistantContent.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
    );
    const writes = toolUses.filter((block) => isWriteTool(block.name));
    const reads = toolUses.filter((block) => !isWriteTool(block.name));

    // The single-write-alone protocol violated: answer every read for real,
    // reject every write with instructional feedback, and loop — the model
    // corrects itself without a client round-trip.
    if (writes.length > 1 || (writes.length === 1 && reads.length > 0)) {
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of reads) {
        const result = await runReadTool(organizationId, block.name as ReadToolName, block.input);
        emit({ type: "tool-call", id: block.id, name: block.name, input: block.input });
        emit({
          type: "tool-result",
          id: block.id,
          name: block.name,
          summary: summarizeReadResult(block.name as ReadToolName, result),
        });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      for (const block of writes) {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content:
            "Write tools must be called alone, with no other tool call in the same turn. " +
            "Call your read tools first, review their results, then call this write tool by itself.",
          is_error: true,
        });
      }
      messages.push({ role: "user", content: results });
      emit({ type: "user-message", content: results });
      continue;
    }

    // Exactly one write, called alone: pause and ask for confirmation.
    if (writes.length === 1) {
      const block = writes[0];
      const description = await describeWriteTool(
        organizationId,
        block.name as WriteToolName,
        block.input,
      );
      emit({
        type: "confirmation-required",
        id: block.id,
        name: block.name,
        input: block.input,
        description,
      });
      return {
        status: "paused",
        toolUseId: block.id,
        name: block.name as WriteToolName,
        input: block.input,
      };
    }

    // Only reads: execute all, feed results back, loop.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of reads) {
      const result = await runReadTool(organizationId, block.name as ReadToolName, block.input);
      emit({ type: "tool-call", id: block.id, name: block.name, input: block.input });
      emit({
        type: "tool-result",
        id: block.id,
        name: block.name,
        summary: summarizeReadResult(block.name as ReadToolName, result),
      });
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: results });
    emit({ type: "user-message", content: results });
  }

  emit({ type: "error", message: "The agent took too many steps and was stopped." });
  return { status: "done" };
}
