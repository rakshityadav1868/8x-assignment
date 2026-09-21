/** Compact relative time ("just now", "5m ago", "3h ago", "2d ago", else a short date). */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.round((now - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d > 300 ? { year: "numeric" } : {}) });
}

/** "Sep 14" / "Sep 14, 2025" — en-US short date; pass `tz` (IANA) for server/client-identical output. */
export function shortDate(iso: string | null | undefined, withYear = false, tz?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  // Date-only values ("2027-01-15") are calendar dates: render them in UTC so they never shift a day.
  const zone = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? "UTC" : tz;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    ...(zone ? { timeZone: zone } : {}),
  });
}
