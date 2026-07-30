import { z } from "zod";

/**
 * Validates what the model puts in a tool_use block before we act on it.
 * Tool inputs are untrusted the same way form input is — the model can
 * hallucinate a field or a type, so every write tool's input is parsed here
 * before touching the database.
 */

const subjectType = z.enum(["account", "contact", "lead", "deal"]);

export const searchRecordsInputSchema = z.object({
  query: z.string().min(1).max(200),
  types: z.array(subjectType).optional(),
});

export const getRecordInputSchema = z.object({
  type: subjectType,
  id: z.uuid(),
});

export const createActivityToolSchema = z.object({
  relatedType: subjectType,
  relatedId: z.uuid(),
  type: z.enum(["call", "meeting", "email", "note"]),
  subject: z.string().min(1).max(300),
  body: z.string().max(20_000).optional(),
});

export const createTaskToolSchema = z.object({
  relatedType: subjectType,
  relatedId: z.uuid(),
  subject: z.string().min(1).max(300),
  dueAt: z.iso.date().optional(),
  body: z.string().max(20_000).optional(),
});

export const updateDealStageToolSchema = z.object({
  dealId: z.uuid(),
  stageId: z.uuid(),
});

export const chatRequestSchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
});

export const chatConfirmSchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
  toolUseId: z.string().min(1),
  decision: z.enum(["allow", "deny"]),
});
