import { cn } from "@/lib/utils";

/** Shared building blocks for the dashboard-style pages (/insights, /trackers, /deals). */

export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DashCard({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] shadow-[0_20px_60px_-40px_rgba(59,130,246,0.35)]",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          {title && <h2 className="text-sm font-medium">{title}</h2>}
          {action}
        </header>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-4",
        className,
      )}
    >
      <p className="truncate text-[13px] font-medium text-white/80">{label}</p>
      <div className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Pill segmented control (dark), e.g. 7d / 30d / 90d. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-full px-3 text-xs font-medium transition-colors",
            value === o.value ? "bg-white text-neutral-950" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Inline horizontal bar (0..1) used as a sparkline-ish comparison in tables. */
export function InlineBar({ frac, color = "#3b82f6", className }: { frac: number; color?: string; className?: string }) {
  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(f > 0 ? 3 : 0, f * 100)}%`, backgroundColor: color }} />
    </span>
  );
}

/** Inline (phrasing-content-safe) skeleton for use inside spans/links. */
export function SkelSpan({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-md bg-muted", className)} />;
}
