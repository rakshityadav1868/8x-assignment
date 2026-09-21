"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, CheckCircle2, Circle, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, MeetingTypeBadge } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { DashCard, PageHeader, PageShell } from "@/components/insights/dash-ui";
import { apiErrorMessage, useApi } from "@/hooks/use-api";
import { ROUTES } from "@/lib/routes";
import type { DealResponse, UpdateDealRequest } from "@/lib/contracts";
import { DEAL_STAGES, type BantFields, type CompanyDetail, type DealStage, type MeddpiccFields, type Stakeholder } from "@/lib/types";
import { ApiClientError, api } from "@/lib/ui/api";
import { formatClock, formatDuration } from "@/lib/ui/format";
import { shortDate, timeAgo } from "@/lib/ui/time-ago";
import { TEMPLATE_BY_KEY } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { CompanyMark, STAGE_META, formatMoney } from "./deal-bits";

const BANT_LABELS: Record<keyof BantFields, string> = {
  budget: "Budget",
  authority: "Authority",
  need: "Need",
  timeline: "Timeline",
};
const MEDDPICC_LABELS: Record<keyof MeddpiccFields, string> = {
  metrics: "Metrics",
  economic_buyer: "Economic buyer",
  decision_criteria: "Decision criteria",
  decision_process: "Decision process",
  paper_process: "Paper process",
  identify_pain: "Identify pain",
  champion: "Champion",
  competition: "Competition",
};

export function DealDetailView({ domain }: { domain: string }) {
  const q = useApi<DealResponse>(ROUTES.api.deal(domain));
  const c = q.data?.company;

  const patch = async (body: UpdateDealRequest, label: string) => {
    try {
      const r = await api<DealResponse>(ROUTES.api.deal(domain), { method: "PATCH", json: body });
      q.setData(r);
      toast.success(`${label} updated`);
      return true;
    } catch (e) {
      toast.error(`Couldn't update ${label.toLowerCase()}`, { description: apiErrorMessage(e) });
      return false;
    }
  };

  const back = (
    <Link href={ROUTES.pages.deals} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" /> Deals
    </Link>
  );

  if (q.error && !c) {
    const notFound = q.error instanceof ApiClientError && q.error.status === 404;
    return (
      <PageShell>
        {back}
        <DashCard className="mt-6">
          {notFound ? (
            <EmptyState icon={Building2} title="Company not found" description={`No external calls with ${domain}.`} />
          ) : (
            <ErrorState title="Couldn't load this deal" description={apiErrorMessage(q.error)} onRetry={q.reload} />
          )}
        </DashCard>
      </PageShell>
    );
  }
  if (!c) {
    return (
      <PageShell>
        {back}
        <div className="mt-4 space-y-4" aria-busy>
          <Skeleton className="h-12 w-72" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Skeleton className="h-[480px] rounded-2xl" />
            <Skeleton className="h-[480px] rounded-2xl" />
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={back}
        title={
          <span className="flex items-center gap-3">
            <CompanyMark name={c.name} domain={c.domain} size="lg" />
            <span className="min-w-0">
              <span className="block truncate">{c.name}</span>
              <span className="block text-xs font-normal tracking-normal text-muted-foreground">
                {c.domain} · {c.meeting_count} {c.meeting_count === 1 ? "call" : "calls"} · last {timeAgo(c.last_meeting_at)}
              </span>
            </span>
          </span>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <FieldCard label="Stage">
          <Select value={c.fields.stage} onValueChange={(v) => void patch({ stage: v as DealStage }, "Stage")}>
            <SelectTrigger size="sm" className="h-8 w-full" aria-label="Stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEAL_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: STAGE_META[s].color }} /> {STAGE_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldCard>
        <FieldCard label="Amount">
          <InlineEdit
            value={c.fields.amount != null ? String(c.fields.amount) : ""}
            display={formatMoney(c.fields.amount)}
            inputMode="numeric"
            placeholder="e.g. 48000"
            onSave={(v) => {
              const n = v.trim() === "" ? null : Number(v.replace(/[$,\s]/g, "").replace(/k$/i, "000"));
              if (n != null && (!Number.isFinite(n) || n < 0)) {
                toast.error("Enter a positive number");
                return Promise.resolve(false);
              }
              return patch({ amount: n }, "Amount");
            }}
            className="text-lg font-semibold tabular-nums"
          />
        </FieldCard>
        <FieldCard label="Close date">
          <InlineEdit
            value={c.fields.close_date ?? ""}
            display={c.fields.close_date ? shortDate(c.fields.close_date, true) : "—"}
            type="date"
            onSave={(v) => patch({ close_date: v || null }, "Close date")}
            className="text-lg font-semibold"
          />
        </FieldCard>
        <FieldCard label="People">
          <p className="text-lg font-semibold tabular-nums">
            {c.stakeholders.length}
            <span className="ml-1 text-xs font-normal text-muted-foreground">theirs · {c.internal_team.length} ours</span>
          </p>
        </FieldCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <DashCard title="Timeline">
            <Timeline c={c} />
          </DashCard>
          <DashCard
            title="Latest summary"
            action={
              c.latest_summary && (
                <span className="text-[11px] text-muted-foreground">{TEMPLATE_BY_KEY[c.latest_summary.template]?.name ?? c.latest_summary.template}</span>
              )
            }
          >
            <LatestSummary c={c} />
          </DashCard>
          <DashCard title="Next steps across calls">
            {c.next_steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No action items captured with this company yet.</p>
            ) : (
              <ul className="space-y-1">
                {c.next_steps.map((n, i) => (
                  <li key={`${n.meeting_id}-${i}`}>
                    <Link
                      href={n.start_ms != null ? ROUTES.pages.callAt(n.meeting_id, n.start_ms) : ROUTES.pages.call(n.meeting_id)}
                      className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-white/[0.03]"
                    >
                      {n.completed ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className={cn("min-w-0 flex-1", n.completed && "text-muted-foreground line-through")}>{n.text}</span>
                      {n.start_ms != null && (
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-sky-300">{formatClock(n.start_ms)}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>
        </div>

        <div className="min-w-0 space-y-4">
          <DashCard title="Stakeholders">
            <People people={c.stakeholders} empty="No customer-side people yet." />
            {c.internal_team.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Our team</p>
                <People people={c.internal_team} />
              </>
            )}
          </DashCard>
          <DashCard title="BANT" action={<span className="text-[11px] text-muted-foreground">Click a field to edit</span>}>
            <dl className="space-y-3">
              {(Object.keys(BANT_LABELS) as (keyof BantFields)[]).map((k) => (
                <QualField
                  key={k}
                  label={BANT_LABELS[k]}
                  value={c.fields.bant[k]}
                  onSave={(v) => patch({ bant: { [k]: v || null } }, BANT_LABELS[k])}
                />
              ))}
            </dl>
          </DashCard>
          <DashCard title="MEDDPICC">
            <dl className="space-y-3">
              {(Object.keys(MEDDPICC_LABELS) as (keyof MeddpiccFields)[]).map((k) => (
                <QualField
                  key={k}
                  label={MEDDPICC_LABELS[k]}
                  value={c.fields.meddpicc[k]}
                  onSave={(v) => patch({ meddpicc: { [k]: v || null } }, MEDDPICC_LABELS[k])}
                />
              ))}
            </dl>
          </DashCard>
        </div>
      </div>
    </PageShell>
  );
}

function FieldCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-4">
      <p className="mb-2 text-[13px] font-medium text-white/80">{label}</p>
      {children}
    </div>
  );
}

function InlineEdit({
  value,
  display,
  onSave,
  type = "text",
  inputMode,
  placeholder,
  className,
}: {
  value: string;
  display: string;
  onSave: (v: string) => Promise<boolean>;
  type?: "text" | "date";
  inputMode?: "numeric";
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const commit = async () => {
    if (draft === value) return setEditing(false);
    setBusy(true);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok) setEditing(false);
  };
  if (editing)
    return (
      <span className="flex items-center gap-1">
        <input
          autoFocus
          type={type}
          inputMode={inputMode}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => void commit()}
          className="h-8 w-full min-w-0 rounded-lg border border-primary/50 bg-white/[0.04] px-2 text-sm outline-none [color-scheme:dark]"
        />
        {busy && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={cn("group flex w-full items-center gap-1.5 text-left", className)}
    >
      <span className="truncate">{display}</span>
      <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function QualField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const commit = async () => {
    const next = draft.trim();
    if (next === (value ?? "")) return setEditing(false);
    setBusy(true);
    const ok = await onSave(next);
    setBusy(false);
    if (ok) setEditing(false);
  };
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        {editing ? (
          <div>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit();
                if (e.key === "Escape") setEditing(false);
              }}
              aria-label={label}
              className="min-h-16 w-full resize-none rounded-lg border border-primary/50 bg-white/[0.04] px-2.5 py-1.5 text-[13px] leading-relaxed outline-none [field-sizing:content]"
            />
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <span className="mr-auto text-[10px] text-muted-foreground">⌘↵ save · Esc cancel</span>
              <button type="button" onClick={() => setEditing(false)} className="h-6 rounded-md px-2 text-xs text-muted-foreground hover:bg-white/10">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void commit()}
                disabled={busy}
                className="h-6 rounded-md bg-white px-2.5 text-xs font-medium text-neutral-950 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(value ?? "");
              setEditing(true);
            }}
            className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] leading-relaxed hover:bg-white/[0.04]"
          >
            <span className={cn("min-w-0 flex-1", !value && "text-muted-foreground/70 italic")}>{value || "Not captured yet — add"}</span>
            <Pencil className="mt-1 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
      </dd>
    </div>
  );
}

function Timeline({ c }: { c: CompanyDetail }) {
  if (c.timeline.length === 0) return <p className="text-sm text-muted-foreground">No calls yet.</p>;
  const byId = new Map(c.meetings.map((m) => [m.id, m]));
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-white/10">
      {c.timeline.map((t, i) => {
        const m = byId.get(t.meeting_id);
        return (
          <li key={t.meeting_id} className="relative pl-6">
            <span
              className={cn(
                "absolute left-0 top-1.5 size-[11px] rounded-full border-2",
                i === 0 ? "border-sky-400 bg-sky-400/30 shadow-[0_0_10px_rgba(56,189,248,0.7)]" : "border-white/25 bg-[#0b1120]",
              )}
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={ROUTES.pages.call(t.meeting_id)} className="font-medium hover:text-sky-200">
                {t.title}
              </Link>
              <MeetingTypeBadge type={t.meeting_type} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {shortDate(t.date, true)}
              {m && ` · ${formatDuration(m.duration_sec)} · ${m.participants.length} people`}
            </p>
            {t.headline && <p className="mt-1.5 text-[13px] leading-relaxed text-white/80">{t.headline}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function LatestSummary({ c }: { c: CompanyDetail }) {
  const s = c.latest_summary;
  if (!s) return <p className="text-sm text-muted-foreground">No summary yet for the latest call.</p>;
  return (
    <div className="space-y-4">
      {s.sections.slice(0, 4).map((sec) => (
        <section key={sec.heading}>
          <h3 className="text-[13px] font-medium">{sec.heading}</h3>
          <ul className="mt-1.5 space-y-1.5">
            {sec.bullets.slice(0, 4).map((b, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-white/80">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-sky-400" />
                <span className="min-w-0 flex-1">{b.text}</span>
                <Link
                  href={ROUTES.pages.callAt(s.meeting_id, b.start_ms)}
                  className="h-5 shrink-0 rounded-md bg-primary/12 px-1.5 font-mono text-[11px] leading-5 tabular-nums text-sky-300 ring-1 ring-primary/25 hover:bg-primary/25"
                >
                  {formatClock(b.start_ms)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Link href={ROUTES.pages.call(s.meeting_id)} className="inline-block text-xs text-sky-300 hover:underline">
        Open the full call →
      </Link>
    </div>
  );
}

function People({ people, empty }: { people: Stakeholder[]; empty?: string }) {
  if (people.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...people.map((p) => p.talk_ms));
  return (
    <ul className="space-y-3">
      {people.map((p) => (
        <li key={p.email ?? p.name} className="flex items-center gap-2.5">
          <ParticipantAvatar person={p} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px]">{p.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {p.email ?? "—"} · {p.meeting_count} {p.meeting_count === 1 ? "call" : "calls"}
            </p>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="block h-full rounded-full" style={{ width: `${(p.talk_ms / max) * 100}%`, backgroundColor: p.color }} />
            </span>
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground" title="Talk time">
            {Math.round(p.talk_ms / 60000)}m
          </span>
        </li>
      ))}
    </ul>
  );
}
