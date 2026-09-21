"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/bits";
import { AvatarStack } from "@/components/common/participant-avatar";
import { DashCard, Kpi, PageHeader, PageShell, Segmented, SkelSpan } from "@/components/insights/dash-ui";
import { apiErrorMessage, useApi } from "@/hooks/use-api";
import { ROUTES } from "@/lib/routes";
import type { DealResponse, ListDealsResponse } from "@/lib/contracts";
import type { CompanyDetail, CompanySummary } from "@/lib/types";
import { api } from "@/lib/ui/api";
import { shortDate, timeAgo } from "@/lib/ui/time-ago";
import { cn } from "@/lib/utils";
import { CompanyMark, STAGE_META, StageBadge, formatMoney } from "./deal-bits";

type Filter = "open" | "all" | "closed";

/**
 * /deals — one row per external company (email domain). The list endpoint is intentionally light, so rows are
 * enriched with amount / next step / stakeholders from each company's detail in the background.
 */
export function DealsView() {
  const q = useApi<ListDealsResponse>(ROUTES.api.deals);
  const [filter, setFilter] = useState<Filter>("open");
  const [details, setDetails] = useState<Record<string, CompanyDetail | "error">>({});
  const companies = useMemo(() => q.data?.companies ?? [], [q.data]);

  useEffect(() => {
    if (!companies.length) return;
    const ctrl = new AbortController();
    for (const c of companies) {
      api<DealResponse>(ROUTES.api.deal(c.domain), { signal: ctrl.signal, cache: "no-store" })
        .then((r) => setDetails((d) => ({ ...d, [c.domain]: r.company })))
        .catch(() => {
          if (!ctrl.signal.aborted) setDetails((d) => ({ ...d, [c.domain]: "error" }));
        });
    }
    return () => ctrl.abort();
  }, [companies]);

  const rows = companies.filter((c) => {
    const closed = c.stage === "closed_won" || c.stage === "closed_lost";
    return filter === "all" || (filter === "open" ? !closed : closed);
  });
  const amountOf = (c: CompanySummary) => {
    const d = details[c.domain];
    return d && d !== "error" ? d.fields.amount : null;
  };
  const openPipeline = companies
    .filter((c) => c.stage !== "closed_won" && c.stage !== "closed_lost")
    .reduce((a, c) => a + (amountOf(c) ?? 0), 0);
  const enriched = companies.every((c) => details[c.domain]);
  const stageCounts = companies.reduce<Record<string, number>>((acc, c) => ((acc[c.stage] = (acc[c.stage] ?? 0) + 1), acc), {});

  return (
    <PageShell>
      <PageHeader
        title="Deals"
        description="Every company you've met with, built automatically from external calls."
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            ariaLabel="Deal status"
            options={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
              { value: "all", label: "All" },
            ]}
          />
        }
      />

      {q.error && !q.data ? (
        <DashCard className="mt-8">
          <ErrorState title="Couldn't load deals" description={apiErrorMessage(q.error)} onRetry={q.reload} />
        </DashCard>
      ) : !q.data ? (
        <div className="mt-8 space-y-4" aria-busy>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[94px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : companies.length === 0 ? (
        <DashCard className="mt-8">
          <EmptyState
            icon={Building2}
            title="No deals yet"
            description="Deals appear when you record calls with people outside your company."
          />
        </DashCard>
      ) : (
        <div className="mt-8 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Companies" value={companies.length} sub={`${companies.reduce((a, c) => a + c.meeting_count, 0)} external calls`} />
            <Kpi label="Open pipeline" value={enriched ? formatMoney(openPipeline) : <SkelSpan className="mt-1 h-7 w-20" />} sub="Sum of open deal amounts" />
            <Kpi
              label="Stakeholders"
              value={companies.reduce((a, c) => a + c.stakeholder_count, 0)}
              sub="People on the customer side"
            />
            <Kpi
              label="Most advanced"
              value={
                <span className="text-lg">
                  {STAGE_META[(["closed_won", "negotiation", "proposal", "evaluation", "discovery", "closed_lost"] as const).find((s) => stageCounts[s]) ?? "discovery"].label}
                </span>
              }
              sub={Object.entries(stageCounts)
                .map(([s, n]) => `${n} ${STAGE_META[s as keyof typeof STAGE_META].label.toLowerCase()}`)
                .join(" · ")}
            />
          </div>

          <DashCard bodyClassName="p-0 sm:p-0">
            {rows.length === 0 ? (
              <EmptyState icon={Building2} title={filter === "closed" ? "No closed deals" : "No open deals"} />
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,1.6fr)_120px_90px_minmax(0,1.3fr)_minmax(0,1.6fr)_110px_20px] gap-4 border-b border-white/[0.06] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground lg:grid">
                  <span>Company</span>
                  <span>Stage</span>
                  <span>Amount</span>
                  <span>Last meeting</span>
                  <span>Next step</span>
                  <span>Stakeholders</span>
                  <span />
                </div>
                <ul className="divide-y divide-white/[0.05]">
                  {rows.map((c) => (
                    <DealRow key={c.domain} c={c} d={details[c.domain]} />
                  ))}
                </ul>
              </>
            )}
          </DashCard>
        </div>
      )}
    </PageShell>
  );
}

function DealRow({ c, d }: { c: CompanySummary; d: CompanyDetail | "error" | undefined }) {
  const loading = d === undefined;
  const detail = d && d !== "error" ? d : null;
  const next = detail?.next_steps.find((n) => !n.completed) ?? detail?.next_steps[0];
  return (
    <li className="relative">
      <Link
        href={ROUTES.pages.deal(c.domain)}
        className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-white/[0.025] sm:px-5 lg:grid-cols-[minmax(0,1.6fr)_120px_90px_minmax(0,1.3fr)_minmax(0,1.6fr)_110px_20px] lg:items-center"
      >
        <span className="flex min-w-0 items-center gap-3">
          <CompanyMark name={c.name} domain={c.domain} />
          <span className="min-w-0">
            <span className="block truncate font-medium group-hover:text-sky-200">{c.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {c.domain} · {c.meeting_count} {c.meeting_count === 1 ? "call" : "calls"}
            </span>
          </span>
        </span>
        <span className="justify-self-end lg:justify-self-start">
          <StageBadge stage={detail?.fields.stage ?? c.stage} />
        </span>
        <span className="font-mono text-sm tabular-nums max-lg:hidden">
          {loading ? <SkelSpan className="h-4 w-12" /> : formatMoney(detail?.fields.amount)}
        </span>
        <span className="col-span-2 min-w-0 text-xs lg:col-span-1">
          <span className="block truncate text-white/85">{c.latest_meeting_title ?? "—"}</span>
          <span className="text-muted-foreground" suppressHydrationWarning>
            {shortDate(c.last_meeting_at)} · {timeAgo(c.last_meeting_at)}
            <span className="lg:hidden">{detail?.fields.amount != null && ` · ${formatMoney(detail.fields.amount)}`}</span>
          </span>
        </span>
        <span className="col-span-2 min-w-0 text-xs text-white/75 lg:col-span-1">
          {loading ? (
            <SkelSpan className="h-4 w-full" />
          ) : next ? (
            <span className={cn("line-clamp-2", next.completed && "text-muted-foreground line-through")}>{next.text}</span>
          ) : (
            <span className="text-muted-foreground">No next step captured</span>
          )}
        </span>
        <span className="max-lg:hidden">
          {loading ? (
            <SkelSpan className="h-6 w-16 rounded-full" />
          ) : detail && detail.stakeholders.length ? (
            <AvatarStack people={detail.stakeholders.map((s) => ({ ...s, is_external: true }))} max={4} size="sm" />
          ) : (
            <span className="text-xs text-muted-foreground">{c.stakeholder_count}</span>
          )}
        </span>
        <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 max-lg:hidden" />
      </Link>
    </li>
  );
}
