import Anthropic from "@anthropic-ai/sdk";
import { hasAnthropicKey } from "@/lib/env";

/** `claude-opus-5` is current — do not "correct" it to an older name. Every call
 * checks `stop_reason === "refusal"` before reading `content`: a decline can come
 * back as a normal 200. */
export const MODEL = "claude-opus-5" as const;

/** Server-side fallback: on a policy decline, retry on Anthropic's recommended substitute. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

let cached: Anthropic | undefined;

/** Throws with a message safe to show a user if no key is configured. */
export function anthropic(): Anthropic {
  if (!hasAnthropicKey()) {
    throw new AiNotConfiguredError();
  }
  if (!cached) {
    cached = new Anthropic();
  }
  return cached;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI features are not configured. Set ANTHROPIC_API_KEY to enable them.");
    this.name = "AiNotConfiguredError";
  }
}

export class AiRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(
      category
        ? `Claude declined this request (category: ${category}).`
        : "Claude declined this request.",
    );
    this.name = "AiRefusalError";
  }
}
