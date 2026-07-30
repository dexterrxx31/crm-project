import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountsTable } from "@/components/crm/accounts-table";
import { ACCOUNT_FIELDS } from "@/components/crm/field-definitions";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { PageHeader } from "@/components/crm/page-header";
import { Pagination } from "@/components/crm/pagination";
import { RecordFormDialog } from "@/components/crm/record-form-dialog";
import { Button } from "@/components/ui/button";
import { createAccount } from "@/lib/actions/accounts";
import { getOrgContext } from "@/lib/auth-context";
import { listAccounts } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({
  searchParams,
}: {
  // Next.js 16: searchParams is async.
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const params = await searchParams;
  const { rows, total, page, perPage } = await listAccounts(context.organizationId, {
    q: params.q,
    page: params.page ? Number(params.page) : 1,
  });

  return (
    <>
      <PageHeader
        title="Accounts"
        description="The companies you sell to."
        actions={
          <RecordFormDialog
            title="New account"
            description="Create a company record."
            trigger={<Button>New account</Button>}
            fields={ACCOUNT_FIELDS}
            action={createAccount}
            submitLabel="Create account"
            successMessage="Account created"
          />
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <ListToolbar />
        <AccountsTable rows={rows} />
        <Pagination page={page} perPage={perPage} total={total} />
      </div>
    </>
  );
}
