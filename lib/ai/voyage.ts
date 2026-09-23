import { hasVoyageKey } from "@/lib/env";

/**
 * Minimal Voyage AI client. Anthropic has no embeddings endpoint, so semantic
 * search and dedupe go through Voyage's HTTP API directly — there's no
 * official SDK to depend on, and the surface we need is one endpoint.
 */
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3" as const;

export class VoyageNotConfiguredError extends Error {
  constructor() {
    super("Semantic search is not configured. Set VOYAGE_API_KEY to enable it.");
    this.name = "VoyageNotConfiguredError";
  }
}

type VoyageResponse = {
  data: { embedding: number[]; index: number }[];
};

/** Embeds a batch of strings, preserving input order in the returned array. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!hasVoyageKey()) throw new VoyageNotConfiguredError();

  const response = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: "document" }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Voyage embeddings request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as VoyageResponse;
  const ordered = [...json.data].sort((a, b) => a.index - b.index);
  return ordered.map((entry) => entry.embedding);
}

/** Embeds a single string. Search queries use `input_type: "query"` per Voyage's guidance. */
export async function embedQuery(text: string): Promise<number[]> {
  if (!hasVoyageKey()) throw new VoyageNotConfiguredError();

  const response = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [text], model: MODEL, input_type: "query" }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Voyage embeddings request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const json = (await response.json()) as VoyageResponse;
  const [first] = json.data;
  if (!first) throw new Error("Voyage returned no embedding for the query");
  return first.embedding;
}
