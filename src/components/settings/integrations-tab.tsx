"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROUTES } from "@/lib/routes";
import type { CrmLogsResponse, CrmPreviewResponse, ListMeetingsResponse } from "@/lib/contracts";
import { errorMessage, useApi } from "@/lib/ui/use-api";
import type { CrmProvider } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, Monogram, Section, StatusChip } from "./parts";
import { SlackCard } from "./slack-card";
import { WebhooksCard } from "./webhooks-card";

const CRM: Record<CrmProvider, { name: string; mono: string; tint: string; object: string }> = {
  hubspot: { name: "HubSpot", mono: "Hs", tint: "#ff7a59", object: "deals, notes and tasks" },
  salesforce: { name: "Salesforce", mono: "Sf", tint: "#00a1e0", object: "opportunities, notes and tasks" },
};

const STUBS = [
  { name: "Zoom", mono: "Zm", tint: "#2d8cff", desc: "Auto-join and record Zoom meetings", why: "Needs Zoom OAuth app approval" },
  { name: "Google Meet", mono: "Gm", tint: "#00ac47", desc: "Auto-join Meet calls from your calendar", why: "Needs Google Workspace OAuth" },
  { name: "Microsoft Teams", mono: "Mt", tint: "#7b83eb", desc: "Auto-join Teams meetings", why: "Needs Microsoft Graph OAuth" },
  { name: "Google Calendar", mono: "Gc", tint: "#4285f4", desc: "Sync upcoming meetings for auto-record", why: "Needs Google Calendar OAuth — events are seeded" },
  { name: "Outlook Calendar", mono: "Oc", tint: "#0a64d6", desc: "Sync upcoming meetings for auto-record", why: "Needs Microsoft Graph OAuth — events are seeded" },
  { name: "Asana", mono: "As", tint: "#f06a6a", desc: "Turn action items into tasks", why: "Needs Asana OAuth" },
];

export function IntegrationsTab() {
  return (
    <>
      <Section title="Automations" desc="These work today on this deployment — paste a URL and they send real requests.">
        <div className="grid gap-3">
          <WebhooksCard />
          <SlackCard />
        </div>
      </Section>

      <Section
        title="CRM"
        desc="Preview exactly which fields Fanthom would write from a call. Syncing is simulated and logged until OAuth is connected."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(CRM) as CrmProvider[]).map((p) => (
            <CrmCard key={p} provider={p} />
          ))}
        </div>
        <CrmLog />
      </Section>

      <Section title="Meeting platforms & calendars" desc="Honest status: these need OAuth apps that aren't configured on this demo.">
        <div className="grid gap-3 sm:grid-cols-2">
          {STUBS.map((i) => (
            <div key={i.name} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3.5">
              <Monogram mono={i.mono} tint={i.tint} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{i.name}</p>
                <p className="truncate text-xs text-muted-foreground">{i.desc}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <StatusChip tone="stub">Stub</StatusChip>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-56">{i.why}. Use “Send to meeting” (simulated bot) or record in the browser instead.</TooltipContent>
              </Tooltip>
            </div>
          ))}
          <Link
            href={ROUTES.pages.record}
            className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 p-3.5 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground sm:col-span-2"
          >
            Need a recording now? Record in your browser or send the simulated bot to a meeting link <ArrowRight className="ml-auto size-4" />
          </Link>
        </div>
      </Section>
    </>
  );
}

function CrmCard({ provider }: { provider: CrmProvider }) {
  const meta = CRM[provider];
  const [open, setOpen] = useState(false);
  // Preview on the most recent external call (deal-shaped data).
  const meetings = useApi<ListMeetingsResponse>(open ? `${ROUTES.api.meetings}?scope=all&sort=newest` : null);
  const sample = meetings.data?.meetings.find((m) => m.company_domain && m.status === "ready") ?? meetings.data?.meetings[0];
  const preview = useApi<CrmPreviewResponse>(open && sample ? `${ROUTES.api.crm(sample.id)}?provider=${provider}` : null);
  const loading = open && (meetings.loading || (sample && preview.loading));
  const err = meetings.error ?? preview.error;

  return (
    <Card className="p-0">
      <div className="flex items-start gap-3 p-4">
        <Monogram mono={meta.mono} tint={meta.tint} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{meta.name}</p>
            <StatusChip tone="stub">Preview mode</StatusChip>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Map call notes to {meta.object}. OAuth isn&apos;t connected — “Sync” on a call page logs what would be written.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 border-t border-white/[0.06] px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground"
      >
        Field mapping preview <ChevronDown className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-white/[0.06] p-4 pt-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : err ? (
            <p className="text-xs text-muted-foreground">{errorMessage(err)}</p>
          ) : !sample || !preview.data ? (
            <p className="text-xs text-muted-foreground">Record a call with an external guest to preview the mapping.</p>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">
                From{" "}
                <Link href={ROUTES.pages.call(sample.id)} className="text-sky-300 hover:underline">
                  {sample.title}
                </Link>
              </p>
              <ul className="grid gap-1.5">
                {preview.data.preview.fields.map((f, i) => (
                  <li key={`${f.crm_field}-${i}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 text-xs">
                    <span className="truncate text-muted-foreground" title={`${f.crm_object}.${f.crm_field}`}>
                      <span className="text-foreground/70">{f.crm_object}</span> · <code className="font-mono text-[11px]">{f.crm_field}</code>
                    </span>
                    <span className="line-clamp-2 text-foreground/85">{f.value || "—"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function CrmLog() {
  const { data, error, loading } = useApi<CrmLogsResponse>(ROUTES.api.crmLogs, { tags: ["crm"] });
  const logs = data?.logs ?? [];
  if (loading) return <Skeleton className="mt-3 h-16 w-full rounded-2xl" />;
  if (error && !data) return <p className="mt-3 text-xs text-muted-foreground">{errorMessage(error, "Couldn't load the sync log")}</p>;
  if (!logs.length) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-white/8">
      <p className="border-b border-white/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
        Sync log
      </p>
      <ul className="divide-y divide-white/[0.05]">
        {logs.slice(0, 6).map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
            <span className="w-20 shrink-0 font-medium">{CRM[l.provider].name}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.message}</span>
            <StatusChip tone={l.status === "failed" ? "error" : l.status === "success" ? "live" : "stub"}>{l.status}</StatusChip>
            <span className="hidden shrink-0 text-muted-foreground sm:inline" suppressHydrationWarning>
              {new Date(l.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
