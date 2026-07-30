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

/**
 * Fire-and-forget event send, for calling from Server Actions.
 *
 * Local dev is two processes — `bun dev` and `bun run inngest:dev` — and
 * it's easy to only run the first. `inngest.send()` would then fail (no
 * dev server to receive it); embedding and scoring staying in sync is a
 * nice-to-have, not something that should ever break saving a contact. This
 * swallows that failure (logged, not thrown) rather than letting it
 * propagate into the calling action's result.
 */
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
