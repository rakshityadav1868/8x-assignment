import type { Metadata } from "next";
import Link from "next/link";
import { FastForward, Link2, MessageSquareText, Scissors, Search, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PillLink } from "@/components/brand/pill-link";
import { AppPreview } from "@/components/marketing/app-preview";
import { ParticleDome } from "@/components/marketing/particle-dome";
import { getRepo } from "@/lib/db";
import { ROUTES } from "@/lib/contracts";

export const metadata: Metadata = {
  title: "Fanthom — Never take meeting notes again",
  description:
    "Fanthom records, transcribes and summarizes your calls — then lets you jump to the exact moment anything was said.",
};
export const dynamic = "force-dynamic";

/** "See it in action" → the long multi-speaker planning call if it exists, else the longest call. */
async function showcaseHref(): Promise<string> {
  try {
    const meetings = await getRepo().listMeetings();
    const pick =
      meetings.find((m) => /roadmap/i.test(m.title)) ??
      [...meetings].sort((a, b) => b.participants.length - a.participants.length || b.duration_sec - a.duration_sec)[0];
    return pick ? ROUTES.pages.call(pick.id) : ROUTES.pages.calls;
  } catch {
    return ROUTES.pages.calls;
  }
}

export default async function LandingPage() {
  const seeIt = await showcaseHref();
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-[#03050b]">
      {/* Floating pill nav */}
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-4 py-4 md:px-8">
        <Logo />
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-white/[0.08] bg-black/55 p-1 pl-4 text-sm shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl md:flex">
          <a href="#features" className="rounded-full px-3 py-1.5 text-white/75 transition-colors hover:text-white">
            Features
          </a>
          <a href="#how" className="rounded-full px-3 py-1.5 text-white/75 transition-colors hover:text-white">
            How it works
          </a>
          <Link href={ROUTES.pages.search()} className="rounded-full px-3 py-1.5 text-white/75 transition-colors hover:text-white">
            Search
          </Link>
          <PillLink href={ROUTES.pages.calls} className="ml-2 h-9">
            Open demo
          </PillLink>
        </nav>
        <PillLink href={ROUTES.pages.calls} className="h-9 md:hidden">
          Demo
        </PillLink>
      </header>

      {/* Hero */}
      <section className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[900px] bg-[radial-gradient(60%_50%_at_50%_75%,rgba(37,99,235,0.28),transparent_70%)]"
        />
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 pt-32 text-center md:pt-40">
          <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-white/80 backdrop-blur">
            <Sparkles className="size-3.5 text-sky-300" /> Now with Ask Fanthom — answers that cite the exact moment
          </span>
          <h1
            className="animate-rise mt-6 text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl md:text-[80px]"
            style={{ animationDelay: "60ms" }}
          >
            Never take meeting
            <br />
            notes again.
          </h1>
          <p
            className="animate-rise mt-5 max-w-xl text-balance text-base text-white/65 md:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            Fanthom records, transcribes and summarizes your calls — then takes you to the exact moment anything was said.
          </p>
          <div className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "180ms" }}>
            <PillLink href={seeIt} variant="secondary" className="h-11 px-5">
              See it in action
            </PillLink>
            <PillLink href={ROUTES.pages.calls} className="h-11 pl-5">
              Open the demo workspace
            </PillLink>
          </div>
        </div>

        {/* Dome + app preview */}
        <div className="relative mt-4 md:mt-2">
          <div className="relative h-[340px] w-full sm:h-[460px] md:h-[560px]">
            <ParticleDome className="absolute inset-0" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#03050b]"
            />
          </div>
          <div className="relative z-10 mx-auto -mt-[170px] max-w-5xl px-4 sm:-mt-[240px] md:-mt-[300px]">
            <AppPreview />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 pt-28 md:pt-36">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-[-0.035em] md:text-5xl">Every call, instantly searchable.</h2>
          <p className="mt-4 text-balance text-white/60 md:text-lg">
            Notes you can trust because every line links back to what was actually said.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-6">
          <Feature
            className="md:col-span-4"
            icon={MessageSquareText}
            title="Synced transcript"
            desc="Speaker-labelled, chat-style and in lock-step with playback. Click any line to jump; the active line follows along."
          >
            <div className="space-y-1.5">
              {[
                ["Priya", "#60a5fa", "Search has to ship before the holiday freeze.", false],
                ["Marcus", "#f59e0b", "Then sharing slips a week — I'm fine with that.", true],
                ["Ana", "#34d399", "I'll write it up and circulate by Thursday.", false],
              ].map(([n, c, t, on]) => (
                <div
                  key={n as string}
                  className={`rounded-lg px-2.5 py-1.5 text-[12px] ${on ? "bg-sky-400/[0.13] shadow-[inset_2px_0_0_0_#60a5fa]" : ""}`}
                >
                  <span className="font-medium" style={{ color: c as string }}>
                    {n}
                  </span>
                  <span className="ml-2 text-white/70">{t}</span>
                </div>
              ))}
            </div>
          </Feature>
          <Feature
            className="md:col-span-2"
            icon={Sparkles}
            title="Summaries that link to the moment"
            desc="11 templates — Sales, BANT, MEDDPICC, 1:1, stand-up… Every bullet has a timestamp."
          >
            <div className="space-y-1.5">
              {["Budget approved for 25 seats", "Security review before rollout", "Pilot starts Monday"].map((b, i) => (
                <p key={b} className="flex items-center gap-2 text-[12px] text-white/75">
                  <span className="size-1 rounded-full bg-sky-400" />
                  <span className="flex-1 truncate">{b}</span>
                  <span className="rounded bg-primary/15 px-1.5 font-mono text-[10px] text-sky-300">{["1:42", "3:08", "7:55"][i]}</span>
                </p>
              ))}
            </div>
          </Feature>
          <Feature
            className="md:col-span-2"
            icon={FastForward}
            title="Chapters & speaker timeline"
            desc="Made for the 60-minute, 8-person call: a chapter rail, talk-time per person, and “catch me up from minute 23”."
          >
            <div className="space-y-2">
              <div className="flex gap-1">
                {[28, 18, 34, 20].map((w, i) => (
                  <span
                    key={i}
                    className={`h-5 rounded ${i === 2 ? "bg-primary/40 ring-1 ring-sky-400/50" : "bg-white/[0.07]"}`}
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
              {["#60a5fa", "#f59e0b", "#34d399"].map((c, r) => (
                <div key={c} className="relative h-2 rounded-sm bg-white/[0.04]">
                  {[0, 1, 2, 3, 4].map((k) => (
                    <span
                      key={k}
                      className="absolute inset-y-0 rounded-[2px]"
                      style={{ left: `${(r * 11 + k * 19) % 92}%`, width: `${3 + ((r + k) % 3) * 3}%`, background: c }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </Feature>
          <Feature
            className="md:col-span-2"
            icon={Search}
            title="Ask Fanthom"
            desc="Ask anything about a call. Answers cite transcript moments you can click."
          >
            <div className="space-y-2 text-[12px]">
              <p className="ml-auto w-fit rounded-xl rounded-br-sm bg-primary px-2.5 py-1 text-white">What did Ana commit to?</p>
              <p className="w-fit max-w-[95%] rounded-xl rounded-bl-sm bg-white/[0.06] px-2.5 py-1 text-white/80">
                The migration plan by Thursday{" "}
                <span className="rounded bg-primary/20 px-1 font-mono text-[10px] text-sky-300">12:41</span>
              </p>
            </div>
          </Feature>
          <Feature
            className="md:col-span-2"
            icon={Scissors}
            title="Clips & sharing"
            desc="Highlight any line as a pain point, decision or question — each becomes a shareable clip."
          >
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-2 text-[12px] text-white/60">
              <Link2 className="size-3.5 text-sky-300" />
              <span className="truncate">fanthom.app/clip/pain-point-follow-ups</span>
            </div>
          </Feature>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-28">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["01", "Record or upload", "Drop in a recording — Fanthom transcribes it with speaker labels."],
            ["02", "Read the notes", "A summary in your template, action items with owners, chapters and decisions."],
            ["03", "Jump to the moment", "Search every call or ask a question and land on the exact second."],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6">
              <span className="font-mono text-xs text-sky-300">{n}</span>
              <p className="mt-3 text-lg font-semibold tracking-tight">{t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative mt-28 overflow-hidden border-t border-white/[0.06]">
        <div className="absolute inset-0">
          <ParticleDome variant="rings" className="absolute inset-0 opacity-90" density={0.8} />
          <div className="absolute inset-0 bg-[radial-gradient(50%_60%_at_30%_50%,#03050b_20%,transparent_80%)]" />
        </div>
        <div className="relative z-10 mx-auto flex min-h-[520px] max-w-4xl flex-col items-center justify-center px-5 py-24 text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-[-0.045em] md:text-6xl">Start with Fanthom.</h2>
          <p className="mt-4 max-w-md text-balance text-white/60">
            A demo workspace with real calls, transcripts and AI notes is one click away. No sign-up.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillLink href={ROUTES.pages.upload} variant="secondary" className="h-11 px-5">
              Upload a recording
            </PillLink>
            <PillLink href={ROUTES.pages.calls} className="h-11 pl-5">
              Open the demo workspace
            </PillLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-white/40 sm:flex-row">
          <Logo className="text-white/80" />
          <p>A demo meeting notetaker · built with Next.js, Claude and Deepgram.</p>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
  children,
  className,
}: {
  icon: typeof Sparkles;
  title: string;
  desc: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(15,23,42,0.7),rgba(8,12,24,0.7))] p-6 transition-colors hover:border-sky-400/20 ${className ?? ""}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.18),transparent)] opacity-60 transition-opacity group-hover:opacity-100"
      />
      <div className="relative">
        <span className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sky-300">
          <Icon className="size-4" />
        </span>
        <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-white/60">{desc}</p>
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-black/25 p-3">{children}</div>
      </div>
    </div>
  );
}
