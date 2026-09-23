import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { AiRefusalError, anthropic, MODEL } from "@/lib/ai/client";
import { aiInsights } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";
import { formatCurrency, formatDate } from "@/lib/format";
import { getDeal, getLead } from "@/lib/queries/crm";

/**
 * Lead and deal-health scoring. `output_config.format` guarantees the shape —
 * no "respond with JSON" prompting, no manual parsing. Callable from a Server
 * Action or an Inngest job (nightly/on-change). Skips the chat agent's
 * `fallbacks` param on purpose: this is background work, so on a rare refusal
 * it's cheaper to skip the record until the next run than to add fallback
 * routing here.
 */

export const scoreOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasoning: z.string().min(1).max(2000),
  nextAction: z.string().min(1).max(500),
});

export type ScoreResult = z.infer<typeof scoreOutputSchema>;

async function runScorer(system: string, prompt: string): Promise<ScoreResult> {
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(scoreOutputSchema) },
    system,
    messages: [{ role: "user", content: prompt }],
  });

  // Structured outputs are incompatible with citations but not with refusals —
  // a decline still returns 200 with empty content, so check before trusting parsed_output.
  if (response.stop_reason === "refusal") {
    throw new AiRefusalError(response.stop_details?.category ?? null);
  }
  if (!response.parsed_output) {
    throw new Error("Model did not return a parseable score");
  }
  return response.parsed_output;
}

async function storeInsight(
  organizationId: string,
  subjectType: "lead" | "deal",
  subjectId: string,
  kind: "lead_score" | "deal_health",
  result: ScoreResult,
) {
  await tenantDb(organizationId, async (tx) => {
    await tx.insert(aiInsights).values({
      organizationId,
      subjectType,
      subjectId,
      kind,
      score: result.score,
      reasoning: result.reasoning,
      nextAction: result.nextAction,
      model: MODEL,
    });
  });
}

const LEAD_SYSTEM_PROMPT = `You score inbound sales leads for a B2B CRM. Score 0-100: how likely this lead
converts to a paying customer soon. Weigh signals like: role seniority for a
sales/ops decision, a named company, a source that indicates real intent
(referral, demo request) versus passive interest (newsletter), and any
logged activity showing engagement. A lead with almost no information should
score low with reasoning that says so plainly — don't invent signal that
isn't there. reasoning: 2-3 sentences, specific to this lead, not generic.
nextAction: one concrete next step a rep should take, not a platitude.`;

export async function scoreLead(organizationId: string, leadId: string): Promise<ScoreResult> {
  const data = await getLead(organizationId, leadId);
  if (!data) throw new Error("Lead not found");
  const { lead, timeline } = data;

  const prompt = [
    `Name: ${lead.firstName} ${lead.lastName}`,
    `Company: ${lead.company ?? "unknown"}`,
    `Title: ${lead.title ?? "unknown"}`,
    `Source: ${lead.source ?? "unknown"}`,
    `Status: ${lead.status}`,
    `Created: ${formatDate(lead.createdAt)}`,
    "",
    timeline.length === 0
      ? "No activity logged yet."
      : `Activity (${timeline.length}):\n${timeline
          .map((a) => `- [${a.type}] ${a.subject}${a.body ? `: ${a.body}` : ""}`)
          .join("\n")}`,
  ].join("\n");

  const result = await runScorer(LEAD_SYSTEM_PROMPT, prompt);
  await storeInsight(organizationId, "lead", leadId, "lead_score", result);
  return result;
}

const DEAL_SYSTEM_PROMPT = `You assess deal health for a B2B sales pipeline. Score 0-100: how likely this
deal closes won, roughly on schedule. Weigh: recency and substance of
activity (a deal with no activity in weeks is not healthy regardless of
amount), whether the timeline shows real engagement versus the rep talking
to themselves, proximity to and realism of the expected close date, and
deal size relative to what's typical (very large deals move slower and
need more evidence of traction). reasoning: 2-3 sentences citing specific
evidence from the timeline, not a generic assessment. nextAction: one
concrete next step, addressing the biggest risk you identified.`;

export async function scoreDealHealth(
  organizationId: string,
  dealId: string,
): Promise<ScoreResult> {
  const data = await getDeal(organizationId, dealId);
  if (!data) throw new Error("Deal not found");
  const { deal, stageName, accountName, timeline } = data;

  if (deal.status !== "open") {
    throw new Error(`Deal is already ${deal.status} — nothing to assess`);
  }

  const prompt = [
    `Deal: ${deal.name}`,
    `Account: ${accountName ?? "none"}`,
    `Stage: ${stageName ?? "unknown"}`,
    `Amount: ${formatCurrency(deal.amountCents)}`,
    `Expected close: ${formatDate(deal.expectedCloseDate)}`,
    `Created: ${formatDate(deal.createdAt)}`,
    "",
    timeline.length === 0
      ? "No activity logged yet."
      : `Activity (${timeline.length}, most recent first):\n${timeline
          .map(
            (a) =>
              `- [${formatDate(a.createdAt)}] [${a.type}] ${a.subject}${a.body ? `: ${a.body}` : ""}`,
          )
          .join("\n")}`,
  ].join("\n");

  const result = await runScorer(DEAL_SYSTEM_PROMPT, prompt);
  await storeInsight(organizationId, "deal", dealId, "deal_health", result);
  return result;
}

export type InsightRow = {
  id: string;
  score: number;
  reasoning: string;
  nextAction: string | null;
  model: string;
  createdAt: Date;
};

/** The most recent insight of `kind` for a subject, or null if never scored. */
export async function latestInsight(
  organizationId: string,
  subjectType: "lead" | "deal",
  subjectId: string,
  kind: "lead_score" | "deal_health",
): Promise<InsightRow | null> {
  return tenantDb(organizationId, async (tx) => {
    const [row] = await tx
      .select()
      .from(aiInsights)
      .where(
        and(
          eq(aiInsights.subjectType, subjectType),
          eq(aiInsights.subjectId, subjectId),
          eq(aiInsights.kind, kind),
        ),
      )
      .orderBy(desc(aiInsights.createdAt))
      .limit(1);
    return row ?? null;
  });
}
