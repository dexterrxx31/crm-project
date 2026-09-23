import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization, session as sessionTable } from "@/lib/db/schema";

export type OrgRole = "owner" | "admin" | "member";

export type OrgContext = {
  userId: string;
  userName: string;
  userEmail: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgRole;
};

/**
 * Resolves the caller's session and active organization. `cache()` dedupes this
 * per render pass. Returns null when unauthenticated or with no membership —
 * callers decide whether that's a redirect or an error.
 */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) return null;

  const userId = result.user.id;

  // Falls back to the user's own membership if the session has no active org yet
  // (first login, or a stale session), then repairs the session for next time.
  let organizationId = result.session?.activeOrganizationId ?? null;

  const memberships = await db.select().from(member).where(eq(member.userId, userId));
  if (memberships.length === 0) return null;

  const active = memberships.find((m) => m.organizationId === organizationId) ?? memberships[0];

  if (organizationId !== active.organizationId) {
    organizationId = active.organizationId;
    if (result.session?.id) {
      await db
        .update(sessionTable)
        .set({ activeOrganizationId: organizationId })
        .where(eq(sessionTable.id, result.session.id));
    }
  }

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, active.organizationId))
    .limit(1);

  if (!org) return null;

  return {
    userId,
    userName: result.user.name,
    userEmail: result.user.email,
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    role: (active.role as OrgRole) ?? "member",
  };
});

/** Throws when there is no authenticated org context. Use in Server Actions. */
export async function requireOrgContext(): Promise<OrgContext> {
  const context = await getOrgContext();
  if (!context) throw new Error("UNAUTHORIZED");
  return context;
}

const ROLE_RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 };

/** True when `role` meets or exceeds `required`. */
export function roleAtLeast(role: OrgRole, required: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
