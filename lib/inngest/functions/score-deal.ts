import { scoreDealHealth } from "@/lib/ai/scoring";
import { type Events, inngest } from "@/lib/inngest/client";

/**
 * Scores deal health in the background. See score-lead.ts for the trigger
 * wiring that Phase 6 adds (on-change + nightly cron over open deals).
 */
export const scoreDealOnRequest = inngest.createFunction(
  { id: "score-deal-on-request", triggers: [{ event: "deal/scoring.requested" }] },
  async ({ event, step }) => {
    const { organizationId, dealId } = event.data as Events["deal/scoring.requested"]["data"];
    return step.run("score-deal", () => scoreDealHealth(organizationId, dealId));
  },
);
