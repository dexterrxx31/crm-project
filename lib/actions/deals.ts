"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { deals, pipelines, stages } from "@/lib/db/schema";
import type { TenantTx } from "@/lib/db/tenant";
import { notify } from "@/lib/inngest/client";
import { publishDealBoardEvent } from "@/lib/realtime";
import { orgAction } from "@/lib/safe-action";
import {
  closeDealSchema,
  createDealSchema,
  deleteDealSchema,
  moveDealSchema,
  updateDealSchema,
} from "@/lib/validators/crm";

/**
 * Resolves the pipeline that owns a stage.
 *
 * The form only submits a stage, but `deals.pipeline_id` is NOT NULL — and
 * deriving it here (rather than trusting a hidden field) means a tampered form
 * cannot attach a deal to a pipeline the stage does not belong to.
 */
async function pipelineForStage(tx: TenantTx, stageId: string): Promise<string> {
  const [stage] = await tx.select().from(stages).where(eq(stages.id, stageId)).limit(1);
  if (!stage) throw new Error("NOT_FOUND");
  return stage.pipelineId;
}

export const createDeal = orgAction
  .metadata({ name: "deals.create" })
  .inputSchema(createDealSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { amount, ...rest } = parsedInput;

    const deal = await ctx.withTenant(async (tx) => {
      const pipelineId = await pipelineForStage(tx, rest.stageId);

      const [row] = await tx
        .insert(deals)
        .values({
          ...rest,
          pipelineId,
          amountCents: amount,
          organizationId: ctx.organizationId,
          ownerId: ctx.userId,
        })
        .returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "create",
        entityType: "deal",
        entityId: row.id,
        after: row,
      });

      return row;
    });

    await notify("embedding/source.changed", {
      organizationId: ctx.organizationId,
      sourceType: "deal",
      sourceId: deal.id,
    });
    await notify("deal/scoring.requested", { organizationId: ctx.organizationId, dealId: deal.id });

    revalidatePath("/deals");
    revalidatePath("/dashboard");
    return { id: deal.id };
  });

export const updateDeal = orgAction
  .metadata({ name: "deals.update" })
  .inputSchema(updateDealSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, amount, ...rest } = parsedInput;

    await ctx.withTenant(async (tx) => {
      const [before] = await tx.select().from(deals).where(eq(deals.id, id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");

      const pipelineId = await pipelineForStage(tx, rest.stageId);

      const [after] = await tx
        .update(deals)
        .set({ ...rest, pipelineId, amountCents: amount })
        .where(eq(deals.id, id))
        .returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "update",
        entityType: "deal",
        entityId: id,
        before,
        after,
      });
    });

    await notify("embedding/source.changed", {
      organizationId: ctx.organizationId,
      sourceType: "deal",
      sourceId: id,
    });
    await notify("deal/scoring.requested", { organizationId: ctx.organizationId, dealId: id });

    revalidatePath("/deals");
    revalidatePath(`/deals/${id}`);
    revalidatePath("/dashboard");
    return { id };
  });

/** Kanban drag-and-drop. Kept minimal so the board stays responsive. */
export const moveDeal = orgAction
  .metadata({ name: "deals.move" })
  .inputSchema(moveDealSchema)
  .action(async ({ parsedInput, ctx }) => {
    await ctx.withTenant(async (tx) => {
      const [before] = await tx.select().from(deals).where(eq(deals.id, parsedInput.id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");
      if (before.stageId === parsedInput.stageId) return;

      const pipelineId = await pipelineForStage(tx, parsedInput.stageId);

      const [after] = await tx
        .update(deals)
        .set({ stageId: parsedInput.stageId, pipelineId })
        .where(eq(deals.id, parsedInput.id))
        .returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "update",
        entityType: "deal",
        entityId: parsedInput.id,
        before: { stageId: before.stageId },
        after: { stageId: after.stageId },
      });
    });

    await publishDealBoardEvent(ctx.organizationId, {
      type: "deal.moved",
      dealId: parsedInput.id,
      stageId: parsedInput.stageId,
    });

    revalidatePath("/deals");
    revalidatePath("/dashboard");
    return { id: parsedInput.id, stageId: parsedInput.stageId };
  });

export const closeDeal = orgAction
  .metadata({ name: "deals.close" })
  .inputSchema(closeDealSchema)
  .action(async ({ parsedInput, ctx }) => {
    await ctx.withTenant(async (tx) => {
      const [before] = await tx.select().from(deals).where(eq(deals.id, parsedInput.id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");

      const [after] = await tx
        .update(deals)
        .set({
          status: parsedInput.status,
          lostReason: parsedInput.status === "lost" ? (parsedInput.lostReason ?? null) : null,
          closedAt: new Date(),
        })
        .where(eq(deals.id, parsedInput.id))
        .returning();

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "close",
        entityType: "deal",
        entityId: parsedInput.id,
        before,
        after,
      });
    });

    await publishDealBoardEvent(ctx.organizationId, {
      type: "deal.closed",
      dealId: parsedInput.id,
    });

    revalidatePath("/deals");
    revalidatePath(`/deals/${parsedInput.id}`);
    revalidatePath("/dashboard");
    return { id: parsedInput.id };
  });

export const deleteDeal = orgAction
  .metadata({ name: "deals.delete", requiredRole: "admin" })
  .inputSchema(deleteDealSchema)
  .action(async ({ parsedInput, ctx }) => {
    await ctx.withTenant(async (tx) => {
      const [before] = await tx.select().from(deals).where(eq(deals.id, parsedInput.id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");

      await tx.delete(deals).where(eq(deals.id, parsedInput.id));

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "delete",
        entityType: "deal",
        entityId: parsedInput.id,
        before,
      });
    });

    await publishDealBoardEvent(ctx.organizationId, {
      type: "deal.deleted",
      dealId: parsedInput.id,
    });

    revalidatePath("/deals");
    revalidatePath("/dashboard");
    return { id: parsedInput.id };
  });

/** The default pipeline's stages, used to render the board and the deal form. */
export async function defaultPipelineStages(tx: TenantTx, organizationId: string) {
  const [pipeline] = await tx
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.organizationId, organizationId), eq(pipelines.isDefault, true)))
    .limit(1);

  const target =
    pipeline ??
    (await tx
      .select()
      .from(pipelines)
      .limit(1)
      .then((rows) => rows[0] ?? null));

  if (!target) return { pipeline: null, stages: [] as (typeof stages.$inferSelect)[] };

  const stageRows = await tx
    .select()
    .from(stages)
    .where(eq(stages.pipelineId, target.id))
    .orderBy(stages.position);

  return { pipeline: target, stages: stageRows };
}
