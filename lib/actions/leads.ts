"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { accounts, contacts, deals, leads, pipelines, stages } from "@/lib/db/schema";
import { orgAction } from "@/lib/safe-action";
import {
  convertLeadSchema,
  createLeadSchema,
  deleteLeadSchema,
  updateLeadSchema,
} from "@/lib/validators/crm";

export const createLead = orgAction
  .metadata({ name: "leads.create" })
  .inputSchema(createLeadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const lead = await ctx.withTenant(async (tx) => {
      const [row] = await tx
        .insert(leads)
        .values({ ...parsedInput, organizationId: ctx.organizationId, ownerId: ctx.userId })
        .returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "create",
        entityType: "lead",
        entityId: row.id,
        after: row,
      });

      return row;
    });

    revalidatePath("/leads");
    return { id: lead.id };
  });

export const updateLead = orgAction
  .metadata({ name: "leads.update" })
  .inputSchema(updateLeadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...values } = parsedInput;

    await ctx.withTenant(async (tx) => {
      const [before] = await tx.select().from(leads).where(eq(leads.id, id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");

      const [after] = await tx.update(leads).set(values).where(eq(leads.id, id)).returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "update",
        entityType: "lead",
        entityId: id,
        before,
        after,
      });
    });

    revalidatePath("/leads");
    revalidatePath(`/leads/${id}`);
    return { id };
  });

export const deleteLead = orgAction
  .metadata({ name: "leads.delete", requiredRole: "admin" })
  .inputSchema(deleteLeadSchema)
  .action(async ({ parsedInput, ctx }) => {
    await ctx.withTenant(async (tx) => {
      const [before] = await tx.select().from(leads).where(eq(leads.id, parsedInput.id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");

      await tx.delete(leads).where(eq(leads.id, parsedInput.id));

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "delete",
        entityType: "lead",
        entityId: parsedInput.id,
        before,
      });
    });

    revalidatePath("/leads");
    return { id: parsedInput.id };
  });

/**
 * Lead conversion — the one genuinely multi-step CRM operation.
 *
 * Creates (or reuses) an account, creates a contact on it, optionally opens a
 * deal, and marks the lead converted. All inside one transaction: a partial
 * conversion that leaves a contact without its lead marked would be worse than
 * a clean failure.
 */
export const convertLead = orgAction
  .metadata({ name: "leads.convert" })
  .inputSchema(convertLeadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await ctx.withTenant(async (tx) => {
      const [lead] = await tx.select().from(leads).where(eq(leads.id, parsedInput.id)).limit(1);
      if (!lead) throw new Error("NOT_FOUND");
      if (lead.status === "converted") throw new Error("ALREADY_CONVERTED");

      // Reuse an existing account with the same name rather than creating a
      // duplicate — the most common cause of messy CRM data.
      const [existingAccount] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.name, parsedInput.accountName))
        .limit(1);

      const account =
        existingAccount ??
        (
          await tx
            .insert(accounts)
            .values({
              organizationId: ctx.organizationId,
              ownerId: ctx.userId,
              name: parsedInput.accountName,
            })
            .returning()
        )[0];

      const [contact] = await tx
        .insert(contacts)
        .values({
          organizationId: ctx.organizationId,
          ownerId: ctx.userId,
          accountId: account.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          title: lead.title,
          status: "active",
        })
        .returning();

      let dealId: string | null = null;
      if (parsedInput.createDeal) {
        const [pipeline] = await tx
          .select()
          .from(pipelines)
          .where(
            and(eq(pipelines.organizationId, ctx.organizationId), eq(pipelines.isDefault, true)),
          )
          .limit(1);
        if (!pipeline) throw new Error("NO_PIPELINE");

        const [firstStage] = await tx
          .select()
          .from(stages)
          .where(eq(stages.pipelineId, pipeline.id))
          .orderBy(stages.position)
          .limit(1);
        if (!firstStage) throw new Error("NO_STAGE");

        const [deal] = await tx
          .insert(deals)
          .values({
            organizationId: ctx.organizationId,
            ownerId: ctx.userId,
            pipelineId: pipeline.id,
            stageId: firstStage.id,
            accountId: account.id,
            contactId: contact.id,
            name:
              parsedInput.dealName ??
              `${parsedInput.accountName} — ${lead.firstName} ${lead.lastName}`,
            amountCents: parsedInput.dealAmount ?? 0,
          })
          .returning();
        dealId = deal.id;
      }

      await tx
        .update(leads)
        .set({
          status: "converted",
          convertedAccountId: account.id,
          convertedContactId: contact.id,
          convertedAt: new Date(),
        })
        .where(eq(leads.id, lead.id));

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "convert",
        entityType: "lead",
        entityId: lead.id,
        before: lead,
        after: { accountId: account.id, contactId: contact.id, dealId },
      });

      return { accountId: account.id, contactId: contact.id, dealId };
    });

    revalidatePath("/leads");
    revalidatePath("/contacts");
    revalidatePath("/accounts");
    revalidatePath("/deals");
    return result;
  });
