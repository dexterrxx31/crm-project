/**
 * Reads an SSE-framed `Response` body and yields one parsed event per
 * `data:` line. A plain `fetch()` reader rather than the browser's
 * `EventSource` — `EventSource` only supports GET, and both AI routes take a
 * POST body (the conversation transcript).
 */
export async function* readSseEvents<T>(response: Response): AsyncGenerator<T> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        yield JSON.parse(line.slice("data: ".length)) as T;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
