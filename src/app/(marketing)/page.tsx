import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PillLink } from "@/components/brand/pill-link";

/** Phase 0 placeholder landing — frontend agent builds the full page (particle canvas hero, preview, features). */
export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[38%] mx-auto h-[640px] max-w-5xl rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.35),transparent)] blur-2xl"
      />
      <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-10">
        <Logo />
        <nav className="hidden items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1 pl-5 text-sm backdrop-blur md:flex">
          <a href="#features" className="px-3 py-1.5 text-white/80 hover:text-white">Features</a>
          <Link href="/search" className="px-3 py-1.5 text-white/80 hover:text-white">Search</Link>
          <PillLink href="/calls" className="ml-2 h-9">Open demo</PillLink>
        </nav>
        <PillLink href="/calls" className="h-9 md:hidden">Demo</PillLink>
      </header>

      <main className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-5 pt-20 text-center md:pt-32">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-white/80">
          <Sparkles className="size-3.5 text-primary" /> AI notes, summaries & action items for every call
        </span>
        <h1 className="mt-6 text-balance text-5xl font-semibold tracking-[-0.04em] md:text-7xl">
          Never take meeting
          <br />
          notes again.
        </h1>
        <p className="mt-5 max-w-xl text-balance text-base text-white/70 md:text-lg">
          Fanthom records, transcribes and summarizes your calls — then lets you jump to the exact moment anything was said.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PillLink href="/upload" variant="secondary">Upload a recording</PillLink>
          <PillLink href="/calls">Open the demo workspace</PillLink>
        </div>
      </main>
    </div>
  );
}
