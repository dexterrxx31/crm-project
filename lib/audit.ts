import { auditLog } from "@/lib/db/schema";
import type { TenantTx } from "@/lib/db/tenant";

/**
 * Appends an audit entry. Called inside the same tenant transaction as the
 * mutation it describes, so an audit row can never survive a rolled-back write.
 */
export async function recordAudit(
  tx: TenantTx,
  entry: {
    organizationId: string;
    actorId: string;
    action: "create" | "update" | "delete" | "convert" | "close";
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.insert(auditLog).values({
    organizationId: entry.organizationId,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
