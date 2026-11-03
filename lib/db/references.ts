import { eq } from "drizzle-orm";
import { accounts, contacts, deals, leads } from "@/lib/db/schema";
import type { TenantTx } from "@/lib/db/tenant";

const subjectTables = { account: accounts, contact: contacts, lead: leads, deal: deals };

/** RLS must verify linked records too; foreign keys only verify that an ID exists. */
export async function requireTenantRecord(
  tx: TenantTx,
  type: keyof typeof subjectTables,
  id: string | null | undefined,
): Promise<void> {
  if (id == null) return;
  const table = subjectTables[type];
  const [record] = await tx
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, id))
    .limit(1)
    .for("key share");
  if (!record) throw new Error("NOT_FOUND");
}
