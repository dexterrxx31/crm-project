import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenantDb: vi.fn(),
  rateLimit: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  requireOrgContext: async () => ({ organizationId: "org-a", userId: "user-a", role: "owner" }),
  roleAtLeast: () => true,
}));
vi.mock("@/lib/db/tenant", () => ({ tenantDb: mocks.tenantDb }));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: mocks.rateLimit }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/inngest/client", () => ({ notify: vi.fn(), inngest: { send: mocks.send } }));
vi.mock("@/lib/realtime", () => ({ publishDealBoardEvent: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createActivity } from "@/lib/actions/activities";
import {
  backfillEmbeddingsAction,
  scoreLeadAction,
  summarizeAccountAction,
} from "@/lib/actions/ai";
import { createContact, updateContact } from "@/lib/actions/contacts";
import { createDeal } from "@/lib/actions/deals";
import { convertLead } from "@/lib/actions/leads";

const id = "3fbf1e6a-0000-4000-8000-000000000000";
const otherId = "3fbf1e6a-0000-4000-8000-000000000001";

function transaction(rows: unknown[][]) {
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally thenable.
    then(resolve: (value: unknown[]) => unknown) {
      return Promise.resolve(rows.shift() ?? []).then(resolve);
    },
  };
  const write = {
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id, relatedType: "contact", relatedId: id }]),
  };
  const tx = {
    select: vi.fn(() => query),
    insert: vi.fn(() => write),
    update: vi.fn(() => write),
  };
  mocks.tenantDb.mockImplementation(async (organizationId, fn) => {
    expect(organizationId).toBe("org-a");
    return fn(tx);
  });
  return { tx, query, write };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("VOYAGE_API_KEY", "");
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.send.mockResolvedValue({ ids: ["event-id"] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("tenant relationships", () => {
  it("rejects a contact whose account is not visible in the tenant", async () => {
    const { tx } = transaction([[]]);
    const result = await createContact({ firstName: "Ada", lastName: "Lovelace", accountId: id });
    expect(result?.serverError).toBeDefined();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("creates a contact with a visible account", async () => {
    const { tx } = transaction([[{ id }]]);
    const result = await createContact({ firstName: "Ada", lastName: "Lovelace", accountId: id });
    expect(result?.data).toEqual({ id });
    expect(tx.insert).toHaveBeenCalledOnce();
  });

  it("allows an unlinked contact", async () => {
    const { tx } = transaction([]);
    const result = await createContact({ firstName: "Ada", lastName: "Lovelace" });
    expect(result?.data).toEqual({ id });
    expect(tx.select).not.toHaveBeenCalled();
  });

  it("rejects a deal with an invisible contact before writing", async () => {
    const { tx } = transaction([[{ id }], []]);
    const result = await createDeal({
      name: "Deal",
      accountId: id,
      contactId: otherId,
      stageId: id,
      amount: "5",
    });
    expect(result?.serverError).toBeDefined();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects an activity on an invisible subject", async () => {
    const { tx } = transaction([[]]);
    const result = await createActivity({
      type: "note",
      subject: "Note",
      relatedType: "lead",
      relatedId: id,
    });
    expect(result?.serverError).toBeDefined();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("writes null when clearing a contact account and email", async () => {
    const { write } = transaction([[{ id, accountId: otherId, email: "ada@example.com" }]]);
    const result = await updateContact({
      id,
      firstName: "Ada",
      lastName: "Lovelace",
      accountId: "none",
      email: "",
    });
    expect(result?.data).toEqual({ id });
    expect(write.set).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: null, email: null }),
    );
  });
});

describe("lead conversion", () => {
  it("locks the lead and rejects an already converted record before creating records", async () => {
    const { tx, query } = transaction([[{ id, status: "converted" }]]);
    const result = await convertLead({ id, accountName: "Acme", createDeal: false });
    expect(result?.serverError).toBeDefined();
    expect(query.for).toHaveBeenCalledWith("update");
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe("AI actions", () => {
  it("queues scoring instead of calling the model", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    transaction([[{ id }]]);
    const result = await scoreLeadAction({ leadId: id });
    expect(result?.data).toEqual({ ok: true, queued: true });
    expect(mocks.send).toHaveBeenCalledWith({
      name: "lead/scoring.requested",
      data: { organizationId: "org-a", leadId: id },
    });
  });

  it("does not queue scoring for an invisible lead", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    transaction([[]]);
    const result = await scoreLeadAction({ leadId: id });
    expect(result?.data?.ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("returns a configuration message without queueing when the model key is missing", async () => {
    const result = await scoreLeadAction({ leadId: id });
    expect(result?.data).toEqual({ ok: false, message: expect.stringContaining("not configured") });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("applies the organization rate limit before any AI work", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    const result = await backfillEmbeddingsAction({});
    expect(result?.serverError).toContain("Too many requests");
    expect(mocks.rateLimit).toHaveBeenCalledWith("org-a");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("queues search indexing", async () => {
    vi.stubEnv("VOYAGE_API_KEY", "test-key");
    const result = await backfillEmbeddingsAction({});
    expect(result?.data).toEqual({ ok: true, queued: true });
    expect(mocks.send).toHaveBeenCalledWith({
      name: "embedding/backfill.requested",
      data: { organizationId: "org-a" },
    });
  });

  it("reports failed queue submission without exposing provider details", async () => {
    vi.stubEnv("VOYAGE_API_KEY", "test-key");
    mocks.send.mockRejectedValue(new Error("secret-provider-details"));
    const result = await backfillEmbeddingsAction({});
    expect(result?.data).toEqual({ ok: false, message: "Something went wrong." });
    expect(console.error).toHaveBeenCalled();
  });

  it("sanitizes unexpected database failures from interactive AI", async () => {
    mocks.tenantDb.mockRejectedValue(new Error("private SQL and connection details"));
    const result = await summarizeAccountAction({ accountId: id });
    expect(result?.data).toEqual({ ok: false, message: "Something went wrong." });
  });
});
