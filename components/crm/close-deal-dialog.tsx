"use client";

import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { closeDeal } from "@/lib/actions/deals";

export function CloseDealDialog({ dealId, outcome }: { dealId: string; outcome: "won" | "lost" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { execute, isPending } = useAction(closeDeal, {
    onSuccess() {
      toast.success(outcome === "won" ? "Marked as won" : "Marked as lost");
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not close this deal.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={outcome === "won" ? "default" : "outline"}>
          {outcome === "won" ? "Mark won" : "Mark lost"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{outcome === "won" ? "Mark as won" : "Mark as lost"}</DialogTitle>
          <DialogDescription>
            {outcome === "won"
              ? "This deal will count towards closed-won revenue."
              : "Recording why you lost makes the pipeline review worth having."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            execute({
              id: dealId,
              status: outcome,
              lostReason: outcome === "lost" ? String(data.get("lostReason") ?? "") : undefined,
            });
          }}
        >
          {outcome === "lost" ? (
            <div className="grid gap-2">
              <Label htmlFor="lostReason">Reason</Label>
              <Textarea
                id="lostReason"
                name="lostReason"
                rows={3}
                placeholder="Lost on price, chose an incumbent, no budget…"
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
