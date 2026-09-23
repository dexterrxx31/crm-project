"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { convertLead } from "@/lib/actions/leads";

/**
 * Lead conversion. Creates (or reuses) an account, creates a contact on it and
 * optionally opens a deal — all in one transaction server-side.
 */
export function ConvertLeadDialog({
  lead,
}: {
  lead: { id: string; firstName: string; lastName: string; company: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createDeal, setCreateDeal] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const { execute, isPending, reset } = useAction(convertLead, {
    onSuccess({ data }) {
      toast.success("Lead converted");
      setOpen(false);
      router.push(data?.dealId ? `/deals/${data.dealId}` : `/contacts/${data?.contactId}`);
      router.refresh();
    },
    onError({ error }) {
      setFormError(error.serverError ?? "Could not convert this lead.");
    },
  });

  const suggestedName = lead.company ?? `${lead.firstName} ${lead.lastName}`;

  // Shared by onOpenChange (Escape, backdrop click) and the Cancel button, so
  // cancelling doesn't leave a stale error behind for the next time this opens.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFormError(null);
      reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Convert</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Convert {lead.firstName} {lead.lastName}
          </DialogTitle>
          <DialogDescription>
            Creates an account and a contact. An account with a matching name is reused rather than
            duplicated.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            execute({
              id: lead.id,
              accountName: String(data.get("accountName") ?? ""),
              createDeal,
              dealName: String(data.get("dealName") ?? ""),
              dealAmount: String(data.get("dealAmount") ?? "0"),
            });
          }}
        >
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="accountName">
              Account name<span className="text-destructive"> *</span>
            </Label>
            <Input id="accountName" name="accountName" defaultValue={suggestedName} required />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="createDeal"
              checked={createDeal}
              onCheckedChange={(checked) => setCreateDeal(checked === true)}
            />
            <Label htmlFor="createDeal" className="font-normal">
              Also open a deal
            </Label>
          </div>

          {createDeal ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="dealName">Deal name</Label>
                <Input
                  id="dealName"
                  name="dealName"
                  placeholder={`${suggestedName} — ${lead.firstName} ${lead.lastName}`}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dealAmount">Amount</Label>
                <Input id="dealAmount" name="dealAmount" type="number" placeholder="0.00" />
              </div>
            </>
          ) : null}

          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Converting…" : "Convert lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
