/**
 * Wraps an event-emitting async function in an SSE `Response`.
 *
 * Not a token-delta-only stream — each `data:` line is one whole JSON event
 * (see `AgentEvent` in lib/ai/agent.ts), so the client parses discrete
 * events rather than reassembling partial JSON.
 */
export function sseResponse(run: (emit: (event: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await run(emit);
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : "Unknown error" });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables buffering on nginx-fronted deployments so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
