"use client";

import { Sparkles } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { backfillEmbeddingsAction } from "@/lib/actions/ai";

/** Manual trigger for the semantic-search index. Records are also embedded automatically
 * on create/update via Inngest; this stays useful as a "rebuild the whole index" escape hatch. */
export function BackfillEmbeddingsButton() {
  const { execute, isPending } = useAction(backfillEmbeddingsAction, {
    onSuccess({ data }) {
      if (!data?.ok) {
        toast.error(data?.message ?? "Could not update the search index.");
        return;
      }
      const total =
        data.counts.accounts + data.counts.contacts + data.counts.deals + data.counts.activities;
      toast.success(total === 0 ? "Search index already up to date." : `Indexed ${total} records.`);
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not update the search index.");
    },
  });

  return (
    <Button variant="outline" className="gap-2" disabled={isPending} onClick={() => execute({})}>
      <Sparkles className="size-4" aria-hidden="true" />
      {isPending ? "Indexing…" : "Rebuild search index"}
    </Button>
  );
}
