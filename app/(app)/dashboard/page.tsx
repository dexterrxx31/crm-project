import { and, count, eq, isNull, lt, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForecastChart } from "@/components/crm/charts/forecast-chart";
import { FunnelChart } from "@/components/crm/charts/funnel-chart";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/lib/auth-context";
import { activities, contacts, deals, leads } from "@/lib/db/schema";
import { tenantDb } from "@/lib/db/tenant";
import { formatCurrency } from "@/lib/format";
import { closeForecast, pipelineFunnel } from "@/lib/queries/reports";

export const metadata: Metadata = { title: "Dashboard" };

async function dashboardStats(organizationId: string) {
  return tenantDb(organizationId, async (tx) => {
    const [pipeline] = await tx
      .select({
        openCount: count(),
        openValue: sql<number>`coalesce(sum(${deals.amountCents}), 0)`.mapWith(Number),
      })
      .from(deals)
      .where(eq(deals.status, "open"));

    const [won] = await tx
      .select({
        wonCount: count(),
        wonValue: sql<number>`coalesce(sum(${deals.amountCents}), 0)`.mapWith(Number),
      })
      .from(deals)
      .where(eq(deals.status, "won"));

    const [lost] = await tx
      .select({ lostCount: count() })
      .from(deals)
      .where(eq(deals.status, "lost"));

    const [contactCount] = await tx.select({ value: count() }).from(contacts);
    const [openLeads] = await tx
      .select({ value: count() })
      .from(leads)
      .where(sql`${leads.status} in ('new', 'working', 'qualified')`);

    const [overdue] = await tx
      .select({ value: count() })
      .from(activities)
      .where(
        and(
          eq(activities.type, "task"),
          isNull(activities.completedAt),
          lt(activities.dueAt, new Date()),
        ),
      );

    const decided = won.wonCount + lost.lostCount;

    return {
      openCount: pipeline.openCount,
      openValue: pipeline.openValue,
      wonValue: won.wonValue,
      winRate: decided === 0 ? null : Math.round((won.wonCount / decided) * 100),
      contacts: contactCount.value,
      openLeads: openLeads.value,
      overdueTasks: overdue.value,
    };
  });
}

export default async function DashboardPage() {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const [stats, funnel, forecast] = await Promise.all([
    dashboardStats(context.organizationId),
    pipelineFunnel(context.organizationId),
    closeForecast(context.organizationId),
  ]);

  const tiles = [
    {
      label: "Open pipeline",
      value: formatCurrency(stats.openValue),
      hint: `${stats.openCount} open deals`,
    },
    { label: "Won", value: formatCurrency(stats.wonValue), hint: "closed-won to date" },
    {
      label: "Win rate",
      value: stats.winRate === null ? "—" : `${stats.winRate}%`,
      hint: stats.winRate === null ? "no closed deals yet" : "of decided deals",
    },
    { label: "Contacts", value: String(stats.contacts), hint: `${stats.openLeads} open leads` },
  ];

  return (
    <>
      <PageHeader
        title={`Good to see you, ${context.userName.split(" ")[0]}`}
        description={`Pipeline overview for ${context.organizationName}.`}
      />

      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">{tile.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.overdueTasks > 0 ? (
        <div className="px-6">
          <Card className="border-destructive/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Needs attention</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {stats.overdueTasks} overdue {stats.overdueTasks === 1 ? "task" : "tasks"}.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 p-6 pt-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pipeline by stage</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart data={funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Forecast — next 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            <ForecastChart data={forecast} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
