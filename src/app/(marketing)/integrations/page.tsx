import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Webhook } from "lucide-react";
import { PillLink } from "@/components/brand/pill-link";
import { MarketingFrame, PageHero } from "@/components/marketing/site-chrome";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Integrations · Fanthom",
  description: "Send call notes to Slack, Zapier, HubSpot, Salesforce and your own systems.",
};

type Status = "live" | "preview" | "simulated";

const STATUS: Record<Status, { label: string; cls: string; note: string }> = {
  live: { label: "Works today", cls: "bg-emerald-400/10 text-emerald-300", note: "Real requests from this deployment" },
  preview: { label: "Preview", cls: "bg-sky-400/10 text-sky-300", note: "Field mapping preview; sync is logged, not sent" },
  simulated: { label: "Simulated", cls: "border border-amber-300/20 bg-amber-300/8 text-amber-200/90", note: "Needs an OAuth app; the demo simulates it" },
};

const GROUPS: { title: string; items: { name: string; mono: string; tint: string; desc: string; status: Status }[] }[] = [
  {
    title: "Automations",
    items: [
      { name: "Webhooks", mono: "", tint: "#60a5fa", desc: "POST a signed JSON payload to any URL when a call is ready, shared, or clipped.", status: "live" },
      { name: "Zapier & Make", mono: "Zp", tint: "#ff4f00", desc: "Point a catch hook at Fanthom's webhooks to reach thousands of apps.", status: "live" },
      { name: "Slack", mono: "Sl", tint: "#e01e5a", desc: "Post recaps with summary, action items and highlights to a channel.", status: "live" },
    ],
  },
  {
    title: "CRM",
    items: [
      { name: "HubSpot", mono: "Hs", tint: "#ff7a59", desc: "Write next steps, deal stage and a call note to the matching deal.", status: "preview" },
      { name: "Salesforce", mono: "Sf", tint: "#00a1e0", desc: "Update opportunity fields and log the call with BANT or MEDDPICC.", status: "preview" },
    ],
  },
  {
    title: "Meetings & calendars",
    items: [
      { name: "Zoom", mono: "Zm", tint: "#2d8cff", desc: "The notetaker joins scheduled Zoom meetings on its own.", status: "simulated" },
      { name: "Google Meet", mono: "Gm", tint: "#00ac47", desc: "Record Meet calls straight from your Google Calendar.", status: "simulated" },
      { name: "Microsoft Teams", mono: "Mt", tint: "#7b83eb", desc: "Join Teams meetings and label speakers automatically.", status: "simulated" },
      { name: "Google Calendar", mono: "Gc", tint: "#4285f4", desc: "Sync upcoming meetings and apply auto-record rules.", status: "simulated" },
      { name: "Outlook Calendar", mono: "Oc", tint: "#0a64d6", desc: "Sync upcoming meetings and apply auto-record rules.", status: "simulated" },
    ],
  },
  {
    title: "Tasks",
    items: [{ name: "Asana", mono: "As", tint: "#f06a6a", desc: "Turn action items into assigned tasks with a link to the moment.", status: "simulated" }],
  },
];

export default function IntegrationsPage() {
  return (
    <MarketingFrame active={ROUTES.pages.integrations}>
      <PageHero
        eyebrow="Integrations"
        title={
          <>
            Your notes, where
            <br className="hidden sm:block" /> the work happens.
          </>
        }
        desc="Push every call to Slack, your CRM or your own systems — automatically, the moment the notes are ready."
      />

      <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2 px-4">
        {(Object.keys(STATUS) as Status[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/40 px-3 py-1 text-xs text-white/60">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", STATUS[s].cls)}>{STATUS[s].label}</span>
            {STATUS[s].note}
          </span>
        ))}
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} className="mx-auto mt-20 max-w-6xl px-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">{g.title}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((i) => (
              <div
                key={i.name}
                className="group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(15,23,42,0.7),rgba(8,12,24,0.7))] p-6 transition-colors hover:border-sky-400/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="flex size-11 items-center justify-center rounded-2xl text-sm font-semibold"
                    style={{ color: i.tint, backgroundColor: `${i.tint}1f`, boxShadow: `inset 0 0 0 1px ${i.tint}40` }}
                  >
                    {i.mono || <Webhook className="size-5" />}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", STATUS[i.status].cls)}>
                    {STATUS[i.status].label}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em]">{i.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/60">{i.desc}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="mx-auto mt-24 max-w-6xl px-4">
        <div className="relative overflow-hidden rounded-3xl border border-sky-400/20 bg-[linear-gradient(135deg,rgba(30,58,138,0.35),rgba(8,12,24,0.85))] p-8 md:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.3),transparent)]"
          />
          <div className="relative grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Build your own in two minutes.</h2>
              <p className="mt-2 text-white/65">
                Add an endpoint, pick events, hit “Send test”. Every delivery is signed with HMAC-SHA256 and logged with its response.
              </p>
              <Link
                href={ROUTES.pages.settingsTab("integrations")}
                className="mt-5 inline-flex items-center gap-1.5 text-sm text-sky-300 hover:underline"
              >
                Configure webhooks <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/50 p-4 font-mono text-[11px] leading-relaxed text-white/75">
              {`POST https://your.app/hooks/fanthom
X-Fanthom-Signature: sha256=…

{
  "event": "meeting.ready",
  "data": {
    "meeting": { "title": "Acme discovery" },
    "summary_markdown": "## Next steps…",
    "action_items": [ … ]
  }
}`}
            </pre>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-24 flex max-w-3xl flex-col items-center px-5 pb-24 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Connect it to a real call.</h2>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <PillLink href={ROUTES.pages.features} variant="secondary" className="h-11 px-5">
            All features
          </PillLink>
          <PillLink href={ROUTES.pages.calls} className="h-11 pl-5">
            Open the demo workspace
          </PillLink>
        </div>
      </section>
    </MarketingFrame>
  );
}
