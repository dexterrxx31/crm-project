import { embedSourceRecord } from "@/lib/ai/embed";
import { type Events, inngest } from "@/lib/inngest/client";

/** Re-embeds one record on change — fired from the create/update Server Actions for
 * accounts, contacts, deals and activities. The manual "Rebuild search index" button
 * (lib/ai/embed.ts backfillEmbeddings) stays as a full-reindex escape hatch. */
export const embedSourceOnChange = inngest.createFunction(
  { id: "embed-source-on-change", triggers: [{ event: "embedding/source.changed" }] },
  async ({ event, step }) => {
    const { organizationId, sourceType, sourceId } =
      event.data as Events["embedding/source.changed"]["data"];
    await step.run("embed-source", () => embedSourceRecord(organizationId, sourceType, sourceId));
  },
);
