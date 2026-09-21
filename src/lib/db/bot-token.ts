import { z } from "zod";
import { BOT_PLATFORMS, type BotPlatform } from "@/lib/types";

/**
 * Self-contained bot-session ids (seed / demo mode only) — same idea as clip tokens (./clip-token.ts).
 *
 * On Vercel each function instance has its own in-memory seed store, so a bot session created by POST /api/bots
 * may be polled (GET /api/bots/:id) on another instance. In seed mode the session id therefore carries what is
 * needed to rebuild it:
 *
 *   "b_" + base64url(JSON {u: meeting_url, p: platform, c: created_at ms, t?: title})
 *
 * The state is replayed from `created_at` by the backend's stateless autoAdvanceBot. The meeting a finished bot
 * produces gets a deterministic id `m_bot_<token body>`, which any instance can materialise from the template.
 */

export const BOT_TOKEN_PREFIX = "b_";
export const BOT_MEETING_PREFIX = "m_bot_";
const MAX_TOKEN_LENGTH = 3000;

export interface BotTokenData {
  meeting_url: string;
  platform: BotPlatform;
  created_at_ms: number;
  title: string | null;
}

const Payload = z.object({
  u: z.string().min(1).max(2000),
  p: z.enum(BOT_PLATFORMS),
  c: z.number().int().positive(),
  t: z.string().max(200).optional(),
});

export function encodeBotToken(d: BotTokenData): string {
  const payload: z.infer<typeof Payload> = {
    u: d.meeting_url,
    p: d.platform,
    c: Math.round(d.created_at_ms),
    ...(d.title ? { t: d.title.slice(0, 200) } : {}),
  };
  return BOT_TOKEN_PREFIX + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** Decodes + validates a self-contained bot id; null for anything else. */
export function decodeBotToken(token: string): BotTokenData | null {
  if (!token.startsWith(BOT_TOKEN_PREFIX) || token.length > MAX_TOKEN_LENGTH) return null;
  const body = token.slice(BOT_TOKEN_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return null;
  try {
    const parsed = Payload.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    const p = parsed.data;
    if (p.c > Date.now() + 60_000) return null; // not from the future
    return { meeting_url: p.u, platform: p.p, created_at_ms: p.c, title: p.t ?? null };
  } catch {
    return null;
  }
}

/** Deterministic meeting id for the meeting a (self-contained) bot session produces. */
export function botMeetingId(botId: string): string {
  return BOT_MEETING_PREFIX + botId.slice(BOT_TOKEN_PREFIX.length);
}

/** Inverse of botMeetingId: the bot token, or null when `meetingId` is not a bot meeting id. */
export function botIdFromMeetingId(meetingId: string): string | null {
  return meetingId.startsWith(BOT_MEETING_PREFIX) ? BOT_TOKEN_PREFIX + meetingId.slice(BOT_MEETING_PREFIX.length) : null;
}
