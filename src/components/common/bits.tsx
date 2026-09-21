"use client";

import {
  AlertTriangle,
  CircleCheck,
  CircleHelp,
  FlaskConical,
  Gavel,
  ThumbsUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatClock } from "@/lib/ui/format";
import { MEETING_TYPE_LABELS } from "@/lib/templates";
import type { MeetingType, HighlightType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Small mono chip showing a media offset; clicking it seeks. */
export function TimestampChip({
  ms,
  onClick,
  className,
  title,
  inert = false,
}: {
  ms: number;
  onClick?: () => void;
  className?: string;
  title?: string;
  /** Render as a non-interactive span (use inside an already-clickable row). */
  inert?: boolean;
}) {
  const cls = cn(
    "inline-flex h-5 shrink-0 items-center rounded-md bg-primary/12 px-1.5 font-mono text-[11px] font-medium tabular-nums text-sky-300 ring-1 ring-primary/25 transition-colors hover:bg-primary/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  if (inert) return <span className={cls}>{formatClock(ms)}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={title ?? `Jump to ${formatClock(ms)}`}
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md bg-primary/12 px-1.5 font-mono text-[11px] font-medium tabular-nums text-sky-300 ring-1 ring-primary/25 transition-colors hover:bg-primary/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {formatClock(ms)}
    </button>
  );
}

const TYPE_TONE: Record<MeetingType, string> = {
  sales: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20",
  customer_success: "text-teal-300 bg-teal-400/10 ring-teal-400/20",
  standup: "text-amber-300 bg-amber-400/10 ring-amber-400/20",
  one_on_one: "text-pink-300 bg-pink-400/10 ring-pink-400/20",
  interview: "text-violet-300 bg-violet-400/10 ring-violet-400/20",
  project_update: "text-sky-300 bg-sky-400/10 ring-sky-400/20",
  planning: "text-blue-300 bg-blue-400/10 ring-blue-400/20",
  qa: "text-orange-300 bg-orange-400/10 ring-orange-400/20",
  general: "text-slate-300 bg-slate-400/10 ring-slate-400/20",
};

export function MeetingTypeBadge({ type, className }: { type: MeetingType; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ring-1 ring-inset",
        TYPE_TONE[type] ?? TYPE_TONE.general,
        className,
      )}
    >
      {MEETING_TYPE_LABELS[type] ?? type}
    </span>
  );
}

export const HIGHLIGHT_META: Record<HighlightType, { label: string; color: string; icon: LucideIcon }> = {
  positive: { label: "Positive", color: "#34d399", icon: ThumbsUp },
  pain_point: { label: "Pain point", color: "#f87171", icon: Zap },
  question: { label: "Question", color: "#fbbf24", icon: CircleHelp },
  action_item: { label: "Action item", color: "#60a5fa", icon: CircleCheck },
  decision: { label: "Decision", color: "#c084fc", icon: Gavel },
};

export function DemoModeBadge({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-5 cursor-help items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/8 px-2 text-[10px] font-medium uppercase tracking-wider text-amber-200/90",
            className,
          )}
        >
          <FlaskConical className="size-3" /> Demo mode
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">
        AI offline — no Anthropic key configured. Results come from a deterministic, extractive fallback
        grounded in the transcript.
      </TooltipContent>
    </Tooltip>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-primary shadow-[0_0_24px_-8px_var(--brand)]">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10 text-red-300">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Renders a locale/timezone-dependent string only after hydration (no mismatch, fixed-width placeholder). */
export function ClientText({
  render,
  placeholderWidth = "6ch",
  className,
}: {
  render: () => string;
  placeholderWidth?: string;
  className?: string;
}) {
  const hydrated = useHydrated();
  if (!hydrated)
    return (
      <span
        className={cn("inline-block h-[0.9em] animate-pulse rounded bg-white/5 align-middle", className)}
        style={{ width: placeholderWidth }}
      />
    );
  return <span className={className}>{render()}</span>;
}
