import type { FormField } from "@/components/crm/record-form-dialog";

/**
 * Form field definitions, kept out of the page modules so both the list page
 * (create) and the detail page (edit) can share one definition.
 */

export const ACCOUNT_FIELDS: FormField[] = [
  { name: "name", label: "Account name", type: "text", required: true },
  { name: "domain", label: "Domain", type: "text", placeholder: "acme.com" },
  { name: "industry", label: "Industry", type: "text" },
  { name: "employeeCount", label: "Employees", type: "number" },
  { name: "website", label: "Website", type: "text" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "description", label: "Notes", type: "textarea" },
];

export function contactFields(accountOptions: { id: string; name: string }[]): FormField[] {
  return [
    { name: "firstName", label: "First name", type: "text", required: true },
    { name: "lastName", label: "Last name", type: "text", required: true },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "title", label: "Job title", type: "text" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "lead", label: "Lead" },
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
    {
      name: "accountId",
      label: "Account",
      type: "select",
      options: [
        { value: "none", label: "No account" },
        ...accountOptions.map((account) => ({ value: account.id, label: account.name })),
      ],
    },
  ];
}

export const LEAD_FIELDS: FormField[] = [
  { name: "firstName", label: "First name", type: "text", required: true },
  { name: "lastName", label: "Last name", type: "text", required: true },
  { name: "company", label: "Company", type: "text" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "title", label: "Job title", type: "text" },
  { name: "source", label: "Source", type: "text", placeholder: "Webinar, referral…" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "new", label: "New" },
      { value: "working", label: "Working" },
      { value: "qualified", label: "Qualified" },
      { value: "unqualified", label: "Unqualified" },
    ],
  },
];

export function dealFields(options: {
  stages: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  contacts: { id: string; firstName: string; lastName: string }[];
}): FormField[] {
  return [
    { name: "name", label: "Deal name", type: "text", required: true },
    {
      name: "stageId",
      label: "Stage",
      type: "select",
      required: true,
      options: options.stages.map((stage) => ({ value: stage.id, label: stage.name })),
    },
    { name: "amount", label: "Amount", type: "number", placeholder: "0.00" },
    { name: "expectedCloseDate", label: "Expected close", type: "date" },
    {
      name: "accountId",
      label: "Account",
      type: "select",
      options: [
        { value: "none", label: "No account" },
        ...options.accounts.map((account) => ({ value: account.id, label: account.name })),
      ],
    },
    {
      name: "contactId",
      label: "Primary contact",
      type: "select",
      options: [
        { value: "none", label: "No contact" },
        ...options.contacts.map((contact) => ({
          value: contact.id,
          label: `${contact.firstName} ${contact.lastName}`,
        })),
      ],
    },
  ];
}
