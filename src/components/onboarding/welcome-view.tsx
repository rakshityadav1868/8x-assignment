"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, Check, FlaskConical, Loader2, Mic, PlayCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SendBotDialog } from "@/components/record/send-bot-dialog";
import { usePrefs } from "@/components/settings/use-prefs";
import { ROUTES } from "@/lib/routes";
import type { MeResponse } from "@/lib/contracts";
import { useApi } from "@/lib/ui/use-api";
import { SUMMARY_TEMPLATES } from "@/lib/templates";
import type { SummaryTemplateKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = ["Connect calendar", "Pick your notes template", "Capture your first meeting"] as const;

const CALENDARS = [
  { key: "google", name: "Google Calendar", mono: "G", tint: "#4285f4" },
  { key: "outlook", name: "Microsoft Outlook", mono: "O", tint: "#0a64d6" },
];

export function WelcomeView() {
  const router = useRouter();
  const me = useApi<MeResponse>(ROUTES.api.me).data;
  const { prefs, loading, update } = usePrefs();
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [botOpen, setBotOpen] = useState(false);
  const firstName = me?.user.name.split(" ")[0];

  const connect = async (name: string) => {
    setConnecting(name);
    const ok = await update({ calendar_connected: true }, { quiet: true });
    setConnecting(null);
    if (ok) {
      toast.success(`${name} connected`, { description: "Simulated in this demo — your upcoming meetings are sample events." });
      setStep(1);
    }
  };

  const finish = async (href: string) => {
    setFinishing(true);
    await update({ onboarding_completed: true }, { quiet: true });
    router.push(href);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-16 pt-8 md:pt-14">
      <p className="text-sm text-sky-300">Welcome{firstName ? `, ${firstName}` : ""}</p>
      <h1 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Let&apos;s set up your notetaker.</h1>
      <p className="mt-2 text-sm text-muted-foreground">Three quick steps. You can change any of this later in Settings.</p>

      <ol className="mt-8 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => i <= step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className="flex min-w-0 items-center gap-2 text-left disabled:cursor-default"
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  i < step && "border-sky-400/60 bg-primary text-white",
                  i === step && "border-sky-400/70 bg-primary/20 text-sky-200 shadow-[0_0_18px_-4px_var(--brand)]",
                  i > step && "border-white/10 text-muted-foreground",
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("hidden truncate text-xs sm:block", i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            </button>
            {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < step ? "bg-sky-400/50" : "bg-white/10")} />}
          </li>
        ))}
      </ol>

      <div className="glass mt-6 rounded-3xl p-5 md:p-7">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="mt-4 h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : step === 0 ? (
          <div className="animate-rise">
            <h2 className="text-lg font-semibold tracking-tight">Connect your calendar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fanthom looks at upcoming meetings so it can join and record the ones you choose.
            </p>
            <div className="mt-5 grid gap-2.5">
              {CALENDARS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={!!connecting}
                  onClick={() => void connect(c.name)}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-60"
                >
                  <span
                    className="flex size-10 items-center justify-center rounded-xl text-sm font-bold"
                    style={{ color: c.tint, backgroundColor: `${c.tint}1f`, boxShadow: `inset 0 0 0 1px ${c.tint}40` }}
                  >
                    {c.mono}
                  </span>
                  <span className="flex-1 text-sm font-medium">Connect {c.name}</span>
                  {connecting === c.name ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2.5 text-xs text-amber-100/80">
              <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
              Calendar OAuth is simulated in this demo: connecting links a sample calendar with realistic upcoming meetings.
            </p>
            <div className="mt-6 flex items-center justify-between gap-2">
              {prefs?.calendar_connected ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                  <Check className="size-3.5" /> A calendar is already connected
                </span>
              ) : (
                <span />
              )}
              {prefs?.calendar_connected ? (
                <Button onClick={() => setStep(1)} className="rounded-full bg-white px-4 text-neutral-950 hover:bg-white/90">
                  Continue <ArrowRight />
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Skip for now <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        ) : step === 1 ? (
          <div className="animate-rise">
            <h2 className="text-lg font-semibold tracking-tight">How should your notes look?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pick a default template — every call can still switch templates in one click.</p>
            <div role="radiogroup" aria-label="Default template" className="mt-5 grid gap-2 sm:grid-cols-2">
              {SUMMARY_TEMPLATES.map((t) => {
                const on = prefs?.default_template === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => void update({ default_template: t.key as SummaryTemplateKey }, { quiet: true })}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition-colors",
                      on ? "border-primary/50 bg-primary/[0.09] shadow-[0_0_24px_-12px_var(--brand)]" : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {t.name}
                      {on && <Check className="size-3.5 text-sky-300" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t.description}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={() => setStep(2)} className="rounded-full bg-white px-4 text-neutral-950 hover:bg-white/90">
                Continue <ArrowRight />
              </Button>
            </div>
          </div>
        ) : (
          <div className="animate-rise">
            <h2 className="text-lg font-semibold tracking-tight">Capture your first meeting</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pick whichever is easiest right now.</p>
            <div className="mt-5 grid gap-2.5">
              <Choice icon={Mic} title="Record in your browser" desc="Mic, plus an optional screen or tab" onClick={() => void finish(ROUTES.pages.record)} />
              <Choice icon={Bot} title="Send Fanthom to a meeting" desc="Paste a Zoom, Meet or Teams link (simulated bot)" onClick={() => setBotOpen(true)} />
              <Choice icon={Upload} title="Upload a recording" desc="Audio or video you already have" onClick={() => void finish(ROUTES.pages.upload)} />
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft /> Back
              </Button>
              <Button
                disabled={finishing}
                onClick={() => void finish(ROUTES.pages.calls)}
                className="rounded-full bg-white px-4 text-neutral-950 hover:bg-white/90"
              >
                {finishing ? <Loader2 className="animate-spin" /> : <PlayCircle />} Explore sample calls first
              </Button>
            </div>
          </div>
        )}
      </div>

      <Link href={ROUTES.pages.calls} className="mt-6 self-center text-xs text-muted-foreground hover:text-foreground">
        Skip setup and go to my calls
      </Link>

      <SendBotDialog
        open={botOpen}
        onOpenChange={(o) => {
          setBotOpen(o);
          if (!o) void update({ onboarding_completed: true }, { quiet: true });
        }}
      />
    </div>
  );
}

function Choice({ icon: Icon, title, desc, onClick }: { icon: typeof Mic; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-left transition-colors hover:border-sky-400/30 hover:bg-white/[0.06]"
    >
      <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sky-300">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
