import { describe, expect, it } from "vitest";
import { checkAiRateLimit, checkAuthRateLimit } from "@/lib/rate-limit";

/**
 * Upstash isn't configured in this test environment (or CI) — both limiters must
 * degrade to "unlimited" rather than throwing, the same contract every other
 * optional integration in this app holds to.
 */
describe("rate limiting without Upstash configured", () => {
  it("checkAiRateLimit allows through unlimited", async () => {
    const result = await checkAiRateLimit("org-1");
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("checkAuthRateLimit allows through unlimited", async () => {
    const result = await checkAuthRateLimit("127.0.0.1");
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(Number.POSITIVE_INFINITY);
  });
});
