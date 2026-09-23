import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { deals, leads, organization } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";
import { inngest } from "@/lib/inngest/client";

/** Safety bound per org per run — a demo/dev-scale cap, not a spec requirement. */
const MAX_PER_ORG = 100;

/**
 * Once a day, re-scores every open lead/deal across every org — catches drift no
 * single edit would trigger. Fans out via `step.sendEvent` into the same per-record
 * events the on-change path uses, rather than scoring inline, so one org's backlog
 * can't block another's. `organization` has no RLS (it's the tenant table itself), so
 * listing orgs uses the plain `db` client; everything under an org still goes through
 * `tenantDb`.
 */
export const nightlyScoringSweep = inngest.createFunction(
  { id: "nightly-scoring-sweep", retries: 1, triggers: [{ cron: "0 13 * * *" }] },
  async ({ step }) => {
    const orgs = await step.run("list-organizations", () =>
      db.select({ id: organization.id }).from(organization),
    );

    let totalLeads = 0;
    let totalDeals = 0;

    for (const org of orgs) {
      const [openLeads, openDeals] = await step.run(`list-open-records-${org.id}`, () =>
        tenantDb(org.id, async (tx) => {
          const leadRows = await tx
            .select({ id: leads.id })
            .from(leads)
            .where(inArray(leads.status, ["new", "working", "qualified"]))
            .limit(MAX_PER_ORG);
          const dealRows = await tx
            .select({ id: deals.id })
            .from(deals)
            .where(eq(deals.status, "open"))
            .limit(MAX_PER_ORG);
          return [leadRows, dealRows] as const;
        }),
      );

      if (openLeads.length > 0) {
        await step.sendEvent(
          `send-lead-scoring-${org.id}`,
          openLeads.map((lead) => ({
            name: "lead/scoring.requested" as const,
            data: { organizationId: org.id, leadId: lead.id },
          })),
        );
        totalLeads += openLeads.length;
      }

      if (openDeals.length > 0) {
        await step.sendEvent(
          `send-deal-scoring-${org.id}`,
          openDeals.map((deal) => ({
            name: "deal/scoring.requested" as const,
            data: { organizationId: org.id, dealId: deal.id },
          })),
        );
        totalDeals += openDeals.length;
      }
    }

    return { organizations: orgs.length, leadsQueued: totalLeads, dealsQueued: totalDeals };
  },
);
