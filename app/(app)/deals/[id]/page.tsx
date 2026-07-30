import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CloseDealDialog } from "@/components/crm/close-deal-dialog";
import { dealFields } from "@/components/crm/field-definitions";
import { LogActivityDialog } from "@/components/crm/log-activity-dialog";
import { PageHeader } from "@/components/crm/page-header";
import { RecordFormDialog } from "@/components/crm/record-form-dialog";
import { Timeline } from "@/components/crm/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateDeal } from "@/lib/actions/deals";
import { getOrgContext } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { formOptions, getDeal } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Deal" };

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const { id } = await params;
  const [data, options] = await Promise.all([
    getDeal(context.organizationId, id),
    formOptions(context.organizationId),
  ]);
  if (!data) notFound();

  const { deal, stageName, accountName, contactFirstName, contactLastName, timeline } = data;
  const contactName =
    contactFirstName && contactLastName ? `${contactFirstName} ${contactLastName}` : null;

  return (
    <>
      <PageHeader
        title={deal.name}
        description={[accountName, stageName].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <LogActivityDialog relatedType="deal" relatedId={deal.id} />
            {deal.status === "open" ? (
              <>
                <CloseDealDialog dealId={deal.id} outcome="lost" />
                <CloseDealDialog dealId={deal.id} outcome="won" />
              </>
            ) : null}
            <RecordFormDialog
              title="Edit deal"
              trigger={<Button variant="outline">Edit</Button>}
              fields={dealFields(options)}
              action={updateDeal}
              hiddenValues={{ id: deal.id }}
              defaultValues={{
                name: deal.name,
                stageId: deal.stageId,
                amount: deal.amountCents / 100,
                expectedCloseDate: deal.expectedCloseDate
                  ? new Date(deal.expectedCloseDate).toISOString().slice(0, 10)
                  : undefined,
                accountId: deal.accountId ?? "none",
                contactId: deal.contactId ?? "none",
              }}
              successMessage="Deal updated"
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
              <CardTitle className="text-sm">Deal</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Row label="Amount">
                <span className="font-semibold">{formatCurrency(deal.amountCents)}</span>
              </Row>
              <Row label="Stage">{stageName ?? "—"}</Row>
              <Row label="Status">
                <Badge
                  variant={deal.status === "won" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {deal.status}
                </Badge>
              </Row>
              <Row label="Expected close">{formatDate(deal.expectedCloseDate)}</Row>
              {deal.closedAt ? <Row label="Closed">{formatDate(deal.closedAt)}</Row> : null}
              {deal.lostReason ? (
                <div className="mt-1 rounded-md bg-muted p-2 text-muted-foreground">
                  <p className="text-xs font-medium">Lost reason</p>
                  <p className="mt-0.5">{deal.lostReason}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Related</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {deal.accountId ? (
                <Row label="Account">
                  <Link href={`/accounts/${deal.accountId}`} className="hover:underline">
                    {accountName}
                  </Link>
                </Row>
              ) : null}
              {deal.contactId ? (
                <Row label="Contact">
                  <Link href={`/contacts/${deal.contactId}`} className="hover:underline">
                    {contactName}
                  </Link>
                </Row>
              ) : null}
              {!deal.accountId && !deal.contactId ? (
                <p className="text-muted-foreground">Nothing linked yet.</p>
              ) : null}
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
      <span className="text-right">{children}</span>
    </div>
  );
}
