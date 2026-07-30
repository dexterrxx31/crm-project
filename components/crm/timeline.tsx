"use client";

import { CalendarClock, Check, ListTodo, Mail, NotebookPen, Phone, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleTask } from "@/lib/actions/activities";
import { extractActionItemsAction } from "@/lib/actions/ai";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TimelineEntry = {
  id: string;
  type: "call" | "meeting" | "email" | "note" | "task";
  subject: string;
  body: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

const ICONS = {
  call: Phone,
  meeting: Users,
  email: Mail,
  note: NotebookPen,
  task: CalendarClock,
} as const;

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const router = useRouter();
  const { execute } = useAction(toggleTask, {
    onSuccess() {
      router.refresh();
    },
    onError() {
      toast.error("Could not update that task.");
    },
  });
  const { execute: extractItems, isPending: isExtracting } = useAction(extractActionItemsAction, {
    onSuccess({ data }) {
      if (!data?.ok) {
        toast.error(data?.message ?? "Could not extract action items.");
        return;
      }
      if (data.items.length === 0) {
        toast.info("No action items found in this note.");
        return;
      }
      toast.success(`Created ${data.items.length} task${data.items.length === 1 ? "" : "s"}`);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not extract action items.");
    },
  });

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No activity logged yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => {
        const Icon = ICONS[entry.type];
        const done = Boolean(entry.completedAt);
        const overdue =
          entry.type === "task" &&
          !done &&
          entry.dueAt != null &&
          new Date(entry.dueAt) < new Date();

        return (
          <li key={entry.id} className="flex gap-3 rounded-lg border p-3">
            <div
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("font-medium", done && "text-muted-foreground line-through")}>
                  {entry.subject}
                </p>
                <Badge variant="secondary" className="capitalize">
                  {entry.type}
                </Badge>
                {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
              </div>

              {entry.body ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {entry.body}
                </p>
              ) : null}

              <p className="mt-1.5 text-xs text-muted-foreground">
                {entry.type === "task" && entry.dueAt
                  ? `Due ${formatRelative(entry.dueAt)} · ${formatDate(entry.dueAt)}`
                  : formatDate(entry.createdAt)}
              </p>
            </div>

            {entry.type === "task" ? (
              <Button
                variant={done ? "ghost" : "outline"}
                size="sm"
                className="shrink-0 self-start"
                onClick={() => execute({ id: entry.id, completed: !done })}
              >
                <Check className="size-4" aria-hidden="true" />
                {done ? "Undo" : "Done"}
              </Button>
            ) : null}

            {(entry.type === "note" || entry.type === "call" || entry.type === "meeting") &&
            entry.body ? (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 self-start"
                disabled={isExtracting}
                onClick={() => extractItems({ activityId: entry.id })}
              >
                <ListTodo className="size-4" aria-hidden="true" />
                Extract tasks
              </Button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
