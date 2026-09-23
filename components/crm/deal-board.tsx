"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardCode,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { moveDeal } from "@/lib/actions/deals";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BoardDeal = {
  id: string;
  name: string;
  amountCents: number;
  stageId: string;
  expectedCloseDate: Date | null;
  accountName: string | null;
};

export type BoardStage = { id: string; name: string; probability: number };

// dnd-kit's default coordinate getter moves 25px per arrow press — for this board's
// w-72 (288px) columns that's a dozen presses to cross one. Columns are laid out
// purely horizontally, so a bigger horizontal step (and no vertical movement) gets a
// card into the next column in two or three presses instead.
const boardKeyboardCoordinateGetter: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
  const step = 120;
  switch (event.code) {
    case KeyboardCode.Right:
      return { ...currentCoordinates, x: currentCoordinates.x + step };
    case KeyboardCode.Left:
      return { ...currentCoordinates, x: currentCoordinates.x - step };
    default:
      return undefined;
  }
};

export function DealBoard({
  stages,
  initialDealsByStage,
}: {
  stages: BoardStage[];
  initialDealsByStage: Record<string, BoardDeal[]>;
}) {
  const router = useRouter();
  const [dealsByStage, setDealsByStage] = useState(initialDealsByStage);
  const [dragging, setDragging] = useState<BoardDeal | null>(null);

  // useState only seeds the first render — without this, a router.refresh() (ours after
  // a move, or the realtime listener below after someone else's) never reaches local state.
  useEffect(() => {
    setDealsByStage(initialDealsByStage);
  }, [initialDealsByStage]);

  // Another tab/teammate's move calls publishDealBoardEvent (lib/actions/deals.ts);
  // this listens on the SSE channel and refreshes so this board picks it up too.
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (event) => {
      if (!event.data || event.data.startsWith(":")) return;
      try {
        const payload = JSON.parse(event.data);
        if (typeof payload.type === "string" && payload.type.startsWith("deal.")) {
          router.refresh();
        }
      } catch {
        // Not JSON (e.g. a stray comment/heartbeat line) — ignore.
      }
    };
    return () => source.close();
  }, [router]);

  // Require a small drag distance so clicking a card still navigates. KeyboardSensor
  // makes cards movable by Tab + Space/Enter + arrow keys, with the wider horizontal
  // step above — this board is plain droppable columns, not @dnd-kit/sortable, so
  // there's no built-in "jump to next column" to reach for instead.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinateGetter }),
  );

  const { execute } = useAction(moveDeal, {
    onError({ error }) {
      toast.error(error.serverError ?? "Could not move that deal.");
      // Server rejected the move — resync rather than leave the board lying.
      setDealsByStage(initialDealsByStage);
      router.refresh();
    },
    onSuccess() {
      router.refresh();
    },
  });

  function handleDragStart(event: DragStartEvent) {
    const deal = Object.values(dealsByStage)
      .flat()
      .find((candidate) => candidate.id === event.active.id);
    setDragging(deal ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const dealId = String(event.active.id);
    const targetStageId = event.over ? String(event.over.id) : null;
    if (!targetStageId) return;

    const sourceStageId = Object.keys(dealsByStage).find((stageId) =>
      dealsByStage[stageId]?.some((deal) => deal.id === dealId),
    );
    if (!sourceStageId || sourceStageId === targetStageId) return;

    const deal = dealsByStage[sourceStageId]?.find((candidate) => candidate.id === dealId);
    if (!deal) return;

    // Move locally first so the board feels instant; the action reconciles.
    setDealsByStage((current) => ({
      ...current,
      [sourceStageId]: current[sourceStageId].filter((candidate) => candidate.id !== dealId),
      [targetStageId]: [{ ...deal, stageId: targetStageId }, ...(current[targetStageId] ?? [])],
    }));

    execute({ id: dealId, stageId: targetStageId });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <StageColumn key={stage.id} stage={stage} deals={dealsByStage[stage.id] ?? []} />
        ))}
      </div>

      <DragOverlay>{dragging ? <DealCard deal={dragging} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function StageColumn({ stage, deals }: { stage: BoardStage; deals: BoardDeal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((sum, deal) => sum + deal.amountCents, 0);

  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <header className="flex items-baseline justify-between gap-2 border-b px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{stage.name}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(total)}</p>
        </div>
        <Badge variant="secondary">{deals.length}</Badge>
      </header>

      <div className="flex min-h-24 flex-col gap-2 p-2">
        {deals.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">Drop a deal here</p>
        ) : (
          deals.map((deal) => <DealCard key={deal.id} deal={deal} />)
        )}
      </div>
    </section>
  );
}

function DealCard({ deal, overlay = false }: { deal: BoardDeal; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });

  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      className={cn(
        "rounded-md border bg-background p-3 shadow-sm",
        !overlay && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        overlay && "rotate-2 shadow-lg",
      )}
    >
      <Link
        href={`/deals/${deal.id}`}
        className="text-sm font-medium hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {deal.name}
      </Link>
      {deal.accountName ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{deal.accountName}</p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{formatCurrency(deal.amountCents)}</span>
        {deal.expectedCloseDate ? (
          <span className="text-xs text-muted-foreground">
            {formatDate(deal.expectedCloseDate)}
          </span>
        ) : null}
      </div>
    </article>
  );
}
