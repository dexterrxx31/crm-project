"use client";

import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

/** Shared tooltip content for the report charts. Values lead (bold), series names
 * follow, keyed by a short stroke of the series color rather than a filled box; every
 * value is also reachable without hovering, so the tooltip only enhances, never gates.
 * recharts v3 moved active/payload/label into the `content` render prop's
 * TooltipContentProps instead of TooltipProps. */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter = (value) => String(value),
}: TooltipContentProps<ValueType, NameType> & { valueFormatter?: (value: number) => string }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="min-w-40 rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      {label ? <p className="mb-1.5 font-medium">{label}</p> : null}
      <dl className="flex flex-col gap-1">
        {payload.map((entry, index) => (
          <div
            key={String(entry.dataKey ?? entry.name ?? index)}
            className="flex items-center justify-between gap-4"
          >
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </dt>
            <dd className="font-medium tabular-nums">{valueFormatter(Number(entry.value ?? 0))}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
