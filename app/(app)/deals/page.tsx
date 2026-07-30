import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DealBoard } from "@/components/crm/deal-board";
import { DealsTable } from "@/components/crm/deals-table";
import { dealFields } from "@/components/crm/field-definitions";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { PageHeader } from "@/components/crm/page-header";
import { Pagination } from "@/components/crm/pagination";
import { RecordFormDialog } from "@/components/crm/record-form-dialog";
import { Button } from "@/components/ui/button";
import { createDeal } from "@/lib/actions/deals";
import { getOrgContext } from "@/lib/auth-context";
import { dealBoard, formOptions, listDeals } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Deals" };

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; page?: string; status?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const params = await searchParams;
  const view = params.view === "list" ? "list" : "board";

  const options = await formOptions(context.organizationId);

  const newDealButton = (
    <RecordFormDialog
      title="New deal"
      trigger={<Button>New deal</Button>}
      fields={dealFields(options)}
      action={createDeal}
      defaultValues={{
        stageId: options.stages[0]?.id,
        accountId: "none",
        contactId: "none",
      }}
      submitLabel="Create deal"
      successMessage="Deal created"
    />
  );

  return (
    <>
      <PageHeader
        title="Deals"
        description="Your pipeline. Drag a card to move it between stages."
        actions={
          <>
            <div className="flex rounded-md border p-0.5">
              <Button asChild size="sm" variant={view === "board" ? "secondary" : "ghost"}>
                <Link href="/deals?view=board">Board</Link>
              </Button>
              <Button asChild size="sm" variant={view === "list" ? "secondary" : "ghost"}>
                <Link href="/deals?view=list">List</Link>
              </Button>
            </div>
            {newDealButton}
          </>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {view === "board" ? <BoardView organizationId={context.organizationId} /> : null}
        {view === "list" ? (
          <ListView organizationId={context.organizationId} params={params} />
        ) : null}
      </div>
    </>
  );
}

async function BoardView({ organizationId }: { organizationId: string }) {
  const { stages, dealsByStage } = await dealBoard(organizationId);

  if (stages.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No pipeline configured yet.
      </p>
    );
  }

  return <DealBoard stages={stages} initialDealsByStage={dealsByStage} />;
}

async function ListView({
  organizationId,
  params,
}: {
  organizationId: string;
  params: { q?: string; page?: string; status?: string };
}) {
  const { rows, total, page, perPage } = await listDeals(organizationId, {
    q: params.q,
    status: params.status,
    page: params.page ? Number(params.page) : 1,
  });

  return (
    <>
      <ListToolbar
        filter={{
          key: "status",
          label: "Status",
          options: [
            { value: "open", label: "Open" },
            { value: "won", label: "Won" },
            { value: "lost", label: "Lost" },
          ],
        }}
      />
      <DealsTable rows={rows} />
      <Pagination page={page} perPage={perPage} total={total} />
    </>
  );
}
