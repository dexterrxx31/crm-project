"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization, pipelines, stages, user } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";
import { actionClient } from "@/lib/safe-action";
import { signInSchema, signUpSchema } from "@/lib/validators/auth";

/** Stage template applied to every new organization. */
const DEFAULT_STAGES = [
  { name: "Qualification", probability: 10 },
  { name: "Discovery", probability: 25 },
  { name: "Proposal", probability: 50 },
  { name: "Negotiation", probability: 75 },
  { name: "Closing", probability: 90 },
];

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org"
  );
}

/** Appends a short suffix until the slug is free. */
async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, candidate))
      .limit(1);
    if (clash.length === 0) return candidate;
    candidate = `${base}-${randomUUID().slice(0, 6)}`;
  }
  return `${base}-${randomUUID().slice(0, 12)}`;
}

export const signUpAction = actionClient
  .metadata({ name: "auth.signUp" })
  .inputSchema(signUpSchema)
  .action(async ({ parsedInput }) => {
    const { name, email, password, organizationName } = parsedInput;

    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (existing.length > 0) {
      return { ok: false as const, message: "An account with that email already exists." };
    }

    // Better Auth owns password hashing and session creation. The nextCookies
    // plugin turns the resulting Set-Cookie into a real cookie on this action's
    // response, so the user is signed in when this returns.
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });

    const [created] = await db.select().from(user).where(eq(user.email, email)).limit(1);
    if (!created) throw new Error("sign-up did not create a user");

    // Provision the organization, the owner membership, and a working pipeline
    // so the app is usable immediately rather than showing an empty shell.
    const organizationId = randomUUID();
    await db.insert(organization).values({
      id: organizationId,
      name: organizationName,
      slug: await uniqueSlug(slugify(organizationName)),
      createdAt: new Date(),
    });
    await db.insert(member).values({
      id: randomUUID(),
      organizationId,
      userId: created.id,
      role: "owner",
      createdAt: new Date(),
    });

    await tenantDb(organizationId, async (tx) => {
      const [pipeline] = await tx
        .insert(pipelines)
        .values({ organizationId, name: "Sales Pipeline", isDefault: true })
        .returning();

      await tx.insert(stages).values(
        DEFAULT_STAGES.map((stage, index) => ({
          organizationId,
          pipelineId: pipeline.id,
          name: stage.name,
          position: index + 1,
          probability: stage.probability,
        })),
      );
    });

    return { ok: true as const };
  });

export const signInAction = actionClient
  .metadata({ name: "auth.signIn" })
  .inputSchema(signInSchema)
  .action(async ({ parsedInput }) => {
    try {
      await auth.api.signInEmail({
        body: { email: parsedInput.email, password: parsedInput.password },
        headers: await headers(),
      });
      return { ok: true as const };
    } catch {
      // Deliberately vague: distinguishing "no such user" from "wrong password"
      // hands an attacker a user-enumeration oracle.
      return { ok: false as const, message: "Email or password is incorrect." };
    }
  });
