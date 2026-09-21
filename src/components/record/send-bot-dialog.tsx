"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  CircleStop,
  FlaskConical,
  Loader2,
  SkipForward,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROUTES } from "@/lib/routes";
import type { BotSessionResponse } from "@/lib/contracts";
import { api } from "@/lib/ui/api";
import { errorMessage, invalidate, useApi } from "@/lib/ui/use-api";
import { formatClock } from "@/lib/ui/format";
import type { BotState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PLATFORM_META, PlatformIcon, detectPlatformClient } from "./platform";

/** Header button → "Send Fanthom to a meeting" dialog. */
export function SendBotButton({
  className,
  label = "Send to meeting",
  initialUrl,
  initialTitle,
  variant = "outline",
}: {
  className?: string;
  label?: string;
  initialUrl?: string | null;
  initialTitle?: string;
  variant?: "outline" | "default";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} className={cn("rounded-full px-3.5", className)} onClick={() => setOpen(true)}>
        <Bot /> <span className="hidden sm:inline">{label}</span>
      </Button>
      <SendBotDialog open={open} onOpenChange={setOpen} initialUrl={initialUrl} initialTitle={initialTitle} />
    </>
  );
}

export function SendBotDialog({
  open,
  onOpenChange,
  initialUrl,
  initialTitle,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialUrl?: string | null;
  initialTitle?: string;
  /** Open straight onto an existing session's live panel. */
  sessionId?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <SendBotFlow
            initialUrl={initialUrl}
            initialTitle={initialTitle}
            sessionId={sessionId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SimulatedBadge() {
  return (
    <span
      title="No real meeting is joined in this demo: the bot walks through its states on a timer and then creates a call from a sample recording."
      className="inline-flex h-5 items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/8 px-2 text-[10px] font-medium uppercase tracking-wider text-amber-200/90"
    >
      <FlaskConical className="size-3" /> Simulated bot in demo
    </span>
  );
}

function SendBotFlow({
  initialUrl,
  initialTitle,
  sessionId,
  onClose,
}: {
  initialUrl?: string | null;
  initialTitle?: string;
  sessionId?: string | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [title, setTitle] = useState(initialTitle ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(sessionId ?? null);
  const platform = detectPlatformClient(url);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platform) {
      setErr("Paste a full meeting link, e.g. https://zoom.us/j/123456789");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await api<BotSessionResponse>(ROUTES.api.bots, {
        method: "POST",
        json: { meeting_url: url.trim(), ...(title.trim() ? { title: title.trim() } : {}) },
      });
      setSession(r.session.id);
      invalidate("bots");
    } catch (e2) {
      setErr(errorMessage(e2, "Couldn't send the bot"));
    } finally {
      setBusy(false);
    }
  };

  if (session) return <BotSessionPanel id={session} onClose={onClose} />;

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>Send Fanthom to a meeting</DialogTitle>
          <SimulatedBadge />
        </div>
        <DialogDescription>
          Paste a Zoom, Google Meet or Teams link. Fanthom joins as a participant, records, and your notes are ready right after.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <label htmlFor="bot-url" className="text-xs font-medium text-muted-foreground">
          Meeting link
        </label>
        <div className="relative">
          <input
            id="bot-url"
            autoFocus
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setErr(null);
            }}
            inputMode="url"
            placeholder="https://meet.google.com/abc-defg-hij"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-3 pr-11 text-sm outline-none focus:border-primary/50"
          />
          {platform && <PlatformIcon platform={platform} className="absolute right-2.5 top-1/2 -translate-y-1/2" />}
        </div>
        <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
          {platform && platform !== "unknown" ? (
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <Check className="size-3" /> {PLATFORM_META[platform].label} meeting detected
            </span>
          ) : platform === "unknown" ? (
            "We couldn't recognise the platform — Fanthom will still try the link."
          ) : (
            "Works with Zoom, Google Meet and Microsoft Teams."
          )}
        </p>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="bot-title" className="text-xs font-medium text-muted-foreground">
          Title <span className="font-normal">(optional)</span>
        </label>
        <input
          id="bot-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="e.g. Weekly pipeline review"
          className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
        />
      </div>
      {err && (
        <p className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {err}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !url.trim()} className="rounded-full bg-white px-4 text-neutral-950 hover:bg-white/90">
          {busy ? <Loader2 className="animate-spin" /> : <Bot />} Send Fanthom
        </Button>
      </div>
    </form>
  );
}

const STEPS: { state: BotState; label: string; hint: string }[] = [
  { state: "joining", label: "Joining", hint: "Connecting to the meeting" },
  { state: "waiting_room", label: "Waiting room", hint: "Waiting for the host to admit Fanthom" },
  { state: "recording", label: "Recording", hint: "Capturing audio and speakers" },
  { state: "processing", label: "Processing", hint: "Transcribing and writing notes" },
  { state: "done", label: "Done", hint: "Your call is ready" },
];
const ORDER: BotState[] = ["joining", "waiting_room", "recording", "processing", "done"];

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Live bot session: polls GET /api/bots/:id and renders the state machine. */
export function BotSessionPanel({ id, onClose }: { id: string; onClose?: () => void }) {
  const terminal = (s?: BotState) => s === "done" || s === "failed";
  const [stopPolling, setStopPolling] = useState(false);
  const { data, error, loading, setData } = useApi<BotSessionResponse>(ROUTES.api.bot(id), {
    pollMs: stopPolling ? undefined : 1500,
  });
  const s = data?.session;
  if (s && terminal(s.state) && !stopPolling) {
    setStopPolling(true);
  }
  useEffect(() => {
    if (!s || !terminal(s.state)) return;
    invalidate("bots", "meetings", "notifications");
    if (s.state === "done") toast.success(`“${s.title}” is ready`, { description: "The bot left the meeting and wrote your notes." });
  }, [s?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = useNow(s?.state === "recording");
  const [acting, setActing] = useState<string | null>(null);

  const advance = async (action: "next" | "stop" | "fail") => {
    setActing(action);
    try {
      const r = await api<BotSessionResponse>(ROUTES.api.botAdvance(id), {
        method: "POST",
        json: { action, ...(action === "fail" ? { note: "Removed from the meeting by you" } : {}) },
      });
      setData(r);
    } catch (e) {
      toast.error("Couldn't update the bot", { description: errorMessage(e) });
    } finally {
      setActing(null);
    }
  };

  if (loading)
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Connecting to the bot…
      </div>
    );
  if (!s)
    return (
      <div className="py-8 text-center">
        <TriangleAlert className="mx-auto size-5 text-red-300" />
        <p className="mt-2 text-sm font-medium">Couldn&apos;t load this bot session</p>
        <p className="mt-1 text-xs text-muted-foreground">{errorMessage(error)}</p>
      </div>
    );

  const idx = s.state === "failed" ? -1 : ORDER.indexOf(s.state);
  const recElapsed = s.admitted_at
    ? (s.recording_ended_at ? new Date(s.recording_ended_at).getTime() : now) - new Date(s.admitted_at).getTime()
    : 0;

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <PlatformIcon platform={s.platform} />
          <DialogTitle className="min-w-0 truncate">{s.title}</DialogTitle>
        </div>
        <DialogDescription className="truncate">{s.meeting_url}</DialogDescription>
        {s.simulated && (
          <div>
            <SimulatedBadge />
          </div>
        )}
      </DialogHeader>

      {s.state === "recording" && (
        <div className="flex items-center justify-between rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-red-100">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
            </span>
            Recording
          </span>
          <span className="font-mono text-lg tabular-nums text-white">{formatClock(Math.max(0, recElapsed))}</span>
        </div>
      )}

      {s.state === "failed" ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-red-100">
            <X className="size-4" /> The bot didn&rsquo;t finish
          </p>
          <p className="mt-1 text-xs text-red-100/70">{s.error ?? s.events.at(-1)?.note ?? "It was removed or couldn&apos;t join."}</p>
        </div>
      ) : (
        <ol className="grid gap-3">
          {STEPS.map((step, i) => {
            const done = i < idx || s.state === "done";
            const current = i === idx && s.state !== "done";
            const ev = s.events.find((e) => e.state === step.state);
            return (
              <li key={step.state} className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px]",
                    done && "border-sky-400/60 bg-primary text-white",
                    current && "border-sky-400/70 bg-primary/20 text-sky-200 shadow-[0_0_16px_-4px_var(--brand)]",
                    !done && !current && "border-white/10 bg-white/[0.03] text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3" /> : current ? <Loader2 className="size-3 animate-spin" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", done || current ? "font-medium text-white" : "text-muted-foreground")}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{ev?.note ?? step.hint}</p>
                </div>
                {ev && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground" suppressHydrationWarning>
                    {new Date(ev.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
        {s.state === "done" && s.meeting_id ? (
          <Button asChild className="rounded-full bg-white px-4 text-neutral-950 hover:bg-white/90">
            <Link href={ROUTES.pages.call(s.meeting_id)} onClick={onClose}>
              Open the call <ArrowRight />
            </Link>
          </Button>
        ) : terminal(s.state) ? (
          <Button variant="outline" className="rounded-full" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" disabled={!!acting} onClick={() => advance("fail")} className="mr-auto text-muted-foreground">
              Remove bot
            </Button>
            {s.state === "recording" ? (
              <Button size="sm" disabled={!!acting} onClick={() => advance("stop")} className="rounded-full bg-red-500/90 px-3 text-white hover:bg-red-500">
                {acting === "stop" ? <Loader2 className="animate-spin" /> : <CircleStop />} Stop recording
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={!!acting}
                onClick={() => advance("next")}
                title="The simulated bot advances on its own; this skips ahead."
                className="rounded-full"
              >
                {acting === "next" ? <Loader2 className="animate-spin" /> : <SkipForward />}
                {s.state === "waiting_room" ? "Admit bot" : "Skip ahead"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
