import { scoreLead } from "@/lib/ai/scoring";
import { type Events, inngest } from "@/lib/inngest/client";

/** Scores a lead in the background. Triggered on create/update (lib/actions/leads.ts)
 * and by the nightly sweep — a thin durability wrapper around `scoreLead()`. */
export const scoreLeadOnRequest = inngest.createFunction(
  { id: "score-lead-on-request", triggers: [{ event: "lead/scoring.requested" }] },
  async ({ event, step }) => {
    const { organizationId, leadId } = event.data as Events["lead/scoring.requested"]["data"];
    return step.run("score-lead", () => scoreLead(organizationId, leadId));
  },
);
