/** Pure formatting helpers shared by client + server components (no Date.now() at import time). */

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Date helpers. Pass `tz` (IANA zone) for deterministic output that is identical on server and
 * client (en-US locale); without it they use the runtime's local zone/locale.
 */
export const DEFAULT_TZ = "America/New_York";

export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar day key, e.g. "2026-09-21". */
export function dayKey(d: Date, tz?: string): string {
  if (tz) return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(d: Date, now: Date, tz?: string): string {
  const k = dayKey(d, tz);
  if (k === dayKey(now, tz)) return "Today";
  if (k === dayKey(new Date(now.getTime() - 86_400_000), tz)) return "Yesterday";
  if (k === dayKey(new Date(now.getTime() + 86_400_000), tz)) return "Tomorrow";
  const diffDays = (now.getTime() - d.getTime()) / 86_400_000;
  const loc = tz ? "en-US" : undefined;
  if (diffDays < 6 && diffDays > 0) return d.toLocaleDateString(loc, { weekday: "long", timeZone: tz });
  const sameYear = dayKey(d, tz).slice(0, 4) === dayKey(now, tz).slice(0, 4);
  return d.toLocaleDateString(loc, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: tz,
  });
}

export function timeOfDay(d: Date, tz?: string): string {
  return d.toLocaleTimeString(tz ? "en-US" : undefined, { hour: "numeric", minute: "2-digit", timeZone: tz });
}

export function longDate(d: Date, tz?: string): string {
  return d.toLocaleDateString(tz ? "en-US" : undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  });
}

/** Hex → rgba string with alpha. Falls back to brand blue. */
export function alpha(hex: string | null | undefined, a: number): string {
  const h = (hex ?? "#3b82f6").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(59,130,246,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
