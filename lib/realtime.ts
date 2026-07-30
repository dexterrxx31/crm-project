import { sql } from "@/lib/db";

/**
 * Postgres LISTEN/NOTIFY-backed realtime for the deal board, so a stage
 * move in one tab (or one teammate's browser) shows up in another without a
 * reload. One fixed channel for the whole database — NOTIFY payloads are
 * tagged with `organizationId`, and the SSE route (app/api/events/route.ts)
 * filters to the connected user's org before anything reaches the browser.
 * A shared channel with server-side filtering is simpler than one channel
 * per org (which would need the org id quoted into an identifier) and no
 * less safe: nothing organization-specific beyond an id and a stage id ever
 * rides on the wire unfiltered.
 */
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
