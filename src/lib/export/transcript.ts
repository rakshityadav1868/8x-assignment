/** Transcript exporters (Phase 5 D). Pure + isomorphic. Owner: backend. */
import type { MeetingDetail } from "@/lib/types";

type TranscriptInput = Pick<MeetingDetail, "meeting" | "participants" | "segments">;

/** "[00:01:23] Speaker Name: text" per segment, with a title/date header. */
export function transcriptToTxt(detail: TranscriptInput): string {
  void detail;
  throw new Error("TODO");
}

/** SubRip: numbered cues, "HH:MM:SS,mmm --> HH:MM:SS,mmm", "Speaker: text". */
export function transcriptToSrt(detail: TranscriptInput): string {
  void detail;
  throw new Error("TODO");
}

/** WebVTT: "WEBVTT" header, "HH:MM:SS.mmm --> …", `<v Speaker>text` voice tags. */
export function transcriptToVtt(detail: TranscriptInput): string {
  void detail;
  throw new Error("TODO");
}

/** Markdown: "# Title", metadata, then "**Speaker** [mm:ss](callUrl?t=sec)  \ntext" blocks (consecutive same-speaker merged). */
export function transcriptToMarkdown(detail: TranscriptInput, callUrl?: string): string {
  void detail;
  void callUrl;
  throw new Error("TODO");
}

/** ms → "HH:MM:SS,mmm" (sep ",") or "HH:MM:SS.mmm" (sep "."). */
export function formatCueTime(ms: number, sep: "," | "."): string {
  void ms;
  void sep;
  throw new Error("TODO");
}
