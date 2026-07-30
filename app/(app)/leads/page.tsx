import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LEAD_FIELDS } from "@/components/crm/field-definitions";
import { LeadsTable } from "@/components/crm/leads-table";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { PageHeader } from "@/components/crm/page-header";
import { Pagination } from "@/components/crm/pagination";
import { RecordFormDialog } from "@/components/crm/record-form-dialog";
import { Button } from "@/components/ui/button";
import { createLead } from "@/lib/actions/leads";
import { getOrgContext } from "@/lib/auth-context";
import { listLeads } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const params = await searchParams;
  const { rows, total, page, perPage } = await listLeads(context.organizationId, {
    q: params.q,
    status: params.status,
    page: params.page ? Number(params.page) : 1,
  });

  return (
    <>
      <PageHeader
        title="Leads"
        description="Unqualified interest, before it becomes a contact and a deal."
        actions={
          <RecordFormDialog
            title="New lead"
            trigger={<Button>New lead</Button>}
            fields={LEAD_FIELDS}
            action={createLead}
            defaultValues={{ status: "new" }}
            submitLabel="Create lead"
            successMessage="Lead created"
          />
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <ListToolbar
          filter={{
            key: "status",
            label: "Status",
            options: [
              { value: "new", label: "New" },
              { value: "working", label: "Working" },
              { value: "qualified", label: "Qualified" },
              { value: "unqualified", label: "Unqualified" },
              { value: "converted", label: "Converted" },
            ],
          }}
        />
        <LeadsTable rows={rows} />
        <Pagination page={page} perPage={perPage} total={total} />
      </div>
    </>
  );
}
