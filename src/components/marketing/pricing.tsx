"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { PillLink } from "@/components/brand/pill-link";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Billing = "monthly" | "annual";

interface Tier {
  key: string;
  name: string;
  blurb: string;
  monthly: number;
  annual: number;
  perUser: boolean;
  cta: string;
  highlight?: boolean;
  features: string[];
}

export const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    blurb: "For anyone who's tired of typing notes during calls.",
    monthly: 0,
    annual: 0,
    perUser: false,
    cta: "Start free",
    features: [
      "Unlimited recordings & transcripts",
      "Speaker-labelled, searchable transcripts",
      "AI notes on your first 5 calls each month",
      "Highlights, clips and share links",
      "Record in the browser or upload files",
    ],
  },
  {
    key: "premium",
    name: "Premium",
    blurb: "For individuals who live in back-to-back meetings.",
    monthly: 19,
    annual: 15,
    perUser: false,
    cta: "Try Premium",
    features: [
      "Unlimited AI notes & action items",
      "All 11 templates incl. BANT, MEDDPICC, SPICED",
      "Ask Fanthom across every call",
      "Custom instructions & summary languages",
      "Follow-up emails, downloads (TXT, SRT, VTT, MD)",
    ],
  },
  {
    key: "team",
    name: "Team",
    blurb: "For teams that learn from each other's calls.",
    monthly: 29,
    annual: 24,
    perUser: true,
    cta: "Start a team",
    highlight: true,
    features: [
      "Everything in Premium",
      "Shared team library, folders & playlists",
      "Comments, @mentions and reactions",
      "Keyword trackers & team insights",
      "Slack recaps and outgoing webhooks",
    ],
  },
  {
    key: "business",
    name: "Business",
    blurb: "For revenue and CS orgs that run on their CRM.",
    monthly: 39,
    annual: 32,
    perUser: true,
    cta: "Talk to us",
    features: [
      "Everything in Team",
      "HubSpot & Salesforce field sync",
      "Deals view with BANT / MEDDPICC fields",
      "Per-rep coaching metrics",
      "Admin roles, SSO & audit log (roadmap)",
    ],
  },
];

type Cell = boolean | string;
export const COMPARISON: { group: string; rows: [string, Cell, Cell, Cell, Cell][] }[] = [
  {
    group: "Capture",
    rows: [
      ["Recordings & storage", "Unlimited", "Unlimited", "Unlimited", "Unlimited"],
      ["In-browser recorder (mic + screen)", true, true, true, true],
      ["Upload audio / video", true, true, true, true],
      ["Notetaker joins Zoom, Meet, Teams", true, true, true, true],
      ["Calendar auto-record rules", "Basic", true, true, true],
    ],
  },
  {
    group: "AI notes",
    rows: [
      ["AI summaries & action items", "5 calls / mo", "Unlimited", "Unlimited", "Unlimited"],
      ["Templates", "General", "All 11", "All 11", "All 11"],
      ["Ask Fanthom (per call)", true, true, true, true],
      ["Ask across all calls", false, true, true, true],
      ["Custom instructions & languages", false, true, true, true],
      ["Chapters, decisions, catch me up", true, true, true, true],
    ],
  },
  {
    group: "Collaboration",
    rows: [
      ["Share links & clips", true, true, true, true],
      ["Folders & playlists", "Personal", "Personal", "Shared", "Shared"],
      ["Comments, @mentions, reactions", false, false, true, true],
      ["Team library", false, false, true, true],
    ],
  },
  {
    group: "Insights",
    rows: [
      ["Talk-time & speaker stats", true, true, true, true],
      ["Coaching metrics", false, false, true, true],
      ["Keyword trackers", false, false, true, true],
      ["Team insights dashboard", false, false, true, true],
      ["Deals & company timelines", false, false, false, true],
    ],
  },
  {
    group: "Integrations",
    rows: [
      ["Downloads (TXT, SRT, VTT, Markdown)", false, true, true, true],
      ["Slack recaps", false, false, true, true],
      ["Webhooks / Zapier", false, false, true, true],
      ["HubSpot & Salesforce", false, false, false, true],
    ],
  },
];

function price(t: Tier, billing: Billing) {
  const v = billing === "annual" ? t.annual : t.monthly;
  return v === 0 ? "$0" : `$${v}`;
}

export function PricingTiers() {
  const [billing, setBilling] = useState<Billing>("annual");
  return (
    <>
      <div className="mt-10 flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="flex rounded-full border border-white/10 bg-black/50 p-1 text-sm backdrop-blur">
          {(["monthly", "annual"] as const).map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={billing === b}
              onClick={() => setBilling(b)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-4 capitalize text-white/70 transition-colors hover:text-white",
                billing === b && "bg-white text-neutral-950 hover:text-neutral-950",
              )}
            >
              {b}
              {b === "annual" && (
                <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", billing === b ? "bg-neutral-950/10" : "bg-sky-400/15 text-sky-300")}>
                  −20%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-4 px-4 md:grid-cols-2 xl:grid-cols-4">
        {TIERS.map((t) => (
          <div
            key={t.key}
            className={cn(
              "relative flex flex-col overflow-hidden rounded-3xl border p-6",
              t.highlight
                ? "border-sky-400/35 bg-[linear-gradient(180deg,rgba(30,58,138,0.35),rgba(8,12,24,0.8))] shadow-[0_0_60px_-24px_var(--brand)]"
                : "border-white/[0.07] bg-[linear-gradient(180deg,rgba(15,23,42,0.7),rgba(8,12,24,0.7))]",
            )}
          >
            {t.highlight && (
              <span className="absolute right-4 top-4 rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                Most popular
              </span>
            )}
            <p className="text-lg font-semibold tracking-tight">{t.name}</p>
            <p className="mt-1 min-h-10 text-sm text-white/55">{t.blurb}</p>
            <p className="mt-5 flex items-end gap-1.5">
              <span className="text-4xl font-semibold tracking-[-0.04em]">{price(t, billing)}</span>
              <span className="pb-1 text-xs text-white/50">
                {t.monthly === 0 ? "forever" : `${t.perUser ? "per user / " : ""}month${billing === "annual" ? ", billed yearly" : ""}`}
              </span>
            </p>
            <PillLink
              href={ROUTES.pages.calls}
              variant={t.highlight ? "primary" : "secondary"}
              className={cn("mt-6 h-10 justify-between", t.highlight ? "pl-5" : "px-5")}
            >
              {t.cta}
            </PillLink>
            <ul className="mt-6 space-y-2.5 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-white/75">
                  <Check className="mt-0.5 size-4 shrink-0 text-sky-300" /> {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

export function ComparisonTable() {
  return (
    <div className="mx-auto mt-10 max-w-6xl overflow-x-auto px-4">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-[#03050b] py-3 pr-4 text-left font-medium text-white/50">Compare plans</th>
            {TIERS.map((t) => (
              <th key={t.key} className={cn("px-3 py-3 text-center font-semibold", t.highlight && "text-sky-300")}>
                {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARISON.map((g) => (
            <GroupRows key={g.group} group={g} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group }: { group: (typeof COMPARISON)[number] }) {
  return (
    <>
      <tr>
        <td colSpan={5} className="sticky left-0 bg-[#03050b] pb-2 pt-8 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {group.group}
        </td>
      </tr>
      {group.rows.map(([label, ...cells]) => (
        <tr key={label} className="group">
          <td className="sticky left-0 border-t border-white/[0.06] bg-[#03050b] py-3 pr-4 text-white/75">{label}</td>
          {cells.map((c, i) => (
            <td key={i} className={cn("border-t border-white/[0.06] px-3 py-3 text-center", i === 2 && "bg-sky-400/[0.03]")}>
              {c === true ? (
                <Check className="mx-auto size-4 text-sky-300" aria-label="Included" />
              ) : c === false ? (
                <Minus className="mx-auto size-4 text-white/20" aria-label="Not included" />
              ) : (
                <span className="text-xs text-white/70">{c}</span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
