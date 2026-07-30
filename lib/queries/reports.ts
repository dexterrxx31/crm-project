import { and, asc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { deals, pipelines, stages } from "@/lib/db/schema";
import { type TenantTx, tenantDb } from "@/lib/db/tenant";

/**
 * Aggregate queries for the dashboard's charts. Kept separate from
 * lib/queries/crm.ts because these return chart-shaped rows (pre-aggregated,
 * pre-bucketed) rather than record lists.
 */

async function defaultPipelineId(tx: TenantTx): Promise<string | null> {
  const [pipeline] = await tx
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.isDefault, true))
    .limit(1);
  if (pipeline) return pipeline.id;

  const [fallback] = await tx.select({ id: pipelines.id }).from(pipelines).limit(1);
  return fallback?.id ?? null;
}

export type FunnelStage = {
  stageId: string;
  stageName: string;
  position: number;
  probability: number;
  dealCount: number;
  valueCents: number;
};

/** Open deals grouped by stage, in pipeline order — the shape a funnel needs. */
export async function pipelineFunnel(organizationId: string): Promise<FunnelStage[]> {
  return tenantDb(organizationId, async (tx) => {
    const pipelineId = await defaultPipelineId(tx);
    if (!pipelineId) return [];

    const rows = await tx
      .select({
        stageId: stages.id,
        stageName: stages.name,
        position: stages.position,
        probability: stages.probability,
        dealCount: sql<number>`count(${deals.id})`.mapWith(Number),
        valueCents: sql<number>`coalesce(sum(${deals.amountCents}), 0)`.mapWith(Number),
      })
      .from(stages)
      .leftJoin(deals, and(eq(deals.stageId, stages.id), eq(deals.status, "open")))
      .where(eq(stages.pipelineId, pipelineId))
      .groupBy(stages.id, stages.name, stages.position, stages.probability)
      .orderBy(asc(stages.position));

    return rows;
  });
}

export type ForecastBucket = {
  /** "2026-08" — sorts and groups cleanly, formatted for display in the chart. */
  month: string;
  label: string;
  dealCount: number;
  /** Full deal value in the bucket. */
  valueCents: number;
  /** Value weighted by each deal's stage probability — the "realistic" forecast line. */
  weightedCents: number;
};

/**
 * Open deals with an expected close date, bucketed by month, for the next
 * `monthsAhead` months starting this month. Deals with no expected close date
 * or a date in the past are excluded — they don't belong on a forward-looking
 * forecast, and a deal overdue for closing is a dashboard "needs attention"
 * concern, not a forecast one.
 */
export async function closeForecast(
  organizationId: string,
  monthsAhead = 6,
): Promise<ForecastBucket[]> {
  return tenantDb(organizationId, async (tx) => {
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1);

    const rows = await tx
      .select({
        expectedCloseDate: deals.expectedCloseDate,
        amountCents: deals.amountCents,
        probability: stages.probability,
      })
      .from(deals)
      .innerJoin(stages, eq(deals.stageId, stages.id))
      .where(
        and(
          eq(deals.status, "open"),
          isNotNull(deals.expectedCloseDate),
          gte(deals.expectedCloseDate, rangeStart),
          lt(deals.expectedCloseDate, rangeEnd),
        ),
      );

    // Pre-fill every month in range so a quiet month renders as a zero bar
    // rather than a gap the chart would otherwise skip.
    const buckets = new Map<string, ForecastBucket>();
    for (let i = 0; i < monthsAhead; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = monthKey(date);
      buckets.set(key, {
        month: key,
        label: monthLabel(date),
        dealCount: 0,
        valueCents: 0,
        weightedCents: 0,
      });
    }

    for (const row of rows) {
      if (!row.expectedCloseDate) continue;
      const key = monthKey(row.expectedCloseDate);
      const bucket = buckets.get(key);
      if (!bucket) continue; // outside the pre-filled range (shouldn't happen given the WHERE clause)

      bucket.dealCount += 1;
      bucket.valueCents += row.amountCents;
      bucket.weightedCents += Math.round((row.amountCents * row.probability) / 100);
    }

    return Array.from(buckets.values());
  });
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}
