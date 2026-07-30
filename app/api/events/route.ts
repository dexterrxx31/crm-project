import { requireOrgContext } from "@/lib/auth-context";
import { subscribeToDealBoard } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Long-lived SSE connection for realtime deal-board sync. Unlike the AI chat
 * routes (request-scoped: one turn, then the stream ends), this stays open
 * until the client disconnects — the deal board subscribes once per page
 * visit and expects a live feed for as long as it's mounted.
 */
export async function GET(request: Request) {
  const context = await requireOrgContext().catch(() => null);
  if (!context) {
    return new Response(JSON.stringify({ error: "Not signed in." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // Already closed by the other race arm (client abort vs. our own cleanup) — fine.
        }
      };

      request.signal.addEventListener("abort", close);

      // Comment lines (`:` prefix) are valid, ignorable SSE — keeps
      // intermediary proxies and the browser's own idle timeout from
      // treating a quiet connection as dead.
      heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_MS);

      try {
        unsubscribe = await subscribeToDealBoard(context.organizationId, (event) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        });
      } catch (error) {
        if (!closed) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "Realtime unavailable" })}\n\n`,
            ),
          );
          console.error("[realtime] failed to subscribe to deal board channel", error);
        }
      }
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
