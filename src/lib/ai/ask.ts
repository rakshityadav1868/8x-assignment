import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiAvailable } from "@/lib/capabilities";
import { streamText } from "@/lib/llm";
import { askSystem } from "@/lib/prompts/ask";
import { meetingHeader } from "@/lib/prompts/common";
import { Bm25, terms } from "@/lib/search/text";
import type { AiMode, ChatMessage, Citation, MeetingDetail, TranscriptSegment } from "@/lib/types";
import { chunkForStreaming, demoAsk, demoAskAcross } from "./demo";
import { fmtTs, formatTranscript, participantList, speakerMap, speakerName } from "./transcript";

export type AskChunk = { type: "delta"; text: string } | { type: "citations"; citations: Citation[] };

export interface AskRun {
  ai_mode: AiMode;
  /** Yields text deltas, then one final `citations` chunk. */
  stream: AsyncGenerator<AskChunk>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* demoStream(answer: { text: string; citations: Citation[] }): AsyncGenerator<AskChunk> {
  await sleep(250); // feels like "thinking"
  for (const piece of chunkForStreaming(answer.text)) {
    yield { type: "delta", text: piece };
    await sleep(18);
  }
  yield { type: "citations", citations: answer.citations };
}

/**
 * Live stream: the model cites transcript lines as `[#12]`; we rewrite those into sequential `[1]`, `[2]`
 * markers on the fly (buffering any partially-received bracket) and collect Citation objects.
 */
async function* liveStream(system: string, messages: Anthropic.MessageParam[], refs: TranscriptSegment[]): AsyncGenerator<AskChunk> {
  const citations: Citation[] = [];
  const indexFor = (ref: number): number | null => {
    const seg = refs[ref];
    if (!seg) return null;
    const existing = citations.find((c) => c.segment_id === seg.id);
    if (existing) return existing.index;
    const index = citations.length + 1;
    const quote = seg.text.length > 160 ? `${seg.text.slice(0, 157)}…` : seg.text;
    citations.push({ index, segment_id: seg.id, meeting_id: seg.meeting_id, start_ms: seg.start_ms, quote });
    return index;
  };
  const rewrite = (s: string) =>
    s.replace(/\[\s*#\d+(?:\s*[,;]\s*#?\d+)*\s*\]/g, (m) => {
      const ids = (m.match(/\d+/g) ?? []).map(Number);
      const marks = ids.map(indexFor).filter((n): n is number => n != null);
      return marks.map((n) => `[${n}]`).join("");
    });

  let pending = "";
  for await (const delta of streamText(system, messages, { maxTokens: 1200 })) {
    pending += delta;
    const open = pending.lastIndexOf("[");
    const holdFrom = open >= 0 && pending.indexOf("]", open) < 0 && pending.length - open < 40 ? open : pending.length;
    const ready = pending.slice(0, holdFrom);
    pending = pending.slice(holdFrom);
    if (ready) yield { type: "delta", text: rewrite(ready) };
  }
  if (pending) yield { type: "delta", text: rewrite(pending) };
  yield { type: "citations", citations };
}

function historyMessages(history: ChatMessage[]): Anthropic.MessageParam[] {
  const recent = history.slice(-6);
  const out: Anthropic.MessageParam[] = [];
  for (const m of recent) {
    // Keep strict user/assistant alternation starting with a user turn.
    if (!out.length && m.role !== "user") continue;
    if (out.length && out[out.length - 1].role === m.role) continue;
    out.push({ role: m.role, content: m.content });
  }
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

export function askMeeting(detail: MeetingDetail, question: string, history: ChatMessage[]): AskRun {
  if (!aiAvailable()) return { ai_mode: "demo", stream: demoStream(demoAsk(detail, question)) };
  const { text, refs } = formatTranscript(detail, { withRefs: true });
  const system = askSystem(meetingHeader(detail.meeting, participantList(detail)), text);
  const messages: Anthropic.MessageParam[] = [...historyMessages(history), { role: "user", content: question }];
  return { ai_mode: "live", stream: liveStream(system, messages, refs) };
}

/** Cross-meeting Ask (P3): BM25 retrieval over every meeting, then the same streaming answer. */
export function askAcross(details: MeetingDetail[], question: string, history: ChatMessage[]): AskRun {
  if (!aiAvailable()) return { ai_mode: "demo", stream: demoStream(demoAskAcross(details, question)) };
  const all = details.flatMap((d) => d.segments.map((s) => ({ d, s })));
  const bm = new Bm25(all.map((x) => ({ terms: terms(x.s.text) })));
  const top = bm.top(terms(question), 60).map((h) => all[h.index]);
  // group by meeting, chronological inside each meeting, with one line of context either side
  const byMeeting = new Map<string, { d: MeetingDetail; idx: Set<number> }>();
  for (const x of top) {
    const e = byMeeting.get(x.d.meeting.id) ?? { d: x.d, idx: new Set<number>() };
    const i = x.d.segments.indexOf(x.s);
    for (const k of [i - 1, i, i + 1]) if (k >= 0 && k < x.d.segments.length) e.idx.add(k);
    byMeeting.set(x.d.meeting.id, e);
  }
  const refs: TranscriptSegment[] = [];
  const blocks: string[] = [];
  for (const { d, idx } of byMeeting.values()) {
    const people = speakerMap(d.participants);
    const lines = [...idx]
      .sort((a, b) => a - b)
      .map((k) => {
        const s = d.segments[k];
        refs.push(s);
        return `#${refs.length - 1} [${fmtTs(s.start_ms)}] ${speakerName(s, people)}: ${s.text}`;
      });
    const date = d.meeting.recording_start ? new Date(d.meeting.recording_start).toUTCString().slice(0, 16) : "";
    blocks.push(`=== ${d.meeting.title} (${date}) ===\n${lines.join("\n")}`);
  }
  const system = askSystem(`You have excerpts from ${byMeeting.size} of the user's ${details.length} meetings.`, blocks.join("\n\n") || "(no matching excerpts)", true);
  const messages: Anthropic.MessageParam[] = [...historyMessages(history), { role: "user", content: question }];
  return { ai_mode: "live", stream: liveStream(system, messages, refs) };
}
