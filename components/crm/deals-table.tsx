"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { DataTable } from "@/components/crm/data-table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";

export type DealRow = {
  id: string;
  name: string;
  amountCents: number;
  status: "open" | "won" | "lost";
  expectedCloseDate: Date | null;
  stageName: string | null;
  accountName: string | null;
};

const STATUS_VARIANT = { open: "secondary", won: "default", lost: "outline" } as const;

export function DealsTable({ rows }: { rows: DealRow[] }) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<DealRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Deal",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            {row.original.accountName ? (
              <p className="text-xs text-muted-foreground">{row.original.accountName}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "stageName",
        header: "Stage",
        cell: ({ row }) => row.original.stageName ?? "—",
      },
      {
        accessorKey: "amountCents",
        header: "Amount",
        cell: ({ row }) => (
          <span className="font-medium">{formatCurrency(row.original.amountCents)}</span>
        ),
      },
      {
        accessorKey: "expectedCloseDate",
        header: "Expected close",
        cell: ({ row }) => formatDate(row.original.expectedCloseDate),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize">
            {row.original.status}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      onRowClick={(row) => router.push(`/deals/${row.id}`)}
      emptyMessage="No deals match this view."
    />
  );
}
