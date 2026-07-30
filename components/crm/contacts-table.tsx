"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { DataTable } from "@/components/crm/data-table";
import { Badge } from "@/components/ui/badge";

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  status: "lead" | "active" | "inactive";
  accountId: string | null;
  accountName: string | null;
};

const STATUS_VARIANT = {
  active: "default",
  lead: "secondary",
  inactive: "outline",
} as const;

export function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<ContactRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (row) => `${row.lastName} ${row.firstName}`,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">
              {row.original.firstName} {row.original.lastName}
            </p>
            {row.original.title ? (
              <p className="text-xs text-muted-foreground">{row.original.title}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "accountName",
        header: "Account",
        cell: ({ row }) =>
          row.original.accountId ? (
            <Link
              href={`/accounts/${row.original.accountId}`}
              className="hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.original.accountName}
            </Link>
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => row.original.email ?? "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => row.original.phone ?? "—",
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
      onRowClick={(row) => router.push(`/contacts/${row.id}`)}
      emptyMessage="No contacts match this view."
    />
  );
}
