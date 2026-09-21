"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, FastForward, Gavel, Loader2, Mail, RefreshCw, Settings2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DemoModeBadge, EmptyState, ErrorState, TimestampChip } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { useCall } from "@/components/call/call-context";
import { usePlayerStore } from "@/hooks/use-player";
import {
  ROUTES,
  type CatchUpResponse,
  type DecisionsResponse,
  type GetSummaryResponse,
  type RegenerateSummaryResponse,
} from "@/lib/contracts";
import { LANGUAGE_LABELS, SUMMARY_TEMPLATES, TEMPLATE_BY_KEY } from "@/lib/templates";
import { api, copyText } from "@/lib/ui/api";
import { formatClock } from "@/lib/ui/format";
import { SUMMARY_LANGUAGES, type Decision, type Summary, type SummaryLanguage, type SummaryTemplateKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FollowUpEmailDialog } from "./follow-up-email-dialog";

const SALES = new Set<SummaryTemplateKey>(["sales", "sales_bant", "sales_meddpicc", "sales_spiced"]);

function summaryToMarkdown(s: Summary, title: string): string {
  if (s.markdown?.trim()) return s.markdown;
  const lines = [`# ${title}`, ""];
  for (const sec of s.sections) {
    lines.push(`## ${sec.heading}`);
    for (const b of sec.bullets) lines.push(`- ${b.text} (${formatClock(b.start_ms)})`);
    lines.push("");
  }
  return lines.join("\n");
}

export function SummaryPanel() {
  const { meeting, summaries, addSummary, aiMode, noteAiMode, summaryTemplate: template, setSummaryTemplate, readOnly } =
    useCall();
  const store = usePlayerStore();
  const [language, setLanguage] = useState<SummaryLanguage>("en");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [regenerating, setRegenerating] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const inflight = useRef(new Set<string>());
  const key = `${template}|${language}`;

  const current = useMemo(
    () => summaries.find((s) => s.template === template && s.language === language) ?? null,
    [summaries, template, language],
  );
  const cachedTemplates = useMemo(
    () => new Set(summaries.filter((s) => s.language === language).map((s) => s.template)),
    [summaries, language],
  );

  // Template/language switch → cached row, else GET cache, else generate. (Read-only share view never generates.)
  useEffect(() => {
    if (current || errors[key] || inflight.current.has(key) || readOnly) return;
    inflight.current.add(key);
    (async () => {
      try {
        const q = new URLSearchParams({ template, language });
        const cached = await api<GetSummaryResponse>(`${ROUTES.api.summary(meeting.id)}?${q}`);
        if (cached.summary) {
          addSummary(cached.summary);
          return;
        }
        const gen = await api<RegenerateSummaryResponse>(ROUTES.api.summary(meeting.id), {
          method: "POST",
          json: { template, language },
        });
        addSummary(gen.summary);
        noteAiMode(gen.ai_mode);
      } catch (e) {
        setErrors((prev) => ({ ...prev, [key]: e instanceof Error ? e.message : "Failed to generate summary" }));
      } finally {
        inflight.current.delete(key);
      }
    })();
  }, [current, errors, key, template, language, meeting.id, addSummary, noteAiMode, readOnly]);

  const regenerate = async () => {
    setRegenerating(true);
    setGearOpen(false);
    try {
      const gen = await api<RegenerateSummaryResponse>(ROUTES.api.summary(meeting.id), {
        method: "POST",
        json: { template, language, custom_instructions: instructions.trim() || null, force: true },
      });
      addSummary(gen.summary);
      noteAiMode(gen.ai_mode);
      toast.success("Summary regenerated", { description: `${TEMPLATE_BY_KEY[template].name} · ${LANGUAGE_LABELS[language]}` });
    } catch (e) {
      toast.error("Couldn't regenerate", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setRegenerating(false);
    }
  };

  const copy = async () => {
    if (!current) return;
    if (await copyText(summaryToMarkdown(current, meeting.title))) toast.success("Summary copied as Markdown");
  };

  const loading = regenerating || (!current && !errors[key] && !readOnly);
  const retry = () =>
    setErrors((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] px-3 py-2.5">
        <Select value={template} onValueChange={(v) => setSummaryTemplate(v as SummaryTemplateKey)}>
          <SelectTrigger size="sm" className="h-8 min-w-0 max-w-[48%] border-white/10 text-[13px]" aria-label="Summary template">
            <Sparkles className="size-3.5 text-primary" />
            <SelectValue>{TEMPLATE_BY_KEY[template].name}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="w-64">
            <SelectGroup>
              <SelectLabel>General</SelectLabel>
              {SUMMARY_TEMPLATES.filter((t) => !SALES.has(t.key)).map((t) => (
                <TemplateItem key={t.key} k={t.key} cached={cachedTemplates.has(t.key)} />
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Sales</SelectLabel>
              {SUMMARY_TEMPLATES.filter((t) => SALES.has(t.key)).map((t) => (
                <TemplateItem key={t.key} k={t.key} cached={cachedTemplates.has(t.key)} />
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={language} onValueChange={(v) => setLanguage(v as SummaryLanguage)}>
          <SelectTrigger size="sm" className="h-8 border-white/10 text-[13px]" aria-label="Summary language">
            <SelectValue>{LANGUAGE_LABELS[language]}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {SUMMARY_LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>
                {LANGUAGE_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!readOnly && (
          <Popover open={gearOpen} onOpenChange={setGearOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Summary settings" className="size-8">
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-3">
              <p className="text-sm font-medium">Custom instructions</p>
              <p className="text-xs text-muted-foreground">
                Steer the {TEMPLATE_BY_KEY[template].name} summary — e.g. “focus on risks and owners”.
              </p>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Keep it under 5 bullets per section…"
                className="mt-1 min-h-20 text-sm"
                maxLength={2000}
              />
              <Button onClick={regenerate} disabled={regenerating} className="mt-1 w-full">
                {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
              </Button>
            </PopoverContent>
          </Popover>
        )}
        <div className="ml-auto flex items-center gap-1">
          {aiMode === "demo" && !readOnly && <DemoModeBadge />}
          <Button variant="ghost" size="icon-sm" className="size-8" aria-label="Copy summary" onClick={copy} disabled={!current}>
            <Copy className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 [scrollbar-width:thin]">
        {loading ? (
          <SummarySkeleton label={regenerating ? "Regenerating…" : `Writing ${TEMPLATE_BY_KEY[template].name} notes…`} />
        ) : errors[key] ? (
          <ErrorState title="Couldn't generate this summary" description={errors[key]} onRetry={retry} />
        ) : !current ? (
          <EmptyState icon={Sparkles} title="No summary in this template" description="Pick another template to view shared notes." />
        ) : (
          <article className="animate-rise space-y-6">
            {current.custom_instructions && (
              <p className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                Custom instructions: <span className="text-white/80">{current.custom_instructions}</span>
              </p>
            )}
            {current.sections.map((sec) => (
              <section key={sec.heading}>
                <h3 className="mb-2 text-[13px] font-semibold tracking-tight text-white">{sec.heading}</h3>
                {sec.bullets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing noted.</p>
                ) : (
                  <ul className="space-y-1">
                    {sec.bullets.map((b, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => store.seek(b.start_ms)}
                          className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px] leading-relaxed text-white/80 transition-colors hover:bg-white/[0.04] hover:text-white"
                        >
                          <span className="mt-[9px] size-1 shrink-0 rounded-full bg-sky-400/70" />
                          <span className="flex-1">{b.text}</span>
                          <TimestampChip ms={b.start_ms} inert className="mt-0.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </article>
        )}

        {!loading && <DecisionsBlock />}
        {!readOnly && !loading && (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <CatchUpCard />
            <FollowUpEmailDialog
              trigger={
                <button
                  type="button"
                  className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-left transition-colors hover:border-sky-400/30 hover:bg-primary/[0.08]"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-sky-300">
                    <Mail className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">Follow-up email</span>
                    <span className="block text-xs text-muted-foreground">Draft a recap to send</span>
                  </span>
                </button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateItem({ k, cached }: { k: SummaryTemplateKey; cached: boolean }) {
  return (
    <SelectItem value={k}>
      <span className="flex w-full items-center gap-2">
        {TEMPLATE_BY_KEY[k].name}
        {cached && <span className="size-1.5 rounded-full bg-emerald-400/80" title="Ready" />}
      </span>
    </SelectItem>
  );
}

function SummarySkeleton({ label }: { label: string }) {
  return (
    <div aria-busy className="space-y-6">
      <p className="flex items-center gap-2 text-xs text-sky-300">
        <Loader2 className="size-3.5 animate-spin" /> {label}
      </p>
      {[4, 3, 3].map((n, i) => (
        <div key={i} className="space-y-2.5">
          <Skeleton className="h-4 w-36" />
          {Array.from({ length: n }).map((_, j) => (
            <div key={j} className="flex items-center gap-3">
              <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${70 + ((i + j) % 3) * 10}%` }} />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DecisionsBlock() {
  const { detail, meeting, participantById, noteAiMode, readOnly } = useCall();
  const store = usePlayerStore();
  const [fetched, setFetched] = useState<Decision[] | null>(null);
  const [error, setError] = useState(false);
  const decisions = detail.decisions ?? fetched;

  useEffect(() => {
    if (detail.decisions || readOnly) return;
    let cancelled = false;
    api<DecisionsResponse>(ROUTES.api.decisions(meeting.id))
      .then((r) => {
        if (cancelled) return;
        setFetched(r.decisions);
        noteAiMode(r.ai_mode);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [detail.decisions, meeting.id, noteAiMode, readOnly]);

  if (error || (readOnly && !detail.decisions)) return null;
  return (
    <section className="mt-7 rounded-xl border border-violet-300/15 bg-violet-400/[0.05] p-3">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-tight">
        <Gavel className="size-3.5 text-violet-300" /> Decisions
        {decisions && <span className="text-xs font-normal text-muted-foreground">{decisions.length}</span>}
      </h3>
      {!decisions ? (
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      ) : decisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No explicit decisions were made in this call.</p>
      ) : (
        <ul className="space-y-1">
          {decisions.map((d, i) => {
            const who = d.participant_id ? participantById.get(d.participant_id) : undefined;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => store.seek(d.start_ms)}
                  className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-[13.5px] leading-relaxed text-white/85 hover:bg-white/[0.04]"
                >
                  {who ? <ParticipantAvatar person={who} size="xs" className="mt-0.5" /> : <Check className="mt-1 size-3.5 text-violet-300" />}
                  <span className="flex-1">{d.text}</span>
                  <TimestampChip ms={d.start_ms} inert className="mt-0.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CatchUpCard() {
  const { meeting, noteAiMode } = useCall();
  const store = usePlayerStore();
  const [open, setOpen] = useState(false);
  const [minute, setMinute] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CatchUpResponse | null>(null);
  const maxMin = Math.max(0, Math.floor(meeting.duration_sec / 60) - 1);

  const run = async () => {
    setLoading(true);
    try {
      const r = await api<CatchUpResponse>(ROUTES.api.catchUp(meeting.id), {
        method: "POST",
        json: { from_ms: minute * 60_000 },
      });
      setResult(r);
      noteAiMode(r.ai_mode);
      setOpen(false);
    } catch (e) {
      toast.error("Couldn't catch you up", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setMinute(Math.min(maxMin, Math.floor(store.getState().currentMs / 60_000)));
          setOpen(o);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-left transition-colors hover:border-sky-400/30 hover:bg-primary/[0.08]"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-sky-300">
              <FastForward className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">Catch me up</span>
              <span className="block text-xs text-muted-foreground">Joined late? Recap from minute X</span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <p className="text-sm font-medium">Catch me up from</p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={maxMin}
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              className="flex-1 accent-sky-400"
              aria-label="Start minute"
            />
            <span className="w-14 text-right font-mono text-sm tabular-nums">{formatClock(minute * 60_000)}</span>
          </div>
          <Button onClick={run} disabled={loading} className="w-full">
            {loading ? <Loader2 className="animate-spin" /> : <FastForward />} Summarize {formatClock(minute * 60_000)} → end
          </Button>
        </PopoverContent>
      </Popover>
      {result && (
        <div className="animate-rise rounded-xl border border-sky-400/20 bg-primary/[0.07] p-3 sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold">
              Since {formatClock(result.from_ms)}
              <span className="ml-1.5 font-normal text-muted-foreground">
                {formatClock(result.from_ms)}–{formatClock(result.to_ms)}
              </span>
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setResult(null)}
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {result.bullets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing substantive after this point.</p>
          ) : (
            <ul className="space-y-1">
              {result.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/85">
                  <span className={cn("mt-[8px] size-1 shrink-0 rounded-full bg-sky-400")} />
                  <span className="flex-1">{b.text}</span>
                  <TimestampChip ms={b.start_ms} onClick={() => store.seek(b.start_ms)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
