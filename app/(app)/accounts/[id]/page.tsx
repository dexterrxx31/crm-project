import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ACCOUNT_FIELDS } from "@/components/crm/field-definitions";
import { LogActivityDialog } from "@/components/crm/log-activity-dialog";
import { PageHeader } from "@/components/crm/page-header";
import { RecordFormDialog } from "@/components/crm/record-form-dialog";
import { SummarizeAccountDialog } from "@/components/crm/summarize-dialog";
import { Timeline } from "@/components/crm/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateAccount } from "@/lib/actions/accounts";
import { getOrgContext } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/format";
import { getAccount } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Account" };

export default async function AccountDetailPage({
  params,
}: {
  // Next.js 16: params is async.
  params: Promise<{ id: string }>;
}) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const { id } = await params;
  const data = await getAccount(context.organizationId, id);
  // RLS means a foreign id yields null here rather than another tenant's record.
  if (!data) notFound();

  const { account, contacts, deals, timeline } = data;

  return (
    <>
      <PageHeader
        title={account.name}
        description={[account.industry, account.domain].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <SummarizeAccountDialog accountId={account.id} />
            <LogActivityDialog relatedType="account" relatedId={account.id} />
            <RecordFormDialog
              title="Edit account"
              trigger={<Button variant="outline">Edit</Button>}
              fields={ACCOUNT_FIELDS}
              action={updateAccount}
              hiddenValues={{ id: account.id }}
              defaultValues={{
                name: account.name,
                domain: account.domain,
                industry: account.industry,
                employeeCount: account.employeeCount,
                website: account.website,
                phone: account.phone,
                description: account.description,
              }}
              successMessage="Account updated"
            />
          </>
        }
      />

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Timeline</h2>
            <Timeline entries={timeline} />
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Detail label="Employees" value={account.employeeCount?.toLocaleString("en-US")} />
              <Detail label="Website" value={account.website} />
              <Detail label="Phone" value={account.phone} />
              {account.description ? (
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {account.description}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Contacts ({contacts.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {contacts.length === 0 ? (
                <p className="text-muted-foreground">No contacts yet.</p>
              ) : (
                contacts.map((contact) => (
                  <Link
                    key={contact.id}
                    href={`/contacts/${contact.id}`}
                    className="flex items-center justify-between gap-2 hover:underline"
                  >
                    <span>
                      {contact.firstName} {contact.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">{contact.title ?? ""}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Deals ({deals.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {deals.length === 0 ? (
                <p className="text-muted-foreground">No deals yet.</p>
              ) : (
                deals.map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/deals/${deal.id}`}
                    className="flex items-center justify-between gap-2 hover:underline"
                  >
                    <span className="min-w-0 truncate">{deal.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(deal.amountCents)}
                      </span>
                      <Badge variant={deal.status === "won" ? "default" : "secondary"}>
                        {deal.status === "open" ? (deal.stageName ?? "open") : deal.status}
                      </Badge>
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
