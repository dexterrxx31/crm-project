import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMock = vi.fn().mockResolvedValue(undefined);
const transactionMock = vi.fn(async (fn: (tx: unknown) => unknown) => fn({ execute: executeMock }));

vi.mock("@/lib/db", () => ({
  db: { transaction: transactionMock },
}));

const { tenantDb } = await import("@/lib/db/tenant");

describe("tenantDb", () => {
  beforeEach(() => {
    transactionMock.mockClear();
    executeMock.mockClear();
  });

  it("throws without running a transaction when organizationId is empty", async () => {
    await expect(tenantDb("", async () => "unreachable")).rejects.toThrow(
      "tenantDb called without an organization id",
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("sets the RLS session variable before running the callback", async () => {
    const order: string[] = [];
    executeMock.mockImplementationOnce(() => {
      order.push("set_config");
      return Promise.resolve(undefined);
    });

    const result = await tenantDb("org-123", async () => {
      order.push("callback");
      return "ok";
    });

    expect(result).toBe("ok");
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(executeMock).toHaveBeenCalledOnce();
    expect(order).toEqual(["set_config", "callback"]);
  });

  it("scopes set_config to the organization id passed in", async () => {
    await tenantDb("org-456", async () => null);

    const [query] = executeMock.mock.calls[0] as [{ queryChunks: unknown[] }];
    const text = query.queryChunks
      .map((chunk) => (typeof chunk === "string" ? chunk : (chunk as { value: string[] }).value[0]))
      .join("");
    expect(text).toContain("app.current_organization_id");
    expect(query.queryChunks).toContain("org-456");
  });

  it("propagates the transaction's own scoping to the callback's tx argument", async () => {
    let receivedTx: unknown;
    await tenantDb("org-789", async (tx) => {
      receivedTx = tx;
      return null;
    });

    expect(receivedTx).toHaveProperty("execute");
  });
});
