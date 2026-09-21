import { z } from "zod";
import { HIGHLIGHT_TYPES, type HighlightType } from "@/lib/types";

/**
 * Self-contained clip tokens (seed / demo mode only).
 *
 * On Vercel, pages and route handlers can run in different function instances, each with its own in-memory seed
 * store, so a highlight created via the API may not exist in the instance that renders /clip/[token]. In seed mode a
 * user-created highlight's share_token therefore carries the clip itself:
 *
 *   "c_" + base64url(JSON {m: meeting_id, s: start_ms, e: end_ms, t: type, ti: title, n?: note})
 *
 * and the seed repo can rebuild the ClipDetail from the (static) seed meeting without any shared state.
 * Seeded highlights keep their fixed tokens; Supabase mode keeps random tokens.
 */

export const CLIP_TOKEN_PREFIX = "c_";
/** Notes are clipped inside the token to keep links shareable; the full note stays on the stored highlight. */
const MAX_NOTE_IN_TOKEN = 280;
const MAX_TOKEN_LENGTH = 2400;

export interface ClipTokenData {
  meeting_id: string;
  start_ms: number;
  end_ms: number;
  type: HighlightType;
  title: string;
  note: string | null;
}

const Payload = z
  .object({
    m: z.string().min(1).max(120),
    s: z.number().int().min(0),
    e: z.number().int().min(1),
    t: z.enum(HIGHLIGHT_TYPES),
    ti: z.string().min(1).max(200),
    n: z.string().max(MAX_NOTE_IN_TOKEN + 1).optional(),
  })
  .refine((p) => p.e > p.s);

export function encodeClipToken(d: ClipTokenData): string {
  const note = d.note?.trim() ? (d.note.length > MAX_NOTE_IN_TOKEN ? `${d.note.slice(0, MAX_NOTE_IN_TOKEN)}…` : d.note) : undefined;
  const payload: z.infer<typeof Payload> = {
    m: d.meeting_id,
    s: Math.round(d.start_ms),
    e: Math.round(d.end_ms),
    t: d.type,
    ti: d.title,
    ...(note ? { n: note } : {}),
  };
  return CLIP_TOKEN_PREFIX + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** Decodes and validates a self-contained token; null for anything else (seeded / random tokens, tampering). */
export function decodeClipToken(token: string): ClipTokenData | null {
  if (!token.startsWith(CLIP_TOKEN_PREFIX) || token.length > MAX_TOKEN_LENGTH) return null;
  const body = token.slice(CLIP_TOKEN_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) return null;
  try {
    const parsed = Payload.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    const p = parsed.data;
    return { meeting_id: p.m, start_ms: p.s, end_ms: p.e, type: p.t, title: p.ti, note: p.n ?? null };
  } catch {
    return null;
  }
}
