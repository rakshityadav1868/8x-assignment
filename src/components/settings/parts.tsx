"use client";

import { Check, FlaskConical, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  desc,
  children,
  action,
}: {
  title: string;
  desc?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {desc && <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/[0.06] py-3.5 first:pt-0 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("min-w-0 max-w-full rounded-2xl border border-white/8 bg-white/[0.02] p-4", className)}>{children}</div>;
}

export function Monogram({ mono, tint, icon: Icon }: { mono?: string; tint: string; icon?: LucideIcon }) {
  return (
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
      style={{ color: tint, backgroundColor: `${tint}1f`, boxShadow: `inset 0 0 0 1px ${tint}40` }}
    >
      {Icon ? <Icon className="size-4" /> : mono}
    </span>
  );
}

export function StatusChip({ tone, children }: { tone: "live" | "stub" | "off" | "error"; children: React.ReactNode }) {
  const cls = {
    live: "bg-emerald-400/10 text-emerald-300",
    stub: "border border-amber-300/20 bg-amber-300/8 text-amber-200/90",
    off: "bg-white/[0.06] text-muted-foreground",
    error: "bg-red-400/10 text-red-300",
  }[tone];
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-medium uppercase tracking-wider", cls)}>
      {tone === "live" && <Check className="size-3" />}
      {tone === "stub" && <FlaskConical className="size-3" />}
      {children}
    </span>
  );
}
