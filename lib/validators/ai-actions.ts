import { z } from "zod";

export const scoreLeadSchema = z.object({ leadId: z.uuid() });
export const scoreDealSchema = z.object({ dealId: z.uuid() });
export const summarizeAccountSchema = z.object({ accountId: z.uuid() });
export const summarizeContactSchema = z.object({ contactId: z.uuid() });
export const extractActionItemsSchema = z.object({ activityId: z.uuid() });
export const draftEmailSchema = z.object({
  contactId: z.uuid(),
  instructions: z.string().max(1000).optional(),
});
export const backfillEmbeddingsSchema = z.object({});
export const findDuplicatesSchema = z.object({});
