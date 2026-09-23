import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/** Per-org rate limit for /api/ai/* — caps agent-loop cost before any model call.
 * Returns null (unlimited) when Upstash isn't configured, like every other optional
 * integration here. */
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
