/** Transcript exporters (Phase 5 D). Pure + isomorphic. Owner: backend. */
import type { MeetingDetail, TranscriptSegment } from "@/lib/types";

type TranscriptInput = Pick<MeetingDetail, "meeting" | "participants" | "segments">;

const pad = (n: number, w = 2) => String(Math.max(0, Math.floor(n))).padStart(w, "0");

/** ms → "HH:MM:SS,mmm" (sep ",") or "HH:MM:SS.mmm" (sep "."). */
export function formatCueTime(ms: number, sep: "," | "."): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(t % 1000, 3)}`;
}

/** ms → "HH:MM:SS". */
export function formatHms(ms: number): string {
  return formatCueTime(ms, ".").slice(0, 8);
}

/** ms → "mm:ss" (or "h:mm:ss" past the hour). */
export function formatClockMs(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function meetingDateIso(m: TranscriptInput["meeting"]): string | null {
  return m.recording_start ?? m.scheduled_start ?? m.created_at ?? null;
}

/** "Thu, Oct 2, 2025" style date (UTC, deterministic across server/client). */
export function formatExportDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function speakerOf(detail: TranscriptInput) {
  const names = new Map(detail.participants.map((p) => [p.id, p.name]));
  return (s: TranscriptSegment) => (s.participant_id ? names.get(s.participant_id) : undefined) ?? "Unknown speaker";
}

const ordered = (detail: TranscriptInput) =>
  [...detail.segments].filter((s) => s.text.trim()).sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);

/** Cue text must not contain blank lines (they terminate a cue in SRT/VTT). */
const cueText = (t: string) => t.replace(/\r\n?/g, "\n").replace(/\n\s*\n+/g, "\n").trim();

/** "[00:01:23] Speaker Name: text" per segment, with a title/date header. */
export function transcriptToTxt(detail: TranscriptInput): string {
  const who = speakerOf(detail);
  const date = formatExportDate(meetingDateIso(detail.meeting));
  const header = [detail.meeting.title, date, detail.participants.length ? `Participants: ${detail.participants.map((p) => p.name).join(", ")}` : ""]
    .filter(Boolean)
    .join("\n");
  const lines = ordered(detail).map((s) => `[${formatHms(s.start_ms)}] ${who(s)}: ${s.text.replace(/\s+/g, " ").trim()}`);
  return `${header}\n\n${lines.join("\n")}\n`;
}

/** SubRip: numbered cues, "HH:MM:SS,mmm --> HH:MM:SS,mmm", "Speaker: text". */
export function transcriptToSrt(detail: TranscriptInput): string {
  const who = speakerOf(detail);
  return ordered(detail)
    .map((s, i) => {
      const end = Math.max(s.end_ms, s.start_ms + 1);
      return `${i + 1}\n${formatCueTime(s.start_ms, ",")} --> ${formatCueTime(end, ",")}\n${who(s)}: ${cueText(s.text)}\n`;
    })
    .join("\n");
}

/** Escape text for WebVTT cue payloads / voice annotations. */
const vttEscape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** WebVTT: "WEBVTT" header, "HH:MM:SS.mmm --> …", `<v Speaker>text` voice tags. */
export function transcriptToVtt(detail: TranscriptInput): string {
  const who = speakerOf(detail);
  const cues = ordered(detail).map((s, i) => {
    const end = Math.max(s.end_ms, s.start_ms + 1);
    const voice = vttEscape(who(s)).replace(/\s+/g, " ");
    return `${i + 1}\n${formatCueTime(s.start_ms, ".")} --> ${formatCueTime(end, ".")}\n<v ${voice}>${vttEscape(cueText(s.text))}</v>\n`;
  });
  const title = detail.meeting.title.replace(/-->/g, "→").replace(/\s+/g, " ");
  return `WEBVTT - ${title}\n\n${cues.join("\n")}`;
}

/** Markdown: "# Title", metadata, then "**Speaker** [mm:ss](callUrl?t=sec)  \ntext" blocks (consecutive same-speaker merged). */
export function transcriptToMarkdown(detail: TranscriptInput, callUrl?: string): string {
  const who = speakerOf(detail);
  const date = formatExportDate(meetingDateIso(detail.meeting));
  const out: string[] = [`# ${detail.meeting.title}`, ""];
  if (date) out.push(`- **Date:** ${date}`);
  if (detail.meeting.duration_sec) out.push(`- **Duration:** ${Math.round(detail.meeting.duration_sec / 60)} min`);
  if (detail.participants.length) out.push(`- **Participants:** ${detail.participants.map((p) => p.name).join(", ")}`);
  if (callUrl) out.push(`- **Recording:** ${callUrl}`);
  out.push("", "## Transcript", "");

  let block: { speaker: string | null; start: number; texts: string[] } | null = null;
  const flush = () => {
    if (!block) return;
    const t = formatClockMs(block.start);
    const stamp = callUrl ? `[${t}](${callUrl}?t=${Math.floor(block.start / 1000)})` : `[${t}]`;
    out.push(`**${block.speaker ?? "Unknown speaker"}** ${stamp}  `, block.texts.join(" "), "");
    block = null;
  };
  for (const s of ordered(detail)) {
    const speaker = who(s);
    if (block && block.speaker === speaker) block.texts.push(s.text.trim());
    else {
      flush();
      block = { speaker, start: s.start_ms, texts: [s.text.trim()] };
    }
  }
  flush();
  return out.join("\n");
}
