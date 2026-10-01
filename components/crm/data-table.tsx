"use client";

import {
  type ColumnDef,
  createSortedRowModel,
  flexRender,
  type RowData,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** The only feature this app's tables use. Column defs elsewhere key off
 * `DataTableColumnDef` so they don't each need to know about this object. */
const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

export type DataTableColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<
  typeof dataTableFeatures,
  TData,
  TValue
>;

/** Thin wrapper over TanStack Table. Sorting is client-side over the current page;
 * searching/pagination are server-side (nuqs-backed toolbar) since a CRM table can
 * outgrow what's sensible to ship to the browser. */
export function DataTable<TData extends RowData>({
  columns,
  data,
  onRowClick,
  emptyMessage = "Nothing here yet.",
}: {
  columns: DataTableColumnDef<TData>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  emptyMessage?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  });

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-28 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={
                  onRowClick
                    ? (event) => {
                        // Cells with their own interactive content (a dialog trigger, a
                        // nested link) mark themselves data-stop-row-click to opt out,
                        // rather than every such cell reaching for stopPropagation.
                        if ((event.target as HTMLElement).closest("[data-stop-row-click]")) return;
                        onRowClick(row.original);
                      }
                    : undefined
                }
                className={cn(onRowClick && "cursor-pointer")}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
