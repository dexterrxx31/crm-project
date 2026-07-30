import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ConfirmationMismatchError, resolvePendingWrite, runAgent } from "@/lib/ai/agent";
import { AiNotConfiguredError } from "@/lib/ai/client";
import { sseResponse } from "@/lib/ai/sse";
import { requireOrgContext } from "@/lib/auth-context";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { chatConfirmSchema } from "@/lib/validators/ai";

/**
 * Resolves a paused write confirmation, then continues the agent loop.
 * `messages` must be the transcript exactly as the client received it,
 * ending in the assistant turn that proposed the write — see
 * lib/ai/agent.ts's resolvePendingWrite for why ground truth comes from
 * that transcript rather than separately client-asserted fields.
 */
export async function POST(request: Request) {
  const context = await requireOrgContext().catch(() => null);
  if (!context) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const rateLimit = await checkAiRateLimit(context.organizationId);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = chatConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  return sseResponse(async (emit) => {
    const messages = parsed.data.messages as unknown as Anthropic.Beta.BetaMessageParam[];

    try {
      await resolvePendingWrite(
        context.organizationId,
        messages,
        parsed.data.toolUseId,
        parsed.data.decision,
        emit,
      );
    } catch (error) {
      if (error instanceof ConfirmationMismatchError) {
        emit({ type: "error", message: error.message });
        return;
      }
      throw error;
    }

    try {
      await runAgent(context.organizationId, messages, emit);
    } catch (error) {
      if (error instanceof AiNotConfiguredError) {
        emit({ type: "error", message: error.message });
        return;
      }
      throw error;
    }
  });
}
