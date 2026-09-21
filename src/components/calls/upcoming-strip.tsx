"use client";

import Link from "next/link";
import { ArrowRight, Mic } from "lucide-react";
import { AvatarStack } from "@/components/common/participant-avatar";
import { useTimeZone } from "@/components/common/time-zone";
import { ROUTES } from "@/lib/routes";
import { dayLabel, timeOfDay } from "@/lib/ui/format";
import type { UpcomingMeeting } from "@/lib/types";
import { cn } from "@/lib/utils";

export function UpcomingStrip({ upcoming, nowIso }: { upcoming: UpcomingMeeting[]; nowIso: string }) {
  const tz = useTimeZone();
  const now = new Date(nowIso);
  const sorted = [...upcoming].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8);
  return (
    <section className="mt-8" aria-label="Upcoming meetings">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">Upcoming</h2>
        <Link href={ROUTES.pages.calendar} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          Calendar & auto-record <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:px-0">
        {sorted.map((u, i) => {
          const s = new Date(u.start);
          const e = new Date(u.end);
          const soon = s.getTime() - now.getTime() < 60 * 60 * 1000 && s.getTime() > now.getTime();
          return (
            <Link
              href={ROUTES.pages.calendar}
              key={u.id}
              className={cn(
                "glass relative w-64 shrink-0 snap-start overflow-hidden rounded-2xl p-4 transition-colors hover:border-white/15",
                i === 0 && "border-primary/30 shadow-[0_0_40px_-18px_var(--brand)]",
              )}
            >
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="tabular-nums" suppressHydrationWarning>
                  {dayLabel(s, now, tz)} · {timeOfDay(s, tz)}–{timeOfDay(e, tz)}
                </span>
                {soon && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-sky-300">Soon</span>}
              </div>
              <p className="mt-2 truncate text-sm font-medium tracking-tight">{u.title}</p>
              <div className="mt-3 flex items-center justify-between">
                <AvatarStack people={u.attendees} max={4} size="xs" />
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Mic className="size-3 text-primary" /> Fanthom joins
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
