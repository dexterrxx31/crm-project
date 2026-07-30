import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/**
 * Per-organization rate limit for `/api/ai/*` — a chat turn can trigger a
 * multi-step agent loop with several Claude calls, so this is the cheapest
 * place to cap cost/abuse, ahead of any individual model call.
 *
 * Without Upstash configured (the local-dev default — see `.env.example`),
 * `limiter()` returns null and every caller treats that as "unlimited": AI
 * routes must work without a Redis account, same as they work without an
 * Anthropic key.
 */
let cached: Ratelimit | null | undefined;

function limiter(): Ratelimit | null {
  if (cached !== undefined) return cached;

  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = env();
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    cached = null;
    return cached;
  }

  cached = new Ratelimit({
    redis: new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN }),
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    prefix: "synapse-crm:ai",
  });
  return cached;
}

export type RateLimitResult = { success: boolean; remaining: number; reset: number };

/** Call once per `/api/ai/*` request, keyed by organization. */
export async function checkAiRateLimit(organizationId: string): Promise<RateLimitResult> {
  const rl = limiter();
  if (!rl) return { success: true, remaining: Number.POSITIVE_INFINITY, reset: 0 };

  try {
    const { success, remaining, reset } = await rl.limit(organizationId);
    return { success, remaining, reset };
  } catch (error) {
    // Upstash being unreachable shouldn't take AI features down with it.
    console.warn("[rate-limit] Upstash request failed, allowing through", error);
    return { success: true, remaining: Number.POSITIVE_INFINITY, reset: 0 };
  }
}
