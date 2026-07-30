import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AiRefusalError, anthropic, MODEL } from "@/lib/ai/client";
import { activities } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";
import { formatCurrency, formatDate } from "@/lib/format";
import { getAccount, getContact } from "@/lib/queries/crm";

/**
 * "Catch me up", meeting-notes → action items, and follow-up email drafting.
 * All three use structured output — a schema-shaped response means no
 * "Here's a summary:" preamble to strip, and no manual JSON parsing.
 */

async function parseOrThrow<T>(
  format: ReturnType<typeof zodOutputFormat<z.ZodType<T>>>,
  system: string,
  prompt: string,
  effort: "low" | "medium" | "high" = "medium",
): Promise<T> {
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort, format },
    system,
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new AiRefusalError(response.stop_details?.category ?? null);
  }
  if (!response.parsed_output) {
    throw new Error("Model did not return a parseable response");
  }
  return response.parsed_output;
}

// ---------------------------------------------------------------------------
// Timeline summaries
// ---------------------------------------------------------------------------

const summarySchema = z.object({
  summary: z.string().min(1).max(2000),
});

const SUMMARY_SYSTEM = `You write "catch me up" briefings for a sales rep about to talk to a customer.
Summarize the account/contact and its recent activity in 3-5 sentences of
plain prose — no headers, no bullet list. Lead with the most important thing
(an open deal at risk, an overdue follow-up, a recent commitment made to the
customer); background details come after. If there's genuinely little to go
on, say that plainly rather than padding.`;

export async function summarizeAccountTimeline(
  organizationId: string,
  accountId: string,
): Promise<string> {
  const data = await getAccount(organizationId, accountId);
  if (!data) throw new Error("Account not found");
  const { account, contacts, deals, timeline } = data;

  const prompt = [
    `Account: ${account.name}${account.industry ? ` (${account.industry})` : ""}`,
    account.description ? `Notes: ${account.description}` : null,
    `Contacts: ${contacts.length === 0 ? "none" : contacts.map((c) => `${c.firstName} ${c.lastName}`).join(", ")}`,
    `Deals: ${
      deals.length === 0
        ? "none"
        : deals.map((d) => `${d.name} (${d.status}, ${formatCurrency(d.amountCents)})`).join("; ")
    }`,
    "",
    timeline.length === 0
      ? "No activity logged yet."
      : `Recent activity (newest first):\n${timeline
          .slice(0, 15)
          .map(
            (a) =>
              `- [${formatDate(a.createdAt)}] [${a.type}] ${a.subject}${a.body ? `: ${a.body}` : ""}`,
          )
          .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await parseOrThrow(zodOutputFormat(summarySchema), SUMMARY_SYSTEM, prompt);
  return result.summary;
}

export async function summarizeContactTimeline(
  organizationId: string,
  contactId: string,
): Promise<string> {
  const data = await getContact(organizationId, contactId);
  if (!data) throw new Error("Contact not found");
  const { contact, accountName, deals, timeline } = data;

  const prompt = [
    `Contact: ${contact.firstName} ${contact.lastName}${contact.title ? `, ${contact.title}` : ""}`,
    accountName ? `Account: ${accountName}` : null,
    `Deals: ${
      deals.length === 0
        ? "none"
        : deals.map((d) => `${d.name} (${d.status}, ${formatCurrency(d.amountCents)})`).join("; ")
    }`,
    "",
    timeline.length === 0
      ? "No activity logged yet."
      : `Recent activity (newest first):\n${timeline
          .slice(0, 15)
          .map(
            (a) =>
              `- [${formatDate(a.createdAt)}] [${a.type}] ${a.subject}${a.body ? `: ${a.body}` : ""}`,
          )
          .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await parseOrThrow(zodOutputFormat(summarySchema), SUMMARY_SYSTEM, prompt);
  return result.summary;
}

// ---------------------------------------------------------------------------
// Meeting notes -> action items
// ---------------------------------------------------------------------------

const actionItemsSchema = z.object({
  items: z
    .array(
      z.object({
        subject: z.string().min(1).max(300),
        /** ISO date (yyyy-mm-dd) if the note implies a deadline, else null. */
        dueDate: z.string().nullable(),
      }),
    )
    .max(10),
});

const ACTION_ITEMS_SYSTEM = `Extract concrete follow-up action items from a meeting note or call log. Each
item should be something a rep can actually do (send X, schedule Y, confirm
Z with the customer) — not a restatement of what was discussed. If the note
implies a deadline ("by Friday", "next week"), set dueDate to that date in
ISO format relative to the note's date; otherwise null. If there are no real
action items, return an empty list — don't invent one to have something to
show.`;

export type ActionItem = { subject: string; dueDate: string | null };

/**
 * Extracts action items from one activity's text and creates a `task`
 * activity for each, attached to the same record. Returns the created rows'
 * ids so the caller can link to them.
 */
export async function extractActionItems(
  organizationId: string,
  activityId: string,
): Promise<{ subject: string; dueAt: Date | null }[]> {
  const source = await tenantDb(organizationId, async (tx) => {
    const [row] = await tx.select().from(activities).where(eq(activities.id, activityId)).limit(1);
    return row ?? null;
  });
  if (!source) throw new Error("Activity not found");
  if (!source.body || source.body.trim().length === 0) return [];

  const prompt = `Note date: ${formatDate(source.createdAt)}\nSubject: ${source.subject}\n\n${source.body}`;
  const result = await parseOrThrow(
    zodOutputFormat(actionItemsSchema),
    ACTION_ITEMS_SYSTEM,
    prompt,
    "low",
  );

  if (result.items.length === 0) return [];

  const created = await tenantDb(organizationId, async (tx) => {
    const rows = await tx
      .insert(activities)
      .values(
        result.items.map((item) => ({
          organizationId,
          type: "task" as const,
          subject: item.subject,
          relatedType: source.relatedType,
          relatedId: source.relatedId,
          dueAt: item.dueDate ? new Date(item.dueDate) : null,
          ownerId: source.ownerId,
        })),
      )
      .returning({ subject: activities.subject, dueAt: activities.dueAt });
    return rows;
  });

  return created;
}

// ---------------------------------------------------------------------------
// Follow-up email drafting
// ---------------------------------------------------------------------------

const emailDraftSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
});

export type EmailDraft = z.infer<typeof emailDraftSchema>;

const EMAIL_SYSTEM = `Draft a follow-up email from a sales rep to a customer contact. Ground it in
the specific context given — reference what was actually discussed, don't
write a generic template. Professional but not stiff; short paragraphs.
Sign off with "Best," and leave the sender's name as a placeholder
"[Your name]" since you don't know who's sending it. Output the subject line
and body separately — body has no subject line embedded in it.`;

export async function draftFollowUpEmail(
  organizationId: string,
  contactId: string,
  instructions?: string,
): Promise<EmailDraft> {
  const data = await getContact(organizationId, contactId);
  if (!data) throw new Error("Contact not found");
  const { contact, accountName, timeline } = data;

  if (!contact.email) {
    throw new Error(`${contact.firstName} ${contact.lastName} has no email on file`);
  }

  const prompt = [
    `Contact: ${contact.firstName} ${contact.lastName}${contact.title ? `, ${contact.title}` : ""}`,
    accountName ? `Company: ${accountName}` : null,
    "",
    timeline.length === 0
      ? "No prior activity logged."
      : `Recent activity (newest first):\n${timeline
          .slice(0, 8)
          .map(
            (a) =>
              `- [${formatDate(a.createdAt)}] [${a.type}] ${a.subject}${a.body ? `: ${a.body}` : ""}`,
          )
          .join("\n")}`,
    instructions ? `\nSpecific instructions from the rep: ${instructions}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return parseOrThrow(zodOutputFormat(emailDraftSchema), EMAIL_SYSTEM, prompt);
}
