"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { accounts } from "@/lib/db/schema";
import { notify } from "@/lib/inngest/client";
import { orgAction } from "@/lib/safe-action";
import { createAccountSchema, updateAccountSchema } from "@/lib/validators/crm";

export const createAccount = orgAction
  .metadata({ name: "accounts.create" })
  .inputSchema(createAccountSchema)
  .action(async ({ parsedInput, ctx }) => {
    const account = await ctx.withTenant(async (tx) => {
      const [row] = await tx
        .insert(accounts)
        .values({ ...parsedInput, organizationId: ctx.organizationId, ownerId: ctx.userId })
        .returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "create",
        entityType: "account",
        entityId: row.id,
        after: row,
      });

      return row;
    });

    await notify("embedding/source.changed", {
      organizationId: ctx.organizationId,
      sourceType: "account",
      sourceId: account.id,
    });

    revalidatePath("/accounts");
    return { id: account.id };
  });

export const updateAccount = orgAction
  .metadata({ name: "accounts.update" })
  .inputSchema(updateAccountSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...values } = parsedInput;

    await ctx.withTenant(async (tx) => {
      // RLS scopes this to the caller's organization, so a foreign id simply
      // matches no rows rather than updating another tenant's record.
      const [before] = await tx.select().from(accounts).where(eq(accounts.id, id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");

      const [after] = await tx.update(accounts).set(values).where(eq(accounts.id, id)).returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "update",
        entityType: "account",
        entityId: id,
        before,
        after,
      });
    });

    await notify("embedding/source.changed", {
      organizationId: ctx.organizationId,
      sourceType: "account",
      sourceId: id,
    });

    revalidatePath("/accounts");
    revalidatePath(`/accounts/${id}`);
    return { id };
  });
