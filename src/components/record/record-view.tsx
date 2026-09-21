"use client";

import { useState } from "react";
import { Bot, ChevronRight, History, Upload } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/routes";
import type { ListBotSessionsResponse } from "@/lib/contracts";
import { errorMessage, useApi } from "@/lib/ui/use-api";
import type { BotState, Capabilities } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "./platform";
import { Recorder } from "./recorder";
import { SendBotDialog } from "./send-bot-dialog";

const STATE_LABEL: Record<BotState, { label: string; tone: string }> = {
  joining: { label: "Joining", tone: "text-sky-300 bg-sky-400/10" },
  waiting_room: { label: "Waiting room", tone: "text-amber-200 bg-amber-300/10" },
  recording: { label: "Recording", tone: "text-red-300 bg-red-400/10" },
  processing: { label: "Processing", tone: "text-violet-300 bg-violet-400/10" },
  done: { label: "Done", tone: "text-emerald-300 bg-emerald-400/10" },
  failed: { label: "Failed", tone: "text-red-300 bg-red-400/10" },
};

export function RecordView({ capabilities }: { capabilities: Capabilities }) {
  const [botOpen, setBotOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessions = useApi<ListBotSessionsResponse>(ROUTES.api.bots, { tags: ["bots"] });
  const list = sessions.data?.sessions ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Record</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Capture a conversation right here in your browser, or send Fanthom into a Zoom, Meet or Teams call.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Record in your browser">
          <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Record in your browser
          </h2>
          <Recorder capabilities={capabilities} />
        </section>

        <aside className="flex flex-col gap-6">
          <section aria-label="Send Fanthom to a live meeting">
            <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              Live meeting
            </h2>
            <div className="glass relative overflow-hidden rounded-3xl p-5">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.22),transparent)]"
              />
              <span className="relative flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sky-300">
                <Bot className="size-5" />
              </span>
              <p className="relative mt-4 text-base font-semibold tracking-tight">Send Fanthom to a meeting</p>
              <p className="relative mt-1 text-sm text-muted-foreground">
                Paste a meeting link — the notetaker joins, records and writes your notes.
              </p>
              <div className="relative mt-3 flex items-center gap-1.5">
                <PlatformIcon platform="zoom" />
                <PlatformIcon platform="google_meet" />
                <PlatformIcon platform="teams" />
                <span className="ml-1 text-[11px] text-amber-200/80">Bot is simulated in this demo</span>
              </div>
              <Button
                onClick={() => {
                  setSessionId(null);
                  setBotOpen(true);
                }}
                className="relative mt-4 w-full rounded-full bg-white text-neutral-950 hover:bg-white/90"
              >
                <Bot /> Send to a meeting
              </Button>
            </div>
          </section>

          <section aria-label="Recent bot sessions">
            <h2 className="mb-3 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              <History className="size-3" /> Recent bot sessions
            </h2>
            <div className="glass overflow-hidden rounded-2xl">
              {sessions.loading ? (
                <div className="space-y-3 p-4">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-6 rounded-md" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))}
                </div>
              ) : sessions.error ? (
                <div className="p-4 text-sm text-muted-foreground">
                  {errorMessage(sessions.error, "Couldn't load sessions")}{" "}
                  <button type="button" onClick={sessions.reload} className="text-sky-300 hover:underline">
                    Retry
                  </button>
                </div>
              ) : list.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No bot sessions yet. Sent bots show up here with their status.</p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {list.slice(0, 8).map((s) => {
                    const st = STATE_LABEL[s.state];
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSessionId(s.id);
                            setBotOpen(true);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04]"
                        >
                          <PlatformIcon platform={s.platform} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{s.title}</span>
                            <span className="block text-[11px] text-muted-foreground" suppressHydrationWarning>
                              {new Date(s.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </span>
                          </span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", st.tone)}>{st.label}</span>
                          <ChevronRight className="size-3.5 text-muted-foreground" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <Link
            href={ROUTES.pages.upload}
            className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-sm transition-colors hover:bg-white/[0.04]"
          >
            <Upload className="size-4 text-muted-foreground" />
            <span className="flex-1">
              Already have a recording?
              <span className="block text-xs text-muted-foreground">Upload an audio or video file instead</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </aside>
      </div>

      <SendBotDialog open={botOpen} onOpenChange={setBotOpen} sessionId={sessionId} />
    </div>
  );
}
