"use client";

import { Search } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Search + filter controls backed by the URL rather than component state, so a
 * filtered view can be linked, bookmarked and shared — which is table stakes
 * for a CRM ("send me the list you're looking at").
 */
export function ListToolbar({
  filter,
  children,
}: {
  filter?: { key: string; label: string; options: { value: string; label: string }[] };
  children?: React.ReactNode;
}) {
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ shallow: false, throttleMs: 350 }),
  );
  const [, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  );
  const [filterValue, setFilterValue] = useQueryState(
    filter?.key ?? "filter",
    parseAsString.withDefault("all").withOptions({ shallow: false }),
  );

  // Local mirror so typing stays responsive while the URL update is throttled.
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={draft}
          placeholder="Search…"
          aria-label="Search"
          className="pl-8"
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            setPage(1);
            setQuery(next || null);
          }}
        />
      </div>

      {filter ? (
        <Select
          value={filterValue}
          onValueChange={(value) => {
            setPage(1);
            setFilterValue(value === "all" ? null : value);
          }}
        >
          <SelectTrigger className="w-44" aria-label={filter.label}>
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All {filter.label.toLowerCase()}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
