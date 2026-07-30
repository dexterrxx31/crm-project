"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ConvertLeadDialog } from "@/components/crm/convert-lead-dialog";
import { DataTable } from "@/components/crm/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export type LeadRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  source: string | null;
  status: "new" | "working" | "qualified" | "unqualified" | "converted";
  createdAt: Date;
};

const STATUS_VARIANT = {
  new: "secondary",
  working: "secondary",
  qualified: "default",
  unqualified: "outline",
  converted: "default",
} as const;

export function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<LeadRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Lead",
        accessorFn: (row) => `${row.lastName} ${row.firstName}`,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">
              {row.original.firstName} {row.original.lastName}
            </p>
            {row.original.email ? (
              <p className="text-xs text-muted-foreground">{row.original.email}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "company",
        header: "Company",
        cell: ({ row }) => row.original.company ?? "—",
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => row.original.source ?? "—",
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
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div data-stop-row-click>
            {row.original.status === "converted" ? (
              <span className="text-xs text-muted-foreground">Converted</span>
            ) : (
              <ConvertLeadDialog lead={row.original} />
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      onRowClick={(row) => router.push(`/leads/${row.id}`)}
      emptyMessage="No leads match this view."
    />
  );
}
