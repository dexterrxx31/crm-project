"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { contacts } from "@/lib/db/schema";
import { notify } from "@/lib/inngest/client";
import { orgAction } from "@/lib/safe-action";
import { createContactSchema, updateContactSchema } from "@/lib/validators/crm";

export const createContact = orgAction
  .metadata({ name: "contacts.create" })
  .inputSchema(createContactSchema)
  .action(async ({ parsedInput, ctx }) => {
    const contact = await ctx.withTenant(async (tx) => {
      const [row] = await tx
        .insert(contacts)
        .values({ ...parsedInput, organizationId: ctx.organizationId, ownerId: ctx.userId })
        .returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "create",
        entityType: "contact",
        entityId: row.id,
        after: row,
      });

      return row;
    });

    await notify("embedding/source.changed", {
      organizationId: ctx.organizationId,
      sourceType: "contact",
      sourceId: contact.id,
    });

    revalidatePath("/contacts");
    return { id: contact.id };
  });

export const updateContact = orgAction
  .metadata({ name: "contacts.update" })
  .inputSchema(updateContactSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...values } = parsedInput;

    await ctx.withTenant(async (tx) => {
      const [before] = await tx.select().from(contacts).where(eq(contacts.id, id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");

      const [after] = await tx.update(contacts).set(values).where(eq(contacts.id, id)).returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "update",
        entityType: "contact",
        entityId: id,
        before,
        after,
      });
    });

    await notify("embedding/source.changed", {
      organizationId: ctx.organizationId,
      sourceType: "contact",
      sourceId: id,
    });

    revalidatePath("/contacts");
    revalidatePath(`/contacts/${id}`);
    return { id };
  });
