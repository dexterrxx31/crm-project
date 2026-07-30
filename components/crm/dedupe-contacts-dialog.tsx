"use client";

import { Users2 } from "lucide-react";
import Link from "next/link";
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
import { findDuplicatesAction } from "@/lib/actions/ai";

/** Fuzzy dedupe check over contact identity — see lib/ai/embed.ts findDuplicateContacts. */
export function DedupeContactsDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { execute, result, isPending } = useAction(findDuplicatesAction, {
    onError({ error: actionError }) {
      setError(actionError.serverError ?? "Could not check for duplicates.");
    },
  });

  const candidates = result?.data?.ok ? result.data.candidates : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !result) {
          setError(null);
          execute({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Users2 className="size-4" aria-hidden="true" />
          Check for duplicates
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Possible duplicate contacts</DialogTitle>
          <DialogDescription>
            Matched by name, email and phone similarity — review before merging.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p className="text-sm text-muted-foreground">Comparing contacts…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No likely duplicates found.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {candidates.map((pair) => (
              <li key={`${pair.a.id}-${pair.b.id}`} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/contacts/${pair.a.id}`} className="hover:underline">
                    {pair.a.name}
                    {pair.a.email ? (
                      <span className="text-muted-foreground"> · {pair.a.email}</span>
                    ) : null}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {Math.round(pair.similarity * 100)}% match
                  </span>
                </div>
                <div className="mt-1">
                  <Link href={`/contacts/${pair.b.id}`} className="hover:underline">
                    {pair.b.name}
                    {pair.b.email ? (
                      <span className="text-muted-foreground"> · {pair.b.email}</span>
                    ) : null}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
