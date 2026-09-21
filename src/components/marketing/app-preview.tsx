"use client";

import { useEffect, useState } from "react";
import { Pause, Search, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** A live, miniature rendering of the call page (not a screenshot) — the active line cycles like playback. */
const PEOPLE = [
  { n: "Priya Shah", i: "PS", c: "#60a5fa" },
  { n: "Marcus Lee", i: "ML", c: "#f59e0b" },
  { n: "Ana Costa", i: "AC", c: "#34d399" },
  { n: "Tom Becker", i: "TB", c: "#f472b6" },
  { n: "Wei Zhang", i: "WZ", c: "#a78bfa" },
  { n: "Sam Ortiz", i: "SO", c: "#22d3ee" },
];

const LINES = [
  { p: 0, t: "12:04", x: "Let's lock the Q4 scope today — search and sharing are the must-haves." },
  { p: 1, t: "12:19", x: "Agreed. Mobile can slip to January if we keep the API stable." },
  { p: 2, t: "12:41", x: "I'll own the migration plan and send it by Thursday." },
  { p: 4, t: "13:02", x: "Risk: the analytics rewrite overlaps with the pricing launch." },
  { p: 3, t: "13:26", x: "Then we stagger them — pricing first, analytics in week three." },
];

const BULLETS = [
  { x: "Q4 scope locked: search + sharing ship first", t: "12:04" },
  { x: "Mobile moves to January; API frozen", t: "12:19" },
  { x: "Ana owns the migration plan — due Thursday", t: "12:41" },
];

export function AppPreview({ className }: { className?: string }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % LINES.length), 2400);
    return () => clearInterval(id);
  }, []);
  const speaker = LINES[active].p;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] border border-white/10 bg-[#070b16]/85 p-1.5 shadow-[0_40px_120px_-30px_rgba(59,130,246,0.55),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="rounded-[18px] border border-white/[0.06] bg-[#080d1a]">
        {/* chrome */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <LogoMark className="size-5 rounded-md [&_svg]:size-3" />
          <span className="text-xs font-semibold">Fanthom</span>
          <div className="ml-4 hidden h-6 flex-1 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 text-[10px] text-white/40 sm:flex">
            <Search className="size-3" /> Search across all calls…
          </div>
          <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary/25 text-[8px] text-sky-300">AR</span>
        </div>

        <div className="grid gap-3 p-3 md:grid-cols-[1.45fr_1fr]">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight">Q4 Roadmap Planning</p>
            <p className="mt-0.5 text-[10px] text-white/45">60 min · 8 people · Planning</p>
            {/* stage */}
            <div className="mt-2.5 grid aspect-[16/8.5] grid-cols-3 grid-rows-2 gap-1.5 rounded-xl border border-white/[0.06] bg-[#060a14] p-1.5">
              {PEOPLE.map((p, i) => {
                const on = i === speaker;
                return (
                  <div
                    key={p.i}
                    className={cn(
                      "relative flex items-center justify-center rounded-lg border bg-[#0b1222] transition-all duration-500",
                      on ? "border-sky-400/80 shadow-[0_0_22px_-4px_rgba(59,130,246,0.85)]" : "border-white/[0.05]",
                    )}
                  >
                    <span
                      className="flex size-7 items-center justify-center rounded-full text-[9px] font-semibold sm:size-9 sm:text-[11px]"
                      style={{ color: p.c, background: `${p.c}2e`, boxShadow: `inset 0 0 0 1px ${p.c}55` }}
                    >
                      {p.i}
                    </span>
                    <span className="absolute bottom-1 left-1 hidden rounded bg-black/50 px-1 text-[8px] text-white/80 sm:block">
                      {p.n.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* controls */}
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
              <Pause className="size-3 fill-current text-white/80" />
              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-sky-400 transition-[width] duration-[2400ms] ease-linear"
                  style={{ width: `${20 + active * 4}%` }}
                />
              </div>
              <span className="font-mono text-[9px] text-white/60">{LINES[active].t}</span>
            </div>
            {/* speaker timeline */}
            <div className="mt-2 hidden space-y-1 sm:block">
              {PEOPLE.slice(0, 4).map((p, r) => (
                <div key={p.i} className="flex items-center gap-2">
                  <span className="w-10 truncate text-[8px] text-white/50">{p.n.split(" ")[0]}</span>
                  <div className="relative h-1.5 flex-1 rounded-sm bg-white/[0.04]">
                    {[0, 1, 2, 3].map((k) => (
                      <span
                        key={k}
                        className="absolute inset-y-0 rounded-[1px]"
                        style={{ left: `${(r * 7 + k * 23) % 90}%`, width: `${4 + ((r + k) % 3) * 3}%`, background: p.c, opacity: 0.8 }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* right panel */}
          <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex gap-3 border-b border-white/[0.06] px-3 pt-2 text-[10px]">
              <span className="text-white/45">Summary</span>
              <span className="border-b border-sky-400 pb-1.5 text-white">Transcript</span>
              <span className="text-white/45">Ask</span>
            </div>
            <div className="space-y-1 p-2">
              {LINES.map((l, i) => {
                const p = PEOPLE[l.p];
                const on = i === active;
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md px-1.5 py-1 transition-colors duration-500",
                      on ? "bg-sky-400/[0.13] shadow-[inset_2px_0_0_0_#60a5fa]" : "",
                    )}
                  >
                    <p className="text-[9px]">
                      <span style={{ color: p.c }} className="font-medium">
                        {p.n}
                      </span>{" "}
                      <span className="font-mono text-white/35">{l.t}</span>
                    </p>
                    <p className={cn("text-[10px] leading-snug", on ? "text-white" : "text-white/55")}>{l.x}</p>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-white/[0.06] p-2">
              <p className="mb-1 flex items-center gap-1 text-[9px] font-medium text-white/70">
                <Sparkles className="size-2.5 text-primary" /> Key takeaways
              </p>
              {BULLETS.map((b) => (
                <p key={b.t} className="flex items-center gap-1.5 py-0.5 text-[9.5px] text-white/70">
                  <span className="size-1 rounded-full bg-sky-400/70" />
                  <span className="flex-1 truncate">{b.x}</span>
                  <span className="rounded bg-primary/15 px-1 font-mono text-[8px] text-sky-300">{b.t}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
