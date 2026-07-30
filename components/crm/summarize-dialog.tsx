"use client";

import { Sparkles } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { summarizeAccountAction, summarizeContactAction } from "@/lib/actions/ai";

function Shell({
  open,
  onOpenChange,
  onOpen,
  isPending,
  summary,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: () => void;
  isPending: boolean;
  summary: string | null;
  error: string | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next && !summary && !isPending) onOpen();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="size-4" aria-hidden="true" />
          Catch me up
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Catch me up</DialogTitle>
          <DialogDescription>
            An AI-generated summary of this record's recent activity.
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Reading the timeline…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : summary ? (
          <p className="whitespace-pre-wrap text-sm">{summary}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function SummarizeAccountDialog({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { execute, isPending } = useAction(summarizeAccountAction, {
    onSuccess({ data }) {
      if (data?.ok) setSummary(data.summary);
      else setError(data?.message ?? "Could not summarize this account.");
    },
    onError({ error: actionError }) {
      setError(actionError.serverError ?? "Could not summarize this account.");
    },
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      onOpen={() => {
        setError(null);
        execute({ accountId });
      }}
      isPending={isPending}
      summary={summary}
      error={error}
    />
  );
}

export function SummarizeContactDialog({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { execute, isPending } = useAction(summarizeContactAction, {
    onSuccess({ data }) {
      if (data?.ok) setSummary(data.summary);
      else setError(data?.message ?? "Could not summarize this contact.");
    },
    onError({ error: actionError }) {
      setError(actionError.serverError ?? "Could not summarize this contact.");
    },
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      onOpen={() => {
        setError(null);
        execute({ contactId });
      }}
      isPending={isPending}
      summary={summary}
      error={error}
    />
  );
}
