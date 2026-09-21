import "server-only";
import { aiAvailable } from "@/lib/capabilities";
import { HttpError } from "./errors";

/**
 * In-memory abuse protection for routes that can spend money (Claude / Deepgram). Per server instance —
 * good enough for a demo on Vercel; a shared store (Upstash/Redis) would be the production upgrade.
 *
 * 1. Per-IP token bucket: IP_BURST requests, refilling at IP_REFILL_PER_MIN per minute.
 * 2. Per-meeting cap on *paid* generations: MEETING_CAP_PER_HOUR in a sliding hour (only counted when a key is set).
 */
const IP_BURST = Number(process.env.RATE_LIMIT_IP_BURST ?? 20);
const IP_REFILL_PER_MIN = Number(process.env.RATE_LIMIT_IP_PER_MIN ?? 10);
const MEETING_CAP_PER_HOUR = Number(process.env.RATE_LIMIT_MEETING_PER_HOUR ?? 30);

interface Bucket {
  tokens: number;
  at: number;
}
const g = globalThis as unknown as { __fanthomRL?: { ip: Map<string, Bucket>; meeting: Map<string, number[]> } };
const state = () => (g.__fanthomRL ??= { ip: new Map(), meeting: new Map() });

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}

function takeIpToken(ip: string): number | null {
  const { ip: buckets } = state();
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: IP_BURST, at: now };
  b.tokens = Math.min(IP_BURST, b.tokens + ((now - b.at) / 60_000) * IP_REFILL_PER_MIN);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return Math.ceil(((1 - b.tokens) / IP_REFILL_PER_MIN) * 60); // seconds until next token
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 10_000) buckets.clear(); // crude memory guard
  return null;
}

function takeMeetingSlot(meetingId: string): number | null {
  const { meeting } = state();
  const now = Date.now();
  const recent = (meeting.get(meetingId) ?? []).filter((t: number) => now - t < 3_600_000);
  if (recent.length >= MEETING_CAP_PER_HOUR) {
    meeting.set(meetingId, recent);
    return Math.ceil((recent[0] + 3_600_000 - now) / 1000);
  }
  recent.push(now);
  meeting.set(meetingId, recent);
  return null;
}

/**
 * Call at the top of every LLM / transcription route. Throws 429 `rate_limited` (with Retry-After).
 * `paid` forces the per-meeting cap even without an Anthropic key (e.g. Deepgram processing).
 */
export function enforceAiLimits(req: Request, meetingId: string | null, opts: { paid?: boolean } = {}): void {
  const wait = takeIpToken(clientIp(req));
  if (wait != null) {
    throw new HttpError(429, "rate_limited", `Too many AI requests — try again in ${wait}s.`, { "Retry-After": String(wait) });
  }
  if (meetingId && (opts.paid || aiAvailable())) {
    const w = takeMeetingSlot(meetingId);
    if (w != null) {
      throw new HttpError(429, "rate_limited", `This meeting hit its hourly AI limit — try again in ${Math.ceil(w / 60)} min.`, {
        "Retry-After": String(w),
      });
    }
  }
}
