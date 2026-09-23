import { sql as raw } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";

/** Every read/write goes through `tenantDb` — the tenant filter lives in Postgres RLS
 * (lib/db/rls.sql), so a missing `where` yields an empty result, not another tenant's data. */
// biome-ignore lint/suspicious/noExplicitAny: drizzle's transaction generics are not worth reproducing here
export type TenantTx = PgTransaction<any, any, any>;

/** Runs `fn` with `app.current_organization_id` set. Must be a transaction, not a bare
 * `SET` — `set_config(..., true)` is transaction-local so it can't leak onto a later
 * request that borrows the same pooled connection. */
export async function tenantDb<T>(
  organizationId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!organizationId) {
    throw new Error("tenantDb called without an organization id");
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      raw`select set_config('app.current_organization_id', ${organizationId}, true)`,
    );
    return fn(tx as TenantTx);
  });
}
