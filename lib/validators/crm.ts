import { z } from "zod";

/**
 * Shared Zod schemas. One definition per shape, consumed by the form, the
 * Server Action and the DB write — so a field cannot drift between layers.
 */

const uuid = z.uuid("Expected a valid id");

/** Turns "" from an untouched form input into undefined. */
const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().max(500).optional(),
);

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.email("Enter a valid email address").optional(),
);

const optionalDate = z.preprocess((value) => {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim() !== "") return new Date(value);
  return undefined;
}, z.date().optional());

/** Accepts a decimal amount from the form and stores minor units. */
const amountToCents = z.preprocess(
  (value) => {
    if (typeof value === "number") return Math.round(value * 100);
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
    }
    return 0;
  },
  z.number().int().min(0, "Amount cannot be negative"),
);

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  domain: optionalText,
  industry: optionalText,
  website: optionalText,
  phone: optionalText,
  employeeCount: z.preprocess(
    (value) => (value === "" || value === undefined || value === null ? undefined : Number(value)),
    z.number().int().min(0).max(10_000_000).optional(),
  ),
  description: optionalText,
});

export const createAccountSchema = accountInputSchema;
export const updateAccountSchema = accountInputSchema.extend({ id: uuid });

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export const contactInputSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: optionalEmail,
  phone: optionalText,
  title: optionalText,
  status: z.enum(["lead", "active", "inactive"]).default("lead"),
  accountId: z.preprocess(
    (value) => (value === "" || value === "none" ? undefined : value),
    uuid.optional(),
  ),
});

export const createContactSchema = contactInputSchema;
export const updateContactSchema = contactInputSchema.extend({ id: uuid });

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const leadInputSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: optionalEmail,
  phone: optionalText,
  company: optionalText,
  title: optionalText,
  source: optionalText,
  status: z.enum(["new", "working", "qualified", "unqualified", "converted"]).default("new"),
});

export const createLeadSchema = leadInputSchema;
export const updateLeadSchema = leadInputSchema.extend({ id: uuid });

/** Lead → account + contact (+ optional deal). */
export const convertLeadSchema = z.object({
  id: uuid,
  accountName: z.string().trim().min(1, "Company name is required").max(200),
  createDeal: z.preprocess(
    (value) => value === true || value === "true" || value === "on",
    z.boolean(),
  ),
  dealName: optionalText,
  dealAmount: amountToCents.optional(),
});

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export const dealInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  stageId: uuid,
  accountId: z.preprocess(
    (value) => (value === "" || value === "none" ? undefined : value),
    uuid.optional(),
  ),
  contactId: z.preprocess(
    (value) => (value === "" || value === "none" ? undefined : value),
    uuid.optional(),
  ),
  amount: amountToCents,
  expectedCloseDate: optionalDate,
});

export const createDealSchema = dealInputSchema;
export const updateDealSchema = dealInputSchema.extend({ id: uuid });

/** Used by the kanban board's drag handler. */
export const moveDealSchema = z.object({
  id: uuid,
  stageId: uuid,
});

export const closeDealSchema = z.object({
  id: uuid,
  status: z.enum(["won", "lost"]),
  lostReason: optionalText,
});

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const activityInputSchema = z.object({
  type: z.enum(["call", "meeting", "email", "note", "task"]),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  body: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(20_000).optional(),
  ),
  relatedType: z.enum(["account", "contact", "lead", "deal"]),
  relatedId: uuid,
  dueAt: optionalDate,
});

export const createActivitySchema = activityInputSchema;
export const toggleTaskSchema = z.object({ id: uuid, completed: z.boolean() });
