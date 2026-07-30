"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { activities } from "@/lib/db/schema";
import { notify } from "@/lib/inngest/client";
import { orgAction } from "@/lib/safe-action";
import {
  createActivitySchema,
  deleteActivitySchema,
  toggleTaskSchema,
  updateActivitySchema,
} from "@/lib/validators/crm";

/** Detail routes that should refresh when a timeline entry changes. */
function revalidateSubject(relatedType: string, relatedId: string) {
  revalidatePath("/activities");
  revalidatePath(`/${relatedType}s/${relatedId}`);
}

/** A logged call/meeting/note is scoring signal for the lead or deal it's on. */
async function notifyRelatedScoring(
  organizationId: string,
  relatedType: string,
  relatedId: string,
) {
  if (relatedType === "lead") {
    await notify("lead/scoring.requested", { organizationId, leadId: relatedId });
  } else if (relatedType === "deal") {
    await notify("deal/scoring.requested", { organizationId, dealId: relatedId });
  }
}

export const createActivity = orgAction
  .metadata({ name: "activities.create" })
  .inputSchema(createActivitySchema)
  .action(async ({ parsedInput, ctx }) => {
    const activity = await ctx.withTenant(async (tx) => {
      const [row] = await tx
        .insert(activities)
        .values({ ...parsedInput, organizationId: ctx.organizationId, ownerId: ctx.userId })
        .returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "create",
        entityType: "activity",
        entityId: row.id,
        after: row,
      });

      return row;
    });

    await notify("embedding/source.changed", {
      organizationId: ctx.organizationId,
      sourceType: "activity",
      sourceId: activity.id,
    });
    await notifyRelatedScoring(ctx.organizationId, parsedInput.relatedType, parsedInput.relatedId);

    revalidateSubject(parsedInput.relatedType, parsedInput.relatedId);
    return { id: activity.id };
  });

export const updateActivity = orgAction
  .metadata({ name: "activities.update" })
  .inputSchema(updateActivitySchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...values } = parsedInput;

    await ctx.withTenant(async (tx) => {
      const [before] = await tx.select().from(activities).where(eq(activities.id, id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");

      const [after] = await tx
        .update(activities)
        .set(values)
        .where(eq(activities.id, id))
        .returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "update",
        entityType: "activity",
        entityId: id,
        before,
        after,
      });
    });

    revalidateSubject(parsedInput.relatedType, parsedInput.relatedId);
    return { id };
  });

/** Ticking a task off. Separate from update so the UI can fire it optimistically. */
export const toggleTask = orgAction
  .metadata({ name: "activities.toggleTask" })
  .inputSchema(toggleTaskSchema)
  .action(async ({ parsedInput, ctx }) => {
    const row = await ctx.withTenant(async (tx) => {
      const [updated] = await tx
        .update(activities)
        .set({ completedAt: parsedInput.completed ? new Date() : null })
        .where(eq(activities.id, parsedInput.id))
        .returning();
      if (!updated) throw new Error("NOT_FOUND");
      return updated;
    });

    revalidateSubject(row.relatedType, row.relatedId);
    revalidatePath("/dashboard");
    return { id: row.id, completed: Boolean(row.completedAt) };
  });

export const deleteActivity = orgAction
  .metadata({ name: "activities.delete" })
  .inputSchema(deleteActivitySchema)
  .action(async ({ parsedInput, ctx }) => {
    const row = await ctx.withTenant(async (tx) => {
      const [before] = await tx
        .select()
        .from(activities)
        .where(eq(activities.id, parsedInput.id))
        .limit(1);
      if (!before) throw new Error("NOT_FOUND");

      await tx.delete(activities).where(eq(activities.id, parsedInput.id));

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "delete",
        entityType: "activity",
        entityId: parsedInput.id,
        before,
      });

      return before;
    });

    revalidateSubject(row.relatedType, row.relatedId);
    return { id: parsedInput.id };
  });
