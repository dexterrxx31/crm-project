import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { PageHeader } from "@/components/crm/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hydrateSemanticResults, semanticSearch } from "@/lib/ai/embed";
import { getOrgContext } from "@/lib/auth-context";
import { hasVoyageKey } from "@/lib/env";
import { formatCurrency } from "@/lib/format";
import { listAccounts, listActivities, listContacts, listDeals } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const { q } = await searchParams;
  const term = q?.trim();

  // Keyword search across the four record types.
  const results = term
    ? await Promise.all([
        listAccounts(context.organizationId, { q: term, perPage: 5 }),
        listContacts(context.organizationId, { q: term, perPage: 5 }),
        listDeals(context.organizationId, { q: term, perPage: 5 }),
        listActivities(context.organizationId, { q: term, perPage: 5 }),
      ])
    : null;

  // Semantic layer, additive: catches results that share no words with the
  // query (e.g. searching "compliance" finds a note about "SOC 2 report").
  // Silently skipped without VOYAGE_API_KEY — keyword search alone still works.
  const semanticResults =
    term && hasVoyageKey()
      ? await semanticSearch(context.organizationId, term, { limit: 6 }).then((hits) =>
          hydrateSemanticResults(context.organizationId, hits),
        )
      : [];

  return (
    <>
      <PageHeader title="Search" description="Across accounts, contacts, deals and activities." />

      <div className="flex flex-col gap-6 p-6">
        <ListToolbar />

        {!term ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Type to search.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ResultCard title="Accounts" count={results?.[0].total ?? 0}>
              {results?.[0].rows.map((row) => (
                <Link key={row.id} href={`/accounts/${row.id}`} className="block hover:underline">
                  {row.name}
                </Link>
              ))}
            </ResultCard>

            <ResultCard title="Contacts" count={results?.[1].total ?? 0}>
              {results?.[1].rows.map((row) => (
                <Link key={row.id} href={`/contacts/${row.id}`} className="block hover:underline">
                  {row.firstName} {row.lastName}
                  {row.accountName ? (
                    <span className="text-muted-foreground"> · {row.accountName}</span>
                  ) : null}
                </Link>
              ))}
            </ResultCard>

            <ResultCard title="Deals" count={results?.[2].total ?? 0}>
              {results?.[2].rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/deals/${row.id}`}
                  className="flex items-center justify-between gap-2 hover:underline"
                >
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatCurrency(row.amountCents)}
                  </span>
                </Link>
              ))}
            </ResultCard>

            <ResultCard title="Activities" count={results?.[3].total ?? 0}>
              {results?.[3].rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/${row.relatedType}s/${row.relatedId}`}
                  className="block hover:underline"
                >
                  <span className="mr-2">
                    <Badge variant="secondary" className="capitalize">
                      {row.type}
                    </Badge>
                  </span>
                  {row.subject}
                </Link>
              ))}
            </ResultCard>
          </div>
        )}

        {term && semanticResults.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Similar meaning, different words
            </h2>
            <div className="flex flex-col gap-2">
              {semanticResults.map((result) => (
                <Link
                  key={`${result.sourceType}:${result.sourceId}`}
                  href={result.href}
                  className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50"
                >
                  <Badge variant="secondary" className="mt-0.5 shrink-0 capitalize">
                    {result.sourceType}
                  </Badge>
                  <div className="min-w-0">
                    <p className="font-medium">{result.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{result.chunk}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ResultCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          {title}
          <Badge variant="outline">{count}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {count === 0 ? <p className="text-muted-foreground">No matches.</p> : children}
      </CardContent>
    </Card>
  );
}
