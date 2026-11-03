import { backfillEmbeddings } from "@/lib/ai/embed";
import { hasVoyageKey } from "@/lib/env";
import { type Events, inngest } from "@/lib/inngest/client";

export const backfillEmbeddingsOnRequest = inngest.createFunction(
  { id: "backfill-embeddings", triggers: [{ event: "embedding/backfill.requested" }] },
  async ({ event, step }) => {
    if (!hasVoyageKey()) return { skipped: true };
    const { organizationId } = event.data as Events["embedding/backfill.requested"]["data"];
    return step.run("backfill-embeddings", () => backfillEmbeddings(organizationId));
  },
);
