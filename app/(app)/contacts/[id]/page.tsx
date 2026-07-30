import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DraftEmailDialog } from "@/components/crm/draft-email-dialog";
import { contactFields } from "@/components/crm/field-definitions";
import { LogActivityDialog } from "@/components/crm/log-activity-dialog";
import { PageHeader } from "@/components/crm/page-header";
import { RecordFormDialog } from "@/components/crm/record-form-dialog";
import { SummarizeContactDialog } from "@/components/crm/summarize-dialog";
import { Timeline } from "@/components/crm/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateContact } from "@/lib/actions/contacts";
import { getOrgContext } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/format";
import { formOptions, getContact } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const { id } = await params;
  const [data, options] = await Promise.all([
    getContact(context.organizationId, id),
    formOptions(context.organizationId),
  ]);
  if (!data) notFound();

  const { contact, accountName, deals, timeline } = data;

  return (
    <>
      <PageHeader
        title={`${contact.firstName} ${contact.lastName}`}
        description={[contact.title, accountName].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <SummarizeContactDialog contactId={contact.id} />
            <DraftEmailDialog contactId={contact.id} hasEmail={Boolean(contact.email)} />
            <LogActivityDialog relatedType="contact" relatedId={contact.id} />
            <RecordFormDialog
              title="Edit contact"
              trigger={<Button>Edit</Button>}
              fields={contactFields(options.accounts)}
              action={updateContact}
              hiddenValues={{ id: contact.id }}
              defaultValues={{
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: contact.phone,
                title: contact.title,
                status: contact.status,
                accountId: contact.accountId ?? "none",
              }}
              successMessage="Contact updated"
            />
          </>
        }
      />

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Timeline</h2>
          <Timeline entries={timeline} />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Row label="Status">
                <Badge variant="secondary" className="capitalize">
                  {contact.status}
                </Badge>
              </Row>
              {contact.email ? (
                <Row label="Email">
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                </Row>
              ) : null}
              {contact.phone ? <Row label="Phone">{contact.phone}</Row> : null}
              {contact.accountId ? (
                <Row label="Account">
                  <Link href={`/accounts/${contact.accountId}`} className="hover:underline">
                    {accountName}
                  </Link>
                </Row>
              ) : null}
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
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatCurrency(deal.amountCents)}
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
