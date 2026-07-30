import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContactsTable } from "@/components/crm/contacts-table";
import { contactFields } from "@/components/crm/field-definitions";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { PageHeader } from "@/components/crm/page-header";
import { Pagination } from "@/components/crm/pagination";
import { RecordFormDialog } from "@/components/crm/record-form-dialog";
import { Button } from "@/components/ui/button";
import { createContact } from "@/lib/actions/contacts";
import { getOrgContext } from "@/lib/auth-context";
import { formOptions, listContacts } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const context = await getOrgContext();
  if (!context) redirect("/login");

  const params = await searchParams;
  const [{ rows, total, page, perPage }, options] = await Promise.all([
    listContacts(context.organizationId, {
      q: params.q,
      page: params.page ? Number(params.page) : 1,
    }),
    formOptions(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Contacts"
        description="The people you talk to."
        actions={
          <RecordFormDialog
            title="New contact"
            trigger={<Button>New contact</Button>}
            fields={contactFields(options.accounts)}
            action={createContact}
            defaultValues={{ status: "lead", accountId: "none" }}
            submitLabel="Create contact"
            successMessage="Contact created"
          />
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <ListToolbar />
        <ContactsTable rows={rows} />
        <Pagination page={page} perPage={perPage} total={total} />
      </div>
    </>
  );
}
