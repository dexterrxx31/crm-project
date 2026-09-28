import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/** Rate limiters for this app. Every one returns unlimited (never throws) when
 * Upstash isn't configured, like every other optional integration here. */
let redis: Redis | null | undefined;

function redisClient(): Redis | null {
  if (redis !== undefined) return redis;
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = env();
  redis =
    UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN
      ? new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN })
      : null;
  return redis;
}

export type RateLimitResult = { success: boolean; remaining: number; reset: number };

const UNLIMITED: RateLimitResult = { success: true, remaining: Number.POSITIVE_INFINITY, reset: 0 };

async function check(limiter: Ratelimit | null, key: string): Promise<RateLimitResult> {
  if (!limiter) return UNLIMITED;
  try {
    return await limiter.limit(key);
  } catch (error) {
    // Upstash being unreachable shouldn't take the gated feature down with it.
    console.warn("[rate-limit] Upstash request failed, allowing through", error);
    return UNLIMITED;
  }
}

let aiLimiter: Ratelimit | null | undefined;

/** Per-org rate limit for /api/ai/* — caps agent-loop cost before any model call. */
export async function checkAiRateLimit(organizationId: string): Promise<RateLimitResult> {
  if (aiLimiter === undefined) {
    const client = redisClient();
    aiLimiter = client
      ? new Ratelimit({
          redis: client,
          limiter: Ratelimit.slidingWindow(20, "60 s"),
          prefix: "synapse-crm:ai",
        })
      : null;
  }
  return check(aiLimiter, organizationId);
}

let authLimiter: Ratelimit | null | undefined;

/** Per-IP rate limit for sign-in/sign-up — the only brute-force guard these Server
 * Actions have, since they run before any session/org context exists to key by. */
export async function checkAuthRateLimit(ip: string): Promise<RateLimitResult> {
  if (authLimiter === undefined) {
    const client = redisClient();
    authLimiter = client
      ? new Ratelimit({
          redis: client,
          limiter: Ratelimit.slidingWindow(10, "60 s"),
          prefix: "synapse-crm:auth",
        })
      : null;
  }
  return check(authLimiter, ip);
}
