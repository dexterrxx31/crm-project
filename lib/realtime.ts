import { sql } from "@/lib/db";

/** One shared Postgres LISTEN/NOTIFY channel for the deal board (app/api/events/route.ts
 * filters by organizationId before anything reaches a browser) — simpler than a channel
 * per org, and no less safe. */
const CHANNEL = "deal_board";

export type DealBoardEvent =
  | { type: "deal.moved"; dealId: string; stageId: string }
  | { type: "deal.closed"; dealId: string }
  | { type: "deal.deleted"; dealId: string };

export async function publishDealBoardEvent(
  organizationId: string,
  event: DealBoardEvent,
): Promise<void> {
  try {
    await sql.notify(CHANNEL, JSON.stringify({ organizationId, ...event }));
  } catch (error) {
    // Same posture as lib/inngest/client.ts's notify(): realtime sync is a
    // nice-to-have, never something that should fail the mutation that
    // triggered it.
    console.warn("[realtime] failed to publish deal board event", error);
  }
}

export type DealBoardPayload = { organizationId: string } & DealBoardEvent;

/**
 * Subscribes to the shared channel and returns an unsubscribe function.
 * `onEvent` receives only payloads matching `organizationId` — the filter
 * lives here, not in the route handler, so every caller gets it for free.
 */
export async function subscribeToDealBoard(
  organizationId: string,
  onEvent: (event: DealBoardEvent) => void,
): Promise<() => Promise<void>> {
  const listener = await sql.listen(CHANNEL, (raw) => {
    let payload: DealBoardPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.organizationId !== organizationId) return;
    const { organizationId: _omit, ...event } = payload;
    onEvent(event);
  });

  return () => listener.unlisten();
}
