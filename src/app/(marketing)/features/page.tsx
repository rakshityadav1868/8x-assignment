import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  AtSign,
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  Download,
  FastForward,
  FolderOpen,
  Gauge,
  Languages,
  ListChecks,
  Mail,
  MessageSquareText,
  Mic,
  Radar,
  Scissors,
  Search,
  Share2,
  Sparkles,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { PillLink } from "@/components/brand/pill-link";
import { MarketingFrame, PageHero } from "@/components/marketing/site-chrome";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Features · Fanthom",
  description: "Record any meeting, get notes that link to the moment, and learn from every call across your team.",
};

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
  href?: string;
}

const GROUPS: { eyebrow: string; title: string; desc: string; items: Feature[] }[] = [
  {
    eyebrow: "01 · Capture",
    title: "Every conversation, however it happens.",
    desc: "Let the notetaker join, record from the browser, or bring a file. The result is the same call page.",
    items: [
      { icon: Bot, title: "Joins Zoom, Meet & Teams", desc: "Paste a link or let auto-record rules decide. Watch it go from waiting room to recording in real time.", href: ROUTES.pages.record },
      { icon: Mic, title: "Record in the browser", desc: "Microphone plus an optional screen or tab, a live level meter, pause and resume — no install.", href: ROUTES.pages.record },
      { icon: CalendarDays, title: "Calendar & auto-record", desc: "A week view of what's coming up. Record all, external only, internal only — or flip any single meeting.", href: ROUTES.pages.calendar },
    ],
  },
  {
    eyebrow: "02 · Notes",
    title: "Notes you can trust, because they link back.",
    desc: "Every bullet, action item and answer carries a timestamp that plays the exact moment.",
    items: [
      { icon: Sparkles, title: "11 summary templates", desc: "General, Sales, BANT, MEDDPICC, SPICED, 1:1, stand-up, Q&A and more — switch after the fact." },
      { icon: ListChecks, title: "Action items with owners", desc: "Assigned to the right person, checkable, and one click from where they were agreed." },
      { icon: MessageSquareText, title: "Synced transcript", desc: "Chat-style, speaker-labelled and following playback. Search inside, filter by speaker, edit lines." },
      { icon: FastForward, title: "Chapters & catch me up", desc: "Skim a 60-minute, eight-person call by chapter, or summarize everything after minute 23." },
      { icon: Search, title: "Ask Fanthom", desc: "Ask one call or all of them. Answers cite the moments they came from.", href: ROUTES.pages.ask },
      { icon: Languages, title: "Your language", desc: "Summaries in eight languages with custom instructions for tone and focus." },
    ],
  },
  {
    eyebrow: "03 · Collaborate",
    title: "Share the moment, not the whole hour.",
    desc: "Clips, comments and folders turn recordings into something your team actually uses.",
    items: [
      { icon: Scissors, title: "Highlights & clips", desc: "Mark a pain point, decision or question and trim it into a clip with its own link.", href: ROUTES.pages.playlists },
      { icon: AtSign, title: "Comments & @mentions", desc: "Timestamped threads on the timeline, reactions on transcript lines, notifications for mentions." },
      { icon: FolderOpen, title: "Library, folders & playlists", desc: "My calls, shared with me, and the team's — filtered by type, person, company or date.", href: ROUTES.pages.calls },
      { icon: Share2, title: "Share with care", desc: "Anyone with the link, your company only, or specific people. Revoke any time." },
      { icon: Mail, title: "Follow-ups & recaps", desc: "Draft the follow-up email from the call and preview the recap attendees receive." },
      { icon: Download, title: "Take it with you", desc: "Transcripts as TXT, SRT, VTT or Markdown, summaries as Markdown, and the recording." },
    ],
  },
  {
    eyebrow: "04 · Learn",
    title: "See patterns across every call.",
    desc: "Coaching metrics, keyword trackers and deal timelines — computed from what was actually said.",
    items: [
      { icon: Gauge, title: "Coaching metrics", desc: "Talk ratio, longest monologue, questions asked, filler words, interruptions and patience." },
      { icon: BarChart3, title: "Team insights", desc: "Meeting load, weekly trends and per-person averages across your workspace.", href: ROUTES.pages.insights },
      { icon: Radar, title: "Keyword trackers", desc: "Follow competitors, pricing objections or product names across every call.", href: ROUTES.pages.trackers },
      { icon: Building2, title: "Deals view", desc: "External calls grouped by company with stakeholders, next steps and BANT/MEDDPICC.", href: ROUTES.pages.deals },
      { icon: Webhook, title: "Webhooks & Slack", desc: "Push every finished call to Slack, Zapier or your own endpoint.", href: ROUTES.pages.integrations },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <MarketingFrame active={ROUTES.pages.features}>
      <PageHero
        eyebrow="Features"
        title={
          <>
            Everything after “Can
            <br className="hidden sm:block" /> everyone hear me?”
          </>
        }
        desc="Fanthom records the call, writes the notes, and remembers every moment — so you can stay in the conversation."
      />
      <div className="mt-8 flex justify-center">
        <PillLink href={ROUTES.pages.calls} className="h-11 pl-5">
          Try it in the demo workspace
        </PillLink>
      </div>

      {GROUPS.map((g) => (
        <section key={g.eyebrow} className="mx-auto mt-28 max-w-6xl px-4">
          <div className="max-w-2xl">
            <span className="font-mono text-xs text-sky-300">{g.eyebrow}</span>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.035em] md:text-4xl">{g.title}</h2>
            <p className="mt-3 text-white/60">{g.desc}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((f) => (
              <FeatureCard key={f.title} f={f} />
            ))}
          </div>
        </section>
      ))}

      <section className="mx-auto mt-32 flex max-w-3xl flex-col items-center px-5 pb-24 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-[-0.04em] md:text-5xl">See it on a real call.</h2>
        <p className="mt-3 text-white/60">Open the demo workspace — the calls, notes and insights are already there.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <PillLink href={ROUTES.pages.pricing} variant="secondary" className="h-11 px-5">
            Pricing
          </PillLink>
          <PillLink href={ROUTES.pages.calls} className="h-11 pl-5">
            Open the demo workspace
          </PillLink>
        </div>
      </section>
    </MarketingFrame>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  const Icon = f.icon;
  const body = (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.16),transparent)] opacity-60 transition-opacity group-hover:opacity-100"
      />
      <span className="relative flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sky-300">
        <Icon className="size-4" />
      </span>
      <h3 className="relative mt-4 flex items-center gap-1.5 text-lg font-semibold tracking-[-0.02em]">
        {f.title}
        {f.href && <ArrowUpRight className="size-4 text-white/40 transition-transform group-hover:rotate-45 group-hover:text-sky-300" />}
      </h3>
      <p className="relative mt-1.5 text-sm leading-relaxed text-white/60">{f.desc}</p>
    </>
  );
  const cls =
    "group relative block overflow-hidden rounded-3xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(15,23,42,0.7),rgba(8,12,24,0.7))] p-6 transition-colors hover:border-sky-400/20";
  return f.href ? (
    <Link href={f.href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
