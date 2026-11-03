"use server";

import { revalidatePath } from "next/cache";
import { AiNotConfiguredError, AiRefusalError } from "@/lib/ai/client";
import { findDuplicateContacts } from "@/lib/ai/embed";
import {
  draftFollowUpEmail,
  extractActionItems,
  summarizeAccountTimeline,
  summarizeContactTimeline,
} from "@/lib/ai/summarize";
import { VoyageNotConfiguredError } from "@/lib/ai/voyage";
import { requireTenantRecord } from "@/lib/db/references";
import { hasAnthropicKey, hasVoyageKey } from "@/lib/env";
import { inngest } from "@/lib/inngest/client";
import { aiAction } from "@/lib/safe-action";
import {
  backfillEmbeddingsSchema,
  draftEmailSchema,
  extractActionItemsSchema,
  findDuplicatesSchema,
  scoreDealSchema,
  scoreLeadSchema,
  summarizeAccountSchema,
  summarizeContactSchema,
} from "@/lib/validators/ai-actions";

/** Explicit "do this AI thing now" buttons — thin wrappers that validate input, call
 * the matching lib/ai/* function, and surface a clean message for the two non-bug
 * failure modes: no key configured, or the model declined. */
function friendlyAiError(error: unknown): string {
  if (error instanceof AiNotConfiguredError) return error.message;
  if (error instanceof VoyageNotConfiguredError) return error.message;
  if (error instanceof AiRefusalError) return error.message;
  console.error("[ai-action] unexpected failure", error);
  return "Something went wrong.";
}

export const scoreLeadAction = aiAction
  .metadata({ name: "ai.scoreLead" })
  .inputSchema(scoreLeadSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      if (!hasAnthropicKey()) throw new AiNotConfiguredError();
      await ctx.withTenant((tx) => requireTenantRecord(tx, "lead", parsedInput.leadId));
      await inngest.send({
        name: "lead/scoring.requested",
        data: { organizationId: ctx.organizationId, leadId: parsedInput.leadId },
      });
      revalidatePath(`/leads/${parsedInput.leadId}`);
      revalidatePath("/leads");
      return { ok: true as const, queued: true as const };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

export const scoreDealAction = aiAction
  .metadata({ name: "ai.scoreDeal" })
  .inputSchema(scoreDealSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      if (!hasAnthropicKey()) throw new AiNotConfiguredError();
      await ctx.withTenant((tx) => requireTenantRecord(tx, "deal", parsedInput.dealId));
      await inngest.send({
        name: "deal/scoring.requested",
        data: { organizationId: ctx.organizationId, dealId: parsedInput.dealId },
      });
      revalidatePath(`/deals/${parsedInput.dealId}`);
      return { ok: true as const, queued: true as const };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

export const summarizeAccountAction = aiAction
  .metadata({ name: "ai.summarizeAccount" })
  .inputSchema(summarizeAccountSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const summary = await summarizeAccountTimeline(ctx.organizationId, parsedInput.accountId);
      return { ok: true as const, summary };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

export const summarizeContactAction = aiAction
  .metadata({ name: "ai.summarizeContact" })
  .inputSchema(summarizeContactSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const summary = await summarizeContactTimeline(ctx.organizationId, parsedInput.contactId);
      return { ok: true as const, summary };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

export const extractActionItemsAction = aiAction
  .metadata({ name: "ai.extractActionItems" })
  .inputSchema(extractActionItemsSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const items = await extractActionItems(ctx.organizationId, parsedInput.activityId);
      revalidatePath("/activities");
      return { ok: true as const, items };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

export const draftEmailAction = aiAction
  .metadata({ name: "ai.draftEmail" })
  .inputSchema(draftEmailSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const draft = await draftFollowUpEmail(
        ctx.organizationId,
        parsedInput.contactId,
        parsedInput.instructions,
      );
      return { ok: true as const, draft };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

/** Manual backfill trigger — a full-reindex escape hatch alongside the Inngest on-change hook. */
export const backfillEmbeddingsAction = aiAction
  .metadata({ name: "ai.backfillEmbeddings" })
  .inputSchema(backfillEmbeddingsSchema)
  .action(async ({ ctx }) => {
    try {
      if (!hasVoyageKey()) throw new VoyageNotConfiguredError();
      await inngest.send({
        name: "embedding/backfill.requested",
        data: { organizationId: ctx.organizationId },
      });
      return { ok: true as const, queued: true as const };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

export const findDuplicatesAction = aiAction
  .metadata({ name: "ai.findDuplicates" })
  .inputSchema(findDuplicatesSchema)
  .action(async ({ ctx }) => {
    try {
      const candidates = await findDuplicateContacts(ctx.organizationId);
      return { ok: true as const, candidates };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });
