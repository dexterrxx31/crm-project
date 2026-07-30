import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from "next-safe-action";
import { z } from "zod";
import { type OrgContext, type OrgRole, requireOrgContext, roleAtLeast } from "@/lib/auth-context";
import { type TenantTx, tenantDb } from "@/lib/db/tenant";

/**
 * Base client. Server errors are logged in full but returned to the browser as
 * a generic message so internal details (SQL, connection strings) never reach a
 * client payload.
 */
export const actionClient = createSafeActionClient({
  defineMetadataSchema: () =>
    z.object({
      /** Human-readable name used in logs and the audit trail. */
      name: z.string(),
      /** Minimum role required. Defaults to "member" when omitted. */
      requiredRole: z.enum(["owner", "admin", "member"]).optional(),
    }),
  handleServerError(error, { metadata }) {
    console.error(`[action:${metadata?.name ?? "unknown"}]`, error);

    if (error.message === "UNAUTHORIZED") return "You are not signed in.";
    if (error.message === "FORBIDDEN") return "You do not have permission to do that.";

    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});

export type OrgActionContext = OrgContext & {
  /** Tenant-scoped transaction runner. All DB access must go through this. */
  withTenant: <T>(fn: (tx: TenantTx) => Promise<T>) => Promise<T>;
};

/**
 * The action client every mutation should use.
 *
 * Resolves the caller's organization, enforces the role declared in metadata,
 * and hands down a `withTenant` helper that opens a transaction with the
 * Postgres tenant variable set — the same variable the RLS policies read.
 */
export const orgAction = actionClient.use(async ({ next, metadata }) => {
  const context = await requireOrgContext();

  const required: OrgRole = metadata?.requiredRole ?? "member";
  if (!roleAtLeast(context.role, required)) {
    throw new Error("FORBIDDEN");
  }

  const ctx: OrgActionContext = {
    ...context,
    withTenant: (fn) => tenantDb(context.organizationId, fn),
  };

  return next({ ctx });
});
