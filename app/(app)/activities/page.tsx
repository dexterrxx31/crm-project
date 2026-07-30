import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { PageHeader } from "@/components/crm/page-header";
import { Pagination } from "@/components/crm/pagination";
import { Timeline } from "@/components/crm/timeline";
import { getOrgContext } from "@/lib/auth-context";
import { listActivities } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Activities" };

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; type?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const params = await searchParams;
  const { rows, total, page, perPage } = await listActivities(context.organizationId, {
    q: params.q,
    type: params.type,
    page: params.page ? Number(params.page) : 1,
    perPage: 50,
  });

  return (
    <>
      <PageHeader
        title="Activities"
        description="Every call, meeting, email, note and task across the workspace."
      />

      <div className="flex flex-col gap-4 p-6">
        <ListToolbar
          filter={{
            key: "type",
            label: "Type",
            options: [
              { value: "call", label: "Calls" },
              { value: "meeting", label: "Meetings" },
              { value: "email", label: "Emails" },
              { value: "note", label: "Notes" },
              { value: "task", label: "Tasks" },
            ],
          }}
        />
        <Timeline entries={rows} />
        <Pagination page={page} perPage={perPage} total={total} />
      </div>
    </>
  );
}
