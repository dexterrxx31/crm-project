"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "@/components/crm/charts/chart-tooltip";
import { formatCurrency } from "@/lib/format";

export type FunnelDatum = {
  stageId: string;
  stageName: string;
  dealCount: number;
  valueCents: number;
};

/**
 * Open pipeline value by stage, as a horizontal bar chart.
 *
 * A single measure across ordered categories is one series, not a magnitude
 * ramp — so every bar takes the same flat color (--report-value) rather than
 * a light-to-dark sequential scale. No legend: with one series the chart
 * title already names what's being shown.
 */
export function FunnelChart({ data }: { data: FunnelDatum[] }) {
  if (data.length === 0 || data.every((d) => d.dealCount === 0)) {
    return (
      <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No open deals yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 44, 160)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          type="number"
          tickFormatter={(value) => formatCurrency(value)}
          tick={{ fontSize: 12 }}
          className="fill-muted-foreground"
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="stageName"
          width={100}
          tick={{ fontSize: 12 }}
          className="fill-foreground"
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ className: "fill-muted/50" }}
          content={(props) => (
            <ChartTooltip {...props} valueFormatter={(value) => formatCurrency(value)} />
          )}
        />
        <Bar dataKey="valueCents" name="Open value" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((entry) => (
            <Cell key={entry.stageId} fill="var(--report-value)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
