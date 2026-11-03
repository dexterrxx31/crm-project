import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type JobContext = {
  event: {
    data: {
      organizationId: string;
      leadId?: string;
      dealId?: string;
      sourceType?: string;
      sourceId?: string;
    };
  };
  step: { run: (name: string, fn: () => unknown) => unknown };
};
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (ctx: JobContext) => Promise<unknown>>(),
  scoreLead: vi.fn(),
  scoreDeal: vi.fn(),
  embedSource: vi.fn(),
  backfill: vi.fn(),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: (config: { id: string }, handler: (ctx: JobContext) => Promise<unknown>) => {
      mocks.handlers.set(config.id, handler);
      return handler;
    },
  },
}));
vi.mock("@/lib/ai/scoring", () => ({
  scoreLead: mocks.scoreLead,
  scoreDealHealth: mocks.scoreDeal,
}));
vi.mock("@/lib/ai/embed", () => ({
  embedSourceRecord: mocks.embedSource,
  backfillEmbeddings: mocks.backfill,
}));

import "@/lib/inngest/functions/score-lead";
import "@/lib/inngest/functions/score-deal";
import "@/lib/inngest/functions/embed-source";
import "@/lib/inngest/functions/backfill-embeddings";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("VOYAGE_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("optional AI background jobs", () => {
  it.each([
    ["score-lead-on-request", "ANTHROPIC_API_KEY"],
    ["score-deal-on-request", "ANTHROPIC_API_KEY"],
    ["embed-source-on-change", "VOYAGE_API_KEY"],
    ["backfill-embeddings", "VOYAGE_API_KEY"],
  ])("skips %s without its API key", async (name) => {
    const run = vi.fn();
    const result = await mocks.handlers.get(name)?.({
      event: { data: { organizationId: "org-a" } },
      step: { run },
    });
    expect(result).toEqual({ skipped: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("executes a configured backfill in a durable step with the event tenant", async () => {
    vi.stubEnv("VOYAGE_API_KEY", "test-key");
    mocks.backfill.mockResolvedValue({ accounts: 1, contacts: 0, deals: 0, activities: 0 });
    const run = vi.fn(async (_name, fn) => fn());
    const result = await mocks.handlers.get("backfill-embeddings")?.({
      event: { data: { organizationId: "org-a" } },
      step: { run },
    });
    expect(result).toEqual({ accounts: 1, contacts: 0, deals: 0, activities: 0 });
    expect(mocks.backfill).toHaveBeenCalledWith("org-a");
  });
});
