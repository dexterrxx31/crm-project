import { scoreLead } from "@/lib/ai/scoring";
import { type Events, inngest } from "@/lib/inngest/client";

/**
 * Scores a lead in the background. Not yet wired to fire automatically —
 * Phase 6 adds the on-change trigger (`inngest.send()` from the create/update
 * lead actions) and a nightly cron sweep over open leads. Until then, trigger
 * manually via `inngest.send({ name: "lead/scoring.requested", ... })` from
 * the Inngest dev server UI, or call `scoreLead()` directly — this function
 * is a thin durability wrapper around that same call.
 */
export const scoreLeadOnRequest = inngest.createFunction(
  { id: "score-lead-on-request", triggers: [{ event: "lead/scoring.requested" }] },
  async ({ event, step }) => {
    const { organizationId, leadId } = event.data as Events["lead/scoring.requested"]["data"];
    return step.run("score-lead", () => scoreLead(organizationId, leadId));
  },
);
