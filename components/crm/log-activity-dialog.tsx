"use client";

import { RecordFormDialog } from "@/components/crm/record-form-dialog";
import { Button } from "@/components/ui/button";
import { createActivity } from "@/lib/actions/activities";

/**
 * "Log a call / note / task" against any record. `relatedType` and `relatedId`
 * are passed as hidden values rather than form inputs so they cannot be edited
 * in the DOM to attach an activity to someone else's record.
 */
export function LogActivityDialog({
  relatedType,
  relatedId,
  label = "Log activity",
}: {
  relatedType: "account" | "contact" | "lead" | "deal";
  relatedId: string;
  label?: string;
}) {
  return (
    <RecordFormDialog
      title="Log activity"
      description="Record a call, meeting, note or task against this record."
      trigger={<Button variant="outline">{label}</Button>}
      action={createActivity}
      hiddenValues={{ relatedType, relatedId }}
      submitLabel="Log it"
      successMessage="Activity logged"
      defaultValues={{ type: "note" }}
      fields={[
        {
          name: "type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "note", label: "Note" },
            { value: "call", label: "Call" },
            { value: "meeting", label: "Meeting" },
            { value: "email", label: "Email" },
            { value: "task", label: "Task" },
          ],
        },
        { name: "subject", label: "Subject", type: "text", required: true },
        { name: "body", label: "Details", type: "textarea" },
        {
          name: "dueAt",
          label: "Due date",
          type: "date",
          hint: "Only used for tasks.",
        },
      ]}
    />
  );
}
