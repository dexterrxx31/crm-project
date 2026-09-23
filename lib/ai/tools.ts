import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { createActivity } from "@/lib/actions/activities";
import { moveDeal } from "@/lib/actions/deals";
import { accounts, contacts, deals, leads } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  formOptions,
  getAccount,
  getContact,
  getDeal,
  getLead,
  listAccounts,
  listContacts,
  listDeals,
  listLeads,
} from "@/lib/queries/crm";
import {
  createActivityToolSchema,
  createTaskToolSchema,
  getRecordInputSchema,
  searchRecordsInputSchema,
  updateDealStageToolSchema,
} from "@/lib/validators/ai";

/**
 * Tools available to the CRM agent. Read tools run immediately (RLS already
 * scopes what they can see); write tools only run via `executeWriteTool`,
 * after explicit user confirmation — see `lib/ai/agent.ts`.
 */

const READ_TOOL_NAMES = ["search_records", "get_record", "list_pipeline_stages"] as const;
const WRITE_TOOL_NAMES = ["create_activity", "create_task", "update_deal_stage"] as const;

export type ReadToolName = (typeof READ_TOOL_NAMES)[number];
export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

export function isWriteTool(name: string): name is WriteToolName {
  return (WRITE_TOOL_NAMES as readonly string[]).includes(name);
}

const READ_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_records",
    description:
      "Search accounts, contacts, leads and deals by keyword. Call this first whenever the user " +
      "refers to a record by name — you need its id before get_record, create_activity, " +
      "create_task or update_deal_stage will work.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keyword to search for, e.g. a person or company name.",
        },
        types: {
          type: "array",
          items: { type: "string", enum: ["account", "contact", "lead", "deal"] },
          description: "Restrict the search to these record types. Omit to search all four.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_record",
    description:
      "Fetch full detail for one record by id, including its recent activity timeline. Use " +
      "after search_records has given you the id.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["account", "contact", "lead", "deal"] },
        id: { type: "string", description: "The record's UUID, from search_records." },
      },
      required: ["type", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_pipeline_stages",
    description:
      "List the deal pipeline's stages in order, with their ids. Call this before " +
      "update_deal_stage — you need a real stageId, not a stage name.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const WRITE_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "create_activity",
    description:
      "Log a call, meeting, email or note against a record. This records something that " +
      "already happened — for a future to-do, use create_task instead. Requires user " +
      "confirmation before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        relatedType: { type: "string", enum: ["account", "contact", "lead", "deal"] },
        relatedId: { type: "string", description: "The target record's UUID." },
        type: { type: "string", enum: ["call", "meeting", "email", "note"] },
        subject: { type: "string", description: "A short one-line summary." },
        body: { type: "string", description: "Optional longer detail." },
      },
      required: ["relatedType", "relatedId", "type", "subject"],
      additionalProperties: false,
    },
  },
  {
    name: "create_task",
    description:
      "Create a follow-up task against a record, optionally with a due date. Requires user " +
      "confirmation before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        relatedType: { type: "string", enum: ["account", "contact", "lead", "deal"] },
        relatedId: { type: "string", description: "The target record's UUID." },
        subject: { type: "string", description: "What needs to be done." },
        dueAt: { type: "string", description: "Due date as YYYY-MM-DD, if one was given." },
        body: { type: "string", description: "Optional extra detail." },
      },
      required: ["relatedType", "relatedId", "subject"],
      additionalProperties: false,
    },
  },
  {
    name: "update_deal_stage",
    description:
      "Move a deal to a different pipeline stage. Call list_pipeline_stages first to get a " +
      "valid stageId. Requires user confirmation before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        dealId: { type: "string", description: "The deal's UUID." },
        stageId: {
          type: "string",
          description: "The target stage's UUID, from list_pipeline_stages.",
        },
      },
      required: ["dealId", "stageId"],
      additionalProperties: false,
    },
  },
];

export const ALL_TOOLS: Anthropic.Beta.BetaTool[] = [...READ_TOOLS, ...WRITE_TOOLS];

// ---------------------------------------------------------------------------
// Read tools — execute immediately, scoped by the same RLS transaction as
// every other query in the app.
// ---------------------------------------------------------------------------

export async function runReadTool(
  organizationId: string,
  name: ReadToolName,
  rawInput: unknown,
): Promise<unknown> {
  switch (name) {
    case "search_records": {
      const input = searchRecordsInputSchema.parse(rawInput);
      const types = input.types ?? ["account", "contact", "lead", "deal"];
      const results: Record<string, unknown[]> = {};

      if (types.includes("account")) {
        const { rows } = await listAccounts(organizationId, { q: input.query, perPage: 5 });
        results.accounts = rows.map((r) => ({ id: r.id, name: r.name, industry: r.industry }));
      }
      if (types.includes("contact")) {
        const { rows } = await listContacts(organizationId, { q: input.query, perPage: 5 });
        results.contacts = rows.map((r) => ({
          id: r.id,
          name: `${r.firstName} ${r.lastName}`,
          title: r.title,
          account: r.accountName,
        }));
      }
      if (types.includes("lead")) {
        const { rows } = await listLeads(organizationId, { q: input.query, perPage: 5 });
        results.leads = rows.map((r) => ({
          id: r.id,
          name: `${r.firstName} ${r.lastName}`,
          company: r.company,
          status: r.status,
        }));
      }
      if (types.includes("deal")) {
        const { rows } = await listDeals(organizationId, { q: input.query, perPage: 5 });
        results.deals = rows.map((r) => ({
          id: r.id,
          name: r.name,
          amount: formatCurrency(r.amountCents),
          stage: r.stageName,
          status: r.status,
        }));
      }
      return results;
    }

    case "get_record": {
      const input = getRecordInputSchema.parse(rawInput);
      switch (input.type) {
        case "account": {
          const data = await getAccount(organizationId, input.id);
          if (!data) return { error: "not_found" };
          return {
            name: data.account.name,
            industry: data.account.industry,
            description: data.account.description,
            contacts: data.contacts.map((c) => ({
              id: c.id,
              name: `${c.firstName} ${c.lastName}`,
            })),
            deals: data.deals.map((d) => ({
              id: d.id,
              name: d.name,
              amount: formatCurrency(d.amountCents),
              status: d.status,
            })),
            recentActivity: data.timeline.slice(0, 8).map((a) => ({
              date: formatDate(a.createdAt),
              type: a.type,
              subject: a.subject,
              body: a.body,
            })),
          };
        }
        case "contact": {
          const data = await getContact(organizationId, input.id);
          if (!data) return { error: "not_found" };
          return {
            name: `${data.contact.firstName} ${data.contact.lastName}`,
            title: data.contact.title,
            email: data.contact.email,
            phone: data.contact.phone,
            account: data.accountName,
            deals: data.deals.map((d) => ({ id: d.id, name: d.name, status: d.status })),
            recentActivity: data.timeline.slice(0, 8).map((a) => ({
              date: formatDate(a.createdAt),
              type: a.type,
              subject: a.subject,
              body: a.body,
            })),
          };
        }
        case "lead": {
          const data = await getLead(organizationId, input.id);
          if (!data) return { error: "not_found" };
          return {
            name: `${data.lead.firstName} ${data.lead.lastName}`,
            company: data.lead.company,
            email: data.lead.email,
            status: data.lead.status,
            source: data.lead.source,
            recentActivity: data.timeline.slice(0, 8).map((a) => ({
              date: formatDate(a.createdAt),
              type: a.type,
              subject: a.subject,
            })),
          };
        }
        case "deal": {
          const data = await getDeal(organizationId, input.id);
          if (!data) return { error: "not_found" };
          return {
            name: data.deal.name,
            amount: formatCurrency(data.deal.amountCents),
            status: data.deal.status,
            stage: data.stageName,
            account: data.accountName,
            expectedCloseDate: formatDate(data.deal.expectedCloseDate),
            recentActivity: data.timeline.slice(0, 8).map((a) => ({
              date: formatDate(a.createdAt),
              type: a.type,
              subject: a.subject,
              body: a.body,
            })),
          };
        }
      }
      break;
    }

    case "list_pipeline_stages": {
      const options = await formOptions(organizationId);
      return { stages: options.stages };
    }
  }
}

// ---------------------------------------------------------------------------
// Write tools — human-readable description for the confirmation prompt, and
// the actual executor, called only after explicit user approval.
// ---------------------------------------------------------------------------

/** Looks up a record's display name so the confirmation prompt reads naturally. */
async function recordLabel(
  organizationId: string,
  type: "account" | "contact" | "lead" | "deal",
  id: string,
): Promise<string> {
  return tenantDb(organizationId, async (tx) => {
    switch (type) {
      case "account": {
        const [row] = await tx
          .select({ name: accounts.name })
          .from(accounts)
          .where(eq(accounts.id, id));
        return row?.name ?? "this account";
      }
      case "contact": {
        const [row] = await tx
          .select({ firstName: contacts.firstName, lastName: contacts.lastName })
          .from(contacts)
          .where(eq(contacts.id, id));
        return row ? `${row.firstName} ${row.lastName}` : "this contact";
      }
      case "lead": {
        const [row] = await tx
          .select({ firstName: leads.firstName, lastName: leads.lastName })
          .from(leads)
          .where(eq(leads.id, id));
        return row ? `${row.firstName} ${row.lastName}` : "this lead";
      }
      case "deal": {
        const [row] = await tx.select({ name: deals.name }).from(deals).where(eq(deals.id, id));
        return row?.name ?? "this deal";
      }
    }
  });
}

/** A short, specific sentence describing what a write tool is about to do, for the confirmation UI. */
export async function describeWriteTool(
  organizationId: string,
  name: WriteToolName,
  rawInput: unknown,
): Promise<string> {
  switch (name) {
    case "create_activity": {
      const input = createActivityToolSchema.parse(rawInput);
      const label = await recordLabel(organizationId, input.relatedType, input.relatedId);
      return `Log a ${input.type} on ${label}: "${input.subject}"`;
    }
    case "create_task": {
      const input = createTaskToolSchema.parse(rawInput);
      const label = await recordLabel(organizationId, input.relatedType, input.relatedId);
      const due = input.dueAt ? ` (due ${formatDate(new Date(input.dueAt))})` : "";
      return `Create a task on ${label}: "${input.subject}"${due}`;
    }
    case "update_deal_stage": {
      const input = updateDealStageToolSchema.parse(rawInput);
      const [dealLabel, options] = await Promise.all([
        recordLabel(organizationId, "deal", input.dealId),
        formOptions(organizationId),
      ]);
      const stage = options.stages.find((s) => s.id === input.stageId);
      return `Move "${dealLabel}" to stage "${stage?.name ?? input.stageId}"`;
    }
  }
}

/** Runs a write tool after user approval, via the same Server Actions the UI forms use. */
export async function executeWriteTool(
  organizationId: string,
  name: WriteToolName,
  rawInput: unknown,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "create_activity": {
        const input = createActivityToolSchema.parse(rawInput);
        if (!(await recordExists(organizationId, input.relatedType, input.relatedId))) {
          return { ok: false, error: `No ${input.relatedType} found with that id.` };
        }
        const result = await createActivity(input);
        if (result?.serverError) return { ok: false, error: result.serverError };
        return { ok: true, result: { activityId: result?.data?.id } };
      }
      case "create_task": {
        const input = createTaskToolSchema.parse(rawInput);
        if (!(await recordExists(organizationId, input.relatedType, input.relatedId))) {
          return { ok: false, error: `No ${input.relatedType} found with that id.` };
        }
        const result = await createActivity({
          relatedType: input.relatedType,
          relatedId: input.relatedId,
          type: "task",
          subject: input.subject,
          body: input.body,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        });
        if (result?.serverError) return { ok: false, error: result.serverError };
        return { ok: true, result: { activityId: result?.data?.id } };
      }
      case "update_deal_stage": {
        const input = updateDealStageToolSchema.parse(rawInput);
        if (!(await recordExists(organizationId, "deal", input.dealId))) {
          return { ok: false, error: "No deal found with that id." };
        }
        const result = await moveDeal({ id: input.dealId, stageId: input.stageId });
        if (result?.serverError) return { ok: false, error: result.serverError };
        return { ok: true, result: { dealId: result?.data?.id, stageId: result?.data?.stageId } };
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function recordExists(
  organizationId: string,
  type: "account" | "contact" | "lead" | "deal",
  id: string,
): Promise<boolean> {
  return tenantDb(organizationId, async (tx) => {
    switch (type) {
      case "account": {
        const rows = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id));
        return rows.length > 0;
      }
      case "contact": {
        const rows = await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, id));
        return rows.length > 0;
      }
      case "lead": {
        const rows = await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, id));
        return rows.length > 0;
      }
      case "deal": {
        const rows = await tx.select({ id: deals.id }).from(deals).where(eq(deals.id, id));
        return rows.length > 0;
      }
    }
  });
}
