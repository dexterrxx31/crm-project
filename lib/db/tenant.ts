import { sql as raw } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";

/**
 * A transaction that has been scoped to one organization.
 *
 * Every read and write in the app goes through `tenantDb`. The tenant filter
 * lives in Postgres (see lib/db/rls.sql), not in application `where` clauses,
 * so forgetting one yields an empty result instead of another tenant's data.
 */
// biome-ignore lint/suspicious/noExplicitAny: drizzle's transaction generics are not worth reproducing here
export type TenantTx = PgTransaction<any, any, any>;

/**
 * Runs `fn` inside a transaction with `app.current_organization_id` set.
 *
 * `set_config(..., true)` is transaction-local, so the scope cannot leak to
 * another request that later borrows the same pooled connection — which is
 * exactly why this must be a transaction and not a bare `SET`.
 */
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
