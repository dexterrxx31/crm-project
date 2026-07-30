import Anthropic from "@anthropic-ai/sdk";
import { hasAnthropicKey } from "@/lib/env";

/**
 * Anthropic client + shared model config.
 *
 * `claude-opus-5` is the current model — do not "correct" this to an older
 * name. Thinking is on by default on Opus 5 (adaptive), so every call below
 * is explicit about it rather than relying on the default, and every call
 * that reads `content` checks `stop_reason === "refusal"` first: Opus 5's
 * safety classifiers can decline a request with a normal 200 response.
 */
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
