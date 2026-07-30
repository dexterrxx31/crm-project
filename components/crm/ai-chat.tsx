"use client";

import { Check, Loader2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { AgentEvent } from "@/lib/ai/agent";
import { readSseEvents } from "@/lib/ai/sse-client";
import { cn } from "@/lib/utils";

/**
 * "Ask Synapse" — the CRM agent chat.
 *
 * Two parallel pieces of state, deliberately not the same thing:
 *  - `wireMessages` is the exact Anthropic-format transcript the server
 *    expects back on every request (see lib/ai/agent.ts) — built purely from
 *    "assistant-message" / "user-message" events, never hand-constructed.
 *  - `entries` is what's actually rendered — a friendlier shape (running
 *    text, tool-status lines, a confirmation card) folded from the same
 *    event stream.
 */
type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "status"; text: string }
  | {
      kind: "confirmation";
      id: string;
      description: string;
      resolution?: "allow" | "deny";
    }
  | { kind: "error"; text: string };

export function AiChat() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const wireMessages = useRef<unknown[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  /** Applies one SSE event to both the wire transcript and the display list. */
  function applyEvent(event: AgentEvent) {
    switch (event.type) {
      case "text-delta": {
        setEntries((prev) => {
          const last = prev.at(-1);
          if (last?.kind === "assistant") {
            return [...prev.slice(0, -1), { kind: "assistant", text: last.text + event.text }];
          }
          return [...prev, { kind: "assistant", text: event.text }];
        });
        break;
      }
      case "tool-call": {
        setEntries((prev) => [...prev, { kind: "status", text: `${toolLabel(event.name)}…` }]);
        break;
      }
      case "tool-result": {
        setEntries((prev) => [...prev, { kind: "status", text: event.summary }]);
        break;
      }
      case "assistant-message": {
        wireMessages.current = [
          ...wireMessages.current,
          { role: "assistant", content: event.content },
        ];
        break;
      }
      case "user-message": {
        wireMessages.current = [...wireMessages.current, { role: "user", content: event.content }];
        break;
      }
      case "confirmation-required": {
        setEntries((prev) => [
          ...prev,
          { kind: "confirmation", id: event.id, description: event.description },
        ]);
        break;
      }
      case "error": {
        setEntries((prev) => [...prev, { kind: "error", text: event.message }]);
        break;
      }
      case "done":
        break;
    }
    scrollToBottom();
  }

  async function consumeAndApply(response: Response) {
    for await (const event of readSseEvents<AgentEvent>(response)) {
      applyEvent(event);
    }
    // A write mutated CRM data — refresh server components so the rest of
    // the app (lists, detail pages) reflects it without a manual reload.
    router.refresh();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setEntries((prev) => [...prev, { kind: "user", text }]);
    wireMessages.current = [
      ...wireMessages.current,
      { role: "user", content: [{ type: "text", text }] },
    ];
    scrollToBottom();

    setBusy(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: wireMessages.current }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Request failed." }));
        setEntries((prev) => [...prev, { kind: "error", text: body.error ?? "Request failed." }]);
        return;
      }
      await consumeAndApply(response);
    } finally {
      setBusy(false);
    }
  }

  async function resolveConfirmation(id: string, decision: "allow" | "deny") {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.kind === "confirmation" && entry.id === id
          ? { ...entry, resolution: decision }
          : entry,
      ),
    );
    setBusy(true);
    try {
      const response = await fetch("/api/ai/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: wireMessages.current, toolUseId: id, decision }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Request failed." }));
        setEntries((prev) => [...prev, { kind: "error", text: body.error ?? "Request failed." }]);
        return;
      }
      await consumeAndApply(response);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2">
          <Sparkles className="size-4" aria-hidden="true" />
          Ask Synapse
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4" aria-hidden="true" />
            Ask Synapse
          </SheetTitle>
          <SheetDescription>
            Ask about your pipeline, or ask it to log activity and move deals — every change asks
            for confirmation first.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4" viewportRef={scrollRef}>
          <div className="flex flex-col gap-3 py-4">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Try: "What deals are closing this month?" or "Log a call with Rahul about the
                renewal and follow up next week."
              </p>
            ) : null}

            {entries.map((entry, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: entries are append-only and never reordered
              <div key={index}>
                {entry.kind === "user" ? (
                  <div className="ml-8 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {entry.text}
                  </div>
                ) : null}

                {entry.kind === "assistant" ? (
                  <div className="mr-8 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">
                    {entry.text}
                  </div>
                ) : null}

                {entry.kind === "status" ? (
                  <p className="px-1 text-xs text-muted-foreground">{entry.text}</p>
                ) : null}

                {entry.kind === "error" ? (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {entry.text}
                  </p>
                ) : null}

                {entry.kind === "confirmation" ? (
                  <div className="mr-8 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="outline">Needs confirmation</Badge>
                    </div>
                    <p className="text-sm">{entry.description}</p>
                    {entry.resolution ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {entry.resolution === "allow" ? "Confirmed." : "Declined."}
                      </p>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => resolveConfirmation(entry.id, "allow")}
                        >
                          <Check className="size-4" aria-hidden="true" />
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => resolveConfirmation(entry.id, "deny")}
                        >
                          <X className="size-4" aria-hidden="true" />
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))}

            {busy ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : null}
          </div>
        </ScrollArea>

        <form
          className={cn("flex items-end gap-2 border-t p-4")}
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about your pipeline…"
            rows={2}
            className="resize-none"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            Send
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function toolLabel(name: string): string {
  switch (name) {
    case "search_records":
      return "Searching your CRM";
    case "get_record":
      return "Looking up the record";
    case "list_pipeline_stages":
      return "Checking pipeline stages";
    default:
      return "Working";
  }
}
