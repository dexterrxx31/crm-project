"use server";

import { revalidatePath } from "next/cache";
import { AiNotConfiguredError, AiRefusalError } from "@/lib/ai/client";
import { backfillEmbeddings, findDuplicateContacts } from "@/lib/ai/embed";
import { scoreDealHealth, scoreLead } from "@/lib/ai/scoring";
import {
  draftFollowUpEmail,
  extractActionItems,
  summarizeAccountTimeline,
  summarizeContactTimeline,
} from "@/lib/ai/summarize";
import { VoyageNotConfiguredError } from "@/lib/ai/voyage";
import { orgAction } from "@/lib/safe-action";
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

/**
 * Explicit "do this AI thing now" buttons. Every action here is a thin
 * wrapper: validate input, call the corresponding lib/ai/* function, surface
 * a clean message for the two ways AI calls fail that aren't bugs — no key
 * configured, or the model declined.
 */
function friendlyAiError(error: unknown): string {
  if (error instanceof AiNotConfiguredError) return error.message;
  if (error instanceof VoyageNotConfiguredError) return error.message;
  if (error instanceof AiRefusalError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export const scoreLeadAction = orgAction
  .metadata({ name: "ai.scoreLead" })
  .inputSchema(scoreLeadSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const result = await scoreLead(ctx.organizationId, parsedInput.leadId);
      revalidatePath(`/leads/${parsedInput.leadId}`);
      revalidatePath("/leads");
      return { ok: true as const, result };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

export const scoreDealAction = orgAction
  .metadata({ name: "ai.scoreDeal" })
  .inputSchema(scoreDealSchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const result = await scoreDealHealth(ctx.organizationId, parsedInput.dealId);
      revalidatePath(`/deals/${parsedInput.dealId}`);
      return { ok: true as const, result };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

export const summarizeAccountAction = orgAction
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

export const summarizeContactAction = orgAction
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

export const extractActionItemsAction = orgAction
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

export const draftEmailAction = orgAction
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

/** Manual backfill trigger — Phase 6 replaces the manual button with an Inngest on-change hook. */
export const backfillEmbeddingsAction = orgAction
  .metadata({ name: "ai.backfillEmbeddings" })
  .inputSchema(backfillEmbeddingsSchema)
  .action(async ({ ctx }) => {
    try {
      const counts = await backfillEmbeddings(ctx.organizationId);
      return { ok: true as const, counts };
    } catch (error) {
      return { ok: false as const, message: friendlyAiError(error) };
    }
  });

export const findDuplicatesAction = orgAction
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
