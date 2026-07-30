import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AiInsightCard } from "@/components/crm/ai-insight-card";
import { ConvertLeadDialog } from "@/components/crm/convert-lead-dialog";
import { LEAD_FIELDS } from "@/components/crm/field-definitions";
import { LogActivityDialog } from "@/components/crm/log-activity-dialog";
import { PageHeader } from "@/components/crm/page-header";
import { RecordFormDialog } from "@/components/crm/record-form-dialog";
import { Timeline } from "@/components/crm/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateLead } from "@/lib/actions/leads";
import { latestInsight } from "@/lib/ai/scoring";
import { getOrgContext } from "@/lib/auth-context";
import { getLead } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const { id } = await params;
  const [data, insight] = await Promise.all([
    getLead(context.organizationId, id),
    latestInsight(context.organizationId, "lead", id, "lead_score"),
  ]);
  if (!data) notFound();

  const { lead, timeline } = data;

  return (
    <>
      <PageHeader
        title={`${lead.firstName} ${lead.lastName}`}
        description={[lead.company, lead.title].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <LogActivityDialog relatedType="lead" relatedId={lead.id} />
            {lead.status !== "converted" ? <ConvertLeadDialog lead={lead} /> : null}
            <RecordFormDialog
              title="Edit lead"
              trigger={<Button variant="outline">Edit</Button>}
              fields={LEAD_FIELDS}
              action={updateLead}
              hiddenValues={{ id: lead.id }}
              defaultValues={{
                firstName: lead.firstName,
                lastName: lead.lastName,
                company: lead.company,
                email: lead.email,
                phone: lead.phone,
                title: lead.title,
                source: lead.source,
                status: lead.status,
              }}
              successMessage="Lead updated"
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
          <AiInsightCard subject="lead" subjectId={lead.id} insight={insight} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Row label="Status">
                <Badge variant="secondary" className="capitalize">
                  {lead.status}
                </Badge>
              </Row>
              {lead.email ? (
                <Row label="Email">
                  <a href={`mailto:${lead.email}`} className="hover:underline">
                    {lead.email}
                  </a>
                </Row>
              ) : null}
              {lead.phone ? <Row label="Phone">{lead.phone}</Row> : null}
              {lead.source ? <Row label="Source">{lead.source}</Row> : null}
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
