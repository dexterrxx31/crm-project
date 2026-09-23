import { describe, expect, it } from "vitest";
import { scoreOutputSchema } from "@/lib/ai/scoring";

/** The contract between "whatever Claude returns" and the rest of the app — worth
 * pinning down directly rather than only through a live model call. */
describe("scoreOutputSchema", () => {
  it("accepts a well-formed score", () => {
    const result = scoreOutputSchema.safeParse({
      score: 72,
      reasoning: "Named decision-maker, referral source, recent engagement.",
      nextAction: "Schedule a demo this week.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a score above 100", () => {
    const result = scoreOutputSchema.safeParse({
      score: 101,
      reasoning: "x",
      nextAction: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative score", () => {
    const result = scoreOutputSchema.safeParse({
      score: -1,
      reasoning: "x",
      nextAction: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer score", () => {
    const result = scoreOutputSchema.safeParse({
      score: 50.5,
      reasoning: "x",
      nextAction: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty reasoning string", () => {
    const result = scoreOutputSchema.safeParse({
      score: 50,
      reasoning: "",
      nextAction: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing nextAction", () => {
    const result = scoreOutputSchema.safeParse({
      score: 50,
      reasoning: "x",
    });
    expect(result.success).toBe(false);
  });
});
