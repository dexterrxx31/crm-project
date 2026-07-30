"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { scoreDealAction, scoreLeadAction } from "@/lib/actions/ai";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type InsightData = {
  score: number;
  reasoning: string;
  nextAction: string | null;
  createdAt: Date;
} | null;

function scoreTone(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function Shell({
  title,
  insight,
  isPending,
  onRefresh,
}: {
  title: string;
  insight: InsightData;
  isPending: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Sparkles className="size-4" aria-hidden="true" />
          {title}
        </CardTitle>
        <Button variant="ghost" size="sm" disabled={isPending} onClick={onRefresh}>
          {isPending ? "Scoring…" : insight ? "Refresh" : "Score now"}
        </Button>
      </CardHeader>
      <CardContent>
        {!insight ? (
          <p className="text-sm text-muted-foreground">Not scored yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={cn("text-3xl font-semibold tabular-nums", scoreTone(insight.score))}>
                {insight.score}
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
              <Badge variant="outline" className="ml-auto">
                {formatDate(insight.createdAt)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{insight.reasoning}</p>
            {insight.nextAction ? (
              <p className="rounded-md bg-muted p-2 text-sm">
                <span className="font-medium">Next: </span>
                {insight.nextAction}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadInsightCard({ leadId, insight }: { leadId: string; insight: InsightData }) {
  const router = useRouter();
  const { execute, isPending } = useAction(scoreLeadAction, {
    onSuccess({ data }) {
      if (data?.ok) router.refresh();
      else toast.error(data?.message ?? "Could not score this lead.");
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not score this lead.");
    },
  });

  return (
    <Shell
      title="Lead score"
      insight={insight}
      isPending={isPending}
      onRefresh={() => execute({ leadId })}
    />
  );
}

function DealInsightCard({ dealId, insight }: { dealId: string; insight: InsightData }) {
  const router = useRouter();
  const { execute, isPending } = useAction(scoreDealAction, {
    onSuccess({ data }) {
      if (data?.ok) router.refresh();
      else toast.error(data?.message ?? "Could not score this deal.");
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not score this deal.");
    },
  });

  return (
    <Shell
      title="Deal health"
      insight={insight}
      isPending={isPending}
      onRefresh={() => execute({ dealId })}
    />
  );
}

export function AiInsightCard({
  subject,
  subjectId,
  insight,
}: {
  subject: "lead" | "deal";
  subjectId: string;
  insight: InsightData;
}) {
  return subject === "lead" ? (
    <LeadInsightCard leadId={subjectId} insight={insight} />
  ) : (
    <DealInsightCard dealId={subjectId} insight={insight} />
  );
}
