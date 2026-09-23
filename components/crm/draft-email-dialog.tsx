"use client";

import { Mail } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { draftEmailAction } from "@/lib/actions/ai";

/** Drafts a follow-up email and lets the rep copy it. Sending isn't wired up yet — this
 * produces a subject + body the rep pastes into their own mail client, which is still
 * the useful part: the drafting. */
export function DraftEmailDialog({
  contactId,
  hasEmail,
}: {
  contactId: string;
  hasEmail: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);

  const { execute, isPending } = useAction(draftEmailAction, {
    onSuccess({ data }) {
      if (data?.ok) setDraft(data.draft);
      else toast.error(data?.message ?? "Could not draft an email.");
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not draft an email.");
    },
  });

  if (!hasEmail) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Mail className="size-4" aria-hidden="true" />
          Draft email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft a follow-up</DialogTitle>
          <DialogDescription>
            Grounded in this contact's recent activity. Review before sending.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="instructions">Anything specific? (optional)</Label>
              <Textarea
                id="instructions"
                rows={3}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="e.g. mention the pricing update, propose a call next week"
              />
            </div>
            <DialogFooter>
              <Button
                disabled={isPending}
                onClick={() => execute({ contactId, instructions: instructions || undefined })}
              >
                {isPending ? "Drafting…" : "Draft it"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="draft-subject">Subject</Label>
              <Input id="draft-subject" readOnly value={draft.subject} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="draft-body">Body</Label>
              <Textarea id="draft-body" readOnly rows={10} value={draft.body} />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>
                Draft again
              </Button>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
                  toast.success("Copied to clipboard");
                }}
              >
                Copy
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
