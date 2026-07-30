"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLegend } from "@/components/crm/charts/chart-legend";
import { ChartTooltip } from "@/components/crm/charts/chart-tooltip";
import { formatCurrency } from "@/lib/format";

export type ForecastDatum = {
  month: string;
  label: string;
  valueCents: number;
  weightedCents: number;
};

/**
 * Deals expected to close over the next several months: full pipeline value
 * as bars, and that value weighted by each deal's stage probability as a
 * line — two measures of the same $ unit sharing one axis (never split
 * across a second axis).
 */
export function ForecastChart({ data }: { data: ForecastDatum[] }) {
  const hasAnyValue = data.some((d) => d.valueCents > 0);

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { label: "Pipeline value", color: "var(--report-value)" },
          { label: "Weighted forecast", color: "var(--report-forecast)" },
        ]}
      />

      {!hasAnyValue ? (
        <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          No deals with an expected close date in this range.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value) => formatCurrency(value)}
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip
              cursor={{ className: "fill-muted/50" }}
              content={(props) => (
                <ChartTooltip {...props} valueFormatter={(value) => formatCurrency(value)} />
              )}
            />
            <Bar
              dataKey="valueCents"
              name="Pipeline value"
              fill="var(--report-value)"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            />
            <Line
              dataKey="weightedCents"
              name="Weighted forecast"
              stroke="var(--report-forecast)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--report-forecast)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
