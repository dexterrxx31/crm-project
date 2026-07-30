import { and, asc, count, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { accounts, activities, contacts, deals, leads, pipelines, stages } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";

/**
 * Read helpers shared by the CRM pages and, later, the AI agent's tools.
 *
 * Every function opens a tenant-scoped transaction, so callers cannot forget
 * the organization filter — RLS applies it in Postgres.
 */

export type ListParams = {
  q?: string;
  page?: number;
  perPage?: number;
};

const DEFAULT_PER_PAGE = 25;

function paginate(params: ListParams) {
  const perPage = Math.min(Math.max(params.perPage ?? DEFAULT_PER_PAGE, 1), 100);
  const page = Math.max(params.page ?? 1, 1);
  return { limit: perPage, offset: (page - 1) * perPage, page, perPage };
}

/** `%term%` with LIKE metacharacters neutralised so a search for "100%" works. */
function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function listAccounts(organizationId: string, params: ListParams = {}) {
  const { limit, offset, page, perPage } = paginate(params);

  return tenantDb(organizationId, async (tx) => {
    const filter = params.q
      ? or(
          ilike(accounts.name, likeTerm(params.q)),
          ilike(accounts.domain, likeTerm(params.q)),
          ilike(accounts.industry, likeTerm(params.q)),
        )
      : undefined;

    const rows = await tx
      .select({
        id: accounts.id,
        name: accounts.name,
        domain: accounts.domain,
        industry: accounts.industry,
        employeeCount: accounts.employeeCount,
        createdAt: accounts.createdAt,
        contactCount: sql<number>`(
          select count(*) from ${contacts} where ${contacts.accountId} = ${accounts.id}
        )`.mapWith(Number),
        openDealValue: sql<number>`(
          select coalesce(sum(${deals.amountCents}), 0) from ${deals}
          where ${deals.accountId} = ${accounts.id} and ${deals.status} = 'open'
        )`.mapWith(Number),
      })
      .from(accounts)
      .where(filter)
      .orderBy(asc(accounts.name))
      .limit(limit)
      .offset(offset);

    const [total] = await tx.select({ value: count() }).from(accounts).where(filter);

    return { rows, total: total.value, page, perPage };
  });
}

export async function getAccount(organizationId: string, id: string) {
  return tenantDb(organizationId, async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    if (!account) return null;

    const relatedContacts = await tx
      .select()
      .from(contacts)
      .where(eq(contacts.accountId, id))
      .orderBy(asc(contacts.lastName));

    const relatedDeals = await tx
      .select({
        id: deals.id,
        name: deals.name,
        amountCents: deals.amountCents,
        status: deals.status,
        expectedCloseDate: deals.expectedCloseDate,
        stageName: stages.name,
      })
      .from(deals)
      .leftJoin(stages, eq(deals.stageId, stages.id))
      .where(eq(deals.accountId, id))
      .orderBy(desc(deals.createdAt));

    const timeline = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.relatedType, "account"), eq(activities.relatedId, id)))
      .orderBy(desc(activities.createdAt));

    return { account, contacts: relatedContacts, deals: relatedDeals, timeline };
  });
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function listContacts(organizationId: string, params: ListParams = {}) {
  const { limit, offset, page, perPage } = paginate(params);

  return tenantDb(organizationId, async (tx) => {
    const filter = params.q
      ? or(
          ilike(contacts.firstName, likeTerm(params.q)),
          ilike(contacts.lastName, likeTerm(params.q)),
          ilike(contacts.email, likeTerm(params.q)),
          ilike(contacts.title, likeTerm(params.q)),
        )
      : undefined;

    const rows = await tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        title: contacts.title,
        status: contacts.status,
        accountId: contacts.accountId,
        accountName: accounts.name,
      })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(filter)
      .orderBy(asc(contacts.lastName), asc(contacts.firstName))
      .limit(limit)
      .offset(offset);

    const [total] = await tx.select({ value: count() }).from(contacts).where(filter);

    return { rows, total: total.value, page, perPage };
  });
}

export async function getContact(organizationId: string, id: string) {
  return tenantDb(organizationId, async (tx) => {
    const [row] = await tx
      .select({
        contact: contacts,
        accountName: accounts.name,
      })
      .from(contacts)
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(contacts.id, id))
      .limit(1);
    if (!row) return null;

    const relatedDeals = await tx
      .select({
        id: deals.id,
        name: deals.name,
        amountCents: deals.amountCents,
        status: deals.status,
        stageName: stages.name,
      })
      .from(deals)
      .leftJoin(stages, eq(deals.stageId, stages.id))
      .where(eq(deals.contactId, id))
      .orderBy(desc(deals.createdAt));

    const timeline = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.relatedType, "contact"), eq(activities.relatedId, id)))
      .orderBy(desc(activities.createdAt));

    return { contact: row.contact, accountName: row.accountName, deals: relatedDeals, timeline };
  });
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export async function listLeads(
  organizationId: string,
  params: ListParams & { status?: string } = {},
) {
  const { limit, offset, page, perPage } = paginate(params);

  return tenantDb(organizationId, async (tx) => {
    const filters: SQL[] = [];
    if (params.q) {
      const search = or(
        ilike(leads.firstName, likeTerm(params.q)),
        ilike(leads.lastName, likeTerm(params.q)),
        ilike(leads.company, likeTerm(params.q)),
        ilike(leads.email, likeTerm(params.q)),
      );
      if (search) filters.push(search);
    }
    if (params.status && params.status !== "all") {
      filters.push(sql`${leads.status} = ${params.status}`);
    }
    const filter = filters.length > 0 ? and(...filters) : undefined;

    const rows = await tx
      .select()
      .from(leads)
      .where(filter)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);

    const [total] = await tx.select({ value: count() }).from(leads).where(filter);

    return { rows, total: total.value, page, perPage };
  });
}

export async function getLead(organizationId: string, id: string) {
  return tenantDb(organizationId, async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, id)).limit(1);
    if (!lead) return null;

    const timeline = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.relatedType, "lead"), eq(activities.relatedId, id)))
      .orderBy(desc(activities.createdAt));

    return { lead, timeline };
  });
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export async function listDeals(
  organizationId: string,
  params: ListParams & { status?: string } = {},
) {
  const { limit, offset, page, perPage } = paginate(params);

  return tenantDb(organizationId, async (tx) => {
    const filters: SQL[] = [];
    if (params.q) {
      const search = ilike(deals.name, likeTerm(params.q));
      if (search) filters.push(search);
    }
    if (params.status && params.status !== "all") {
      filters.push(sql`${deals.status} = ${params.status}`);
    }
    const filter = filters.length > 0 ? and(...filters) : undefined;

    const rows = await tx
      .select({
        id: deals.id,
        name: deals.name,
        amountCents: deals.amountCents,
        status: deals.status,
        expectedCloseDate: deals.expectedCloseDate,
        stageId: deals.stageId,
        stageName: stages.name,
        accountName: accounts.name,
      })
      .from(deals)
      .leftJoin(stages, eq(deals.stageId, stages.id))
      .leftJoin(accounts, eq(deals.accountId, accounts.id))
      .where(filter)
      .orderBy(desc(deals.amountCents))
      .limit(limit)
      .offset(offset);

    const [total] = await tx.select({ value: count() }).from(deals).where(filter);

    return { rows, total: total.value, page, perPage };
  });
}

/** Open deals grouped by stage, for the kanban board. */
export async function dealBoard(organizationId: string) {
  return tenantDb(organizationId, async (tx) => {
    const [pipeline] = await tx
      .select()
      .from(pipelines)
      .where(eq(pipelines.isDefault, true))
      .limit(1);

    const target = pipeline ?? (await tx.select().from(pipelines).limit(1))[0];
    if (!target) return { stages: [], dealsByStage: {} as Record<string, BoardDeal[]> };

    const stageRows = await tx
      .select()
      .from(stages)
      .where(eq(stages.pipelineId, target.id))
      .orderBy(asc(stages.position));

    const dealRows = await tx
      .select({
        id: deals.id,
        name: deals.name,
        amountCents: deals.amountCents,
        stageId: deals.stageId,
        expectedCloseDate: deals.expectedCloseDate,
        accountName: accounts.name,
      })
      .from(deals)
      .leftJoin(accounts, eq(deals.accountId, accounts.id))
      .where(eq(deals.status, "open"))
      .orderBy(desc(deals.amountCents));

    const dealsByStage: Record<string, BoardDeal[]> = {};
    for (const stage of stageRows) dealsByStage[stage.id] = [];
    for (const deal of dealRows) {
      // A deal could reference a stage outside this pipeline; bucket it rather
      // than dropping it silently.
      if (!dealsByStage[deal.stageId]) dealsByStage[deal.stageId] = [];
      dealsByStage[deal.stageId].push(deal);
    }

    return { stages: stageRows, dealsByStage };
  });
}

export type BoardDeal = {
  id: string;
  name: string;
  amountCents: number;
  stageId: string;
  expectedCloseDate: Date | null;
  accountName: string | null;
};

export async function getDeal(organizationId: string, id: string) {
  return tenantDb(organizationId, async (tx) => {
    const [row] = await tx
      .select({
        deal: deals,
        stageName: stages.name,
        accountName: accounts.name,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(deals)
      .leftJoin(stages, eq(deals.stageId, stages.id))
      .leftJoin(accounts, eq(deals.accountId, accounts.id))
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .where(eq(deals.id, id))
      .limit(1);
    if (!row) return null;

    const timeline = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.relatedType, "deal"), eq(activities.relatedId, id)))
      .orderBy(desc(activities.createdAt));

    return { ...row, timeline };
  });
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export async function listActivities(
  organizationId: string,
  params: ListParams & { type?: string } = {},
) {
  const { limit, offset, page, perPage } = paginate(params);

  return tenantDb(organizationId, async (tx) => {
    const filters: SQL[] = [];
    if (params.q) {
      const search = or(
        ilike(activities.subject, likeTerm(params.q)),
        ilike(activities.body, likeTerm(params.q)),
      );
      if (search) filters.push(search);
    }
    if (params.type && params.type !== "all") {
      filters.push(sql`${activities.type} = ${params.type}`);
    }
    const filter = filters.length > 0 ? and(...filters) : undefined;

    const rows = await tx
      .select()
      .from(activities)
      .where(filter)
      .orderBy(desc(activities.createdAt))
      .limit(limit)
      .offset(offset);

    const [total] = await tx.select({ value: count() }).from(activities).where(filter);

    return { rows, total: total.value, page, perPage };
  });
}

/** Options for the account/contact/stage pickers in forms. */
export async function formOptions(organizationId: string) {
  return tenantDb(organizationId, async (tx) => {
    const accountOptions = await tx
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .orderBy(asc(accounts.name));

    const contactOptions = await tx
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .orderBy(asc(contacts.lastName));

    const [pipeline] = await tx
      .select()
      .from(pipelines)
      .where(eq(pipelines.isDefault, true))
      .limit(1);
    const target = pipeline ?? (await tx.select().from(pipelines).limit(1))[0];

    const stageOptions = target
      ? await tx
          .select({ id: stages.id, name: stages.name })
          .from(stages)
          .where(eq(stages.pipelineId, target.id))
          .orderBy(asc(stages.position))
      : [];

    return { accounts: accountOptions, contacts: contactOptions, stages: stageOptions };
  });
}
