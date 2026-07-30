import { Inngest } from "inngest";

/**
 * Event payloads the CRM emits. Each event's `data.organizationId` is what
 * every function in lib/inngest/functions/ uses to open its tenant-scoped
 * transaction — the same RLS boundary the rest of the app relies on, not a
 * separate trust model for background work.
 *
 * Not wired into the `Inngest` client generic — this SDK version's typed-event
 * story (event schemas passed to the client constructor) didn't resolve
 * cleanly against the installed version, so each function annotates its own
 * event payload from this type instead. Functional either way; only the
 * "mistyped event.data" compile-time check is what's missing.
 */
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
