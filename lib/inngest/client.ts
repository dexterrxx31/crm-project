import { Inngest } from "inngest";

/** Event payloads the CRM emits. `data.organizationId` is what each function in
 * lib/inngest/functions/ uses to open its tenant-scoped (RLS) transaction. */
export type Events = {
  "lead/scoring.requested": { data: { organizationId: string; leadId: string } };
  "deal/scoring.requested": { data: { organizationId: string; dealId: string } };
  "embedding/source.changed": {
    data: {
      organizationId: string;
      sourceType: "account" | "contact" | "deal" | "activity";
      sourceId: string;
    };
  };
};

export const inngest = new Inngest({ id: "synapse-crm" });

/** Fire-and-forget event send for Server Actions. Swallows failures (e.g. the Inngest
 * dev server not running) — embedding/scoring staying in sync is a nice-to-have,
 * never something that should break saving a record. */
export async function notify<K extends keyof Events>(
  name: K,
  data: Events[K]["data"],
): Promise<void> {
  try {
    await inngest.send({ name, data });
  } catch (error) {
    console.warn(`[inngest] failed to send "${name}" — is the Inngest dev server running?`, error);
  }
}
