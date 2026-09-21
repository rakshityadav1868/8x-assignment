import "server-only";
import { HttpError } from "@/lib/server/errors";

/** Deepgram pre-recorded transcription over REST (no SDK): nova-3, diarize, utterances, smart_format. */

export interface DeepgramUtterance {
  start: number; // seconds
  end: number;
  transcript: string;
  speaker?: number;
  confidence?: number;
}

export interface DeepgramResult {
  duration_sec: number;
  language: string | null;
  utterances: DeepgramUtterance[];
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    utterances?: DeepgramUtterance[];
    channels?: { detected_language?: string }[];
  };
}

export function deepgramAvailable(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}

export async function transcribeUrl(mediaUrl: string, language?: string): Promise<DeepgramResult> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new HttpError(503, "transcription_unavailable", "Transcription needs DEEPGRAM_API_KEY to be configured.");
  const params = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL || "nova-3",
    diarize: "true",
    utterances: "true",
    smart_format: "true",
    punctuate: "true",
    utt_split: "1.2",
  });
  if (language && language !== "auto") params.set("language", language);
  else params.set("detect_language", "true");

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: mediaUrl }),
    cache: "no-store",
    signal: AbortSignal.timeout(280_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Deepgram ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as DeepgramResponse;
  return {
    duration_sec: json.metadata?.duration ?? 0,
    language: json.results?.channels?.[0]?.detected_language ?? language ?? null,
    utterances: (json.results?.utterances ?? []).filter((u) => u.transcript?.trim()),
  };
}

/** Distinct, accessible-on-dark speaker colours. */
export const SPEAKER_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#a855f7", "#ef4444", "#14b8a6", "#ec4899", "#84cc16", "#f97316", "#6366f1"];

/**
 * Map Deepgram utterances to Fanthom participants ("Speaker 1"… in order of first appearance) and segments.
 * Short consecutive utterances from the same speaker are merged for a readable chat-style transcript.
 */
export function mapUtterances(utterances: DeepgramUtterance[]): {
  speakers: { key: number; name: string; color: string }[];
  segments: { speaker: number; start_ms: number; end_ms: number; text: string }[];
} {
  const order: number[] = [];
  for (const u of utterances) {
    const s = u.speaker ?? 0;
    if (!order.includes(s)) order.push(s);
  }
  const speakers = order.map((key, i) => ({ key, name: `Speaker ${i + 1}`, color: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }));
  const segments: { speaker: number; start_ms: number; end_ms: number; text: string }[] = [];
  for (const u of utterances) {
    const sp = u.speaker ?? 0;
    const start_ms = Math.round(u.start * 1000);
    const end_ms = Math.round(u.end * 1000);
    const text = u.transcript.trim();
    const prev = segments[segments.length - 1];
    if (prev && prev.speaker === sp && start_ms - prev.end_ms < 800 && prev.text.length + text.length < 320) {
      prev.text = `${prev.text} ${text}`;
      prev.end_ms = end_ms;
    } else {
      segments.push({ speaker: sp, start_ms, end_ms, text });
    }
  }
  return { speakers, segments };
}
