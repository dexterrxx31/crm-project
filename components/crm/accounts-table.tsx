"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { DataTable } from "@/components/crm/data-table";
import { formatCurrency } from "@/lib/format";

export type AccountRow = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  employeeCount: number | null;
  contactCount: number;
  openDealValue: number;
};

export function AccountsTable({ rows }: { rows: AccountRow[] }) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<AccountRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            {row.original.domain ? (
              <p className="text-xs text-muted-foreground">{row.original.domain}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ row }) => row.original.industry ?? "—",
      },
      {
        accessorKey: "employeeCount",
        header: "Employees",
        cell: ({ row }) =>
          row.original.employeeCount != null
            ? row.original.employeeCount.toLocaleString("en-US")
            : "—",
      },
      { accessorKey: "contactCount", header: "Contacts" },
      {
        accessorKey: "openDealValue",
        header: "Open pipeline",
        cell: ({ row }) => formatCurrency(row.original.openDealValue),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      onRowClick={(row) => router.push(`/accounts/${row.id}`)}
      emptyMessage="No accounts match this view."
    />
  );
}
