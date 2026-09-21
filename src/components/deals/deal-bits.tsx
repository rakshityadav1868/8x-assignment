import type { DealStage } from "@/lib/types";
import { alpha } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

export const STAGE_META: Record<DealStage, { label: string; color: string }> = {
  discovery: { label: "Discovery", color: "#94a3b8" },
  evaluation: { label: "Evaluation", color: "#60a5fa" },
  proposal: { label: "Proposal", color: "#a78bfa" },
  negotiation: { label: "Negotiation", color: "#fbbf24" },
  closed_won: { label: "Closed won", color: "#34d399" },
  closed_lost: { label: "Closed lost", color: "#f87171" },
};

export function StageBadge({ stage, className }: { stage: DealStage; className?: string }) {
  const m = STAGE_META[stage] ?? STAGE_META.discovery;
  return (
    <span
      className={cn("inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11px] font-medium", className)}
      style={{ color: m.color, backgroundColor: alpha(m.color, 0.12), boxShadow: `inset 0 0 0 1px ${alpha(m.color, 0.25)}` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

/** Monogram "logo" for a company (we never fetch third-party logos). */
export function CompanyMark({ name, domain, size = "md" }: { name: string; domain: string; size?: "md" | "lg" }) {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-semibold tracking-tight text-white/90",
        size === "lg" ? "size-12 text-lg" : "size-9 text-sm",
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 45% / 0.45), hsl(${(hue + 40) % 360} 70% 30% / 0.35))`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 70% 60% / 0.35)`,
      }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
