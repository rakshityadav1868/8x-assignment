import { Video } from "lucide-react";
import type { BotPlatform } from "@/lib/types";
import { cn } from "@/lib/utils";

export const PLATFORM_META: Record<BotPlatform, { label: string; mono: string; tint: string }> = {
  zoom: { label: "Zoom", mono: "Zm", tint: "#2d8cff" },
  google_meet: { label: "Google Meet", mono: "Gm", tint: "#00ac47" },
  teams: { label: "Microsoft Teams", mono: "Mt", tint: "#7b83eb" },
  unknown: { label: "Meeting link", mono: "", tint: "#94a3b8" },
};

/** Client-side mirror of `detectPlatform` (integrations/bot.ts) for instant feedback while typing. */
export function detectPlatformClient(raw: string): BotPlatform | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  if (h === "zoom.us" || h.endsWith(".zoom.us") || h.endsWith(".zoomgov.com")) return "zoom";
  if (h === "meet.google.com") return "google_meet";
  if (h === "teams.microsoft.com" || h === "teams.live.com" || h.endsWith(".teams.microsoft.com")) return "teams";
  return "unknown";
}

/** Monogram tile (we don't ship third-party logos). */
export function PlatformIcon({ platform, className }: { platform: BotPlatform; className?: string }) {
  const m = PLATFORM_META[platform] ?? PLATFORM_META.unknown;
  return (
    <span
      title={m.label}
      aria-label={m.label}
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold", className)}
      style={{ color: m.tint, backgroundColor: `${m.tint}1f`, boxShadow: `inset 0 0 0 1px ${m.tint}40` }}
    >
      {m.mono || <Video className="size-3" />}
    </span>
  );
}
