import { embedSourceRecord } from "@/lib/ai/embed";
import { type Events, inngest } from "@/lib/inngest/client";

/**
 * Re-embeds one record on change. Phase 6 fires this from the create/update
 * Server Actions for accounts, contacts, deals and activities — replacing
 * today's manual "Rebuild search index" button (lib/ai/embed.ts
 * backfillEmbeddings) with incremental, on-write indexing. The manual button
 * stays useful afterward as a full-reindex escape hatch.
 */
export const embedSourceOnChange = inngest.createFunction(
  { id: "embed-source-on-change", triggers: [{ event: "embedding/source.changed" }] },
  async ({ event, step }) => {
    const { organizationId, sourceType, sourceId } =
      event.data as Events["embedding/source.changed"]["data"];
    await step.run("embed-source", () => embedSourceRecord(organizationId, sourceType, sourceId));
  },
);
