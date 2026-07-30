import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai/agent";
import { AiNotConfiguredError } from "@/lib/ai/client";
import { sseResponse } from "@/lib/ai/sse";
import { requireOrgContext } from "@/lib/auth-context";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { chatRequestSchema } from "@/lib/validators/ai";

/**
 * Starts or continues a chat turn. Stateless: the client owns `messages`
 * (the full Anthropic-format transcript) and resends it every call — see
 * lib/ai/agent.ts for why, and for the "user-message" events that must be
 * folded back into that transcript alongside "assistant-message" ones.
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
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  return sseResponse(async (emit) => {
    try {
      const messages = parsed.data.messages as unknown as Anthropic.Beta.BetaMessageParam[];
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
