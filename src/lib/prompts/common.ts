import { LANGUAGE_LABELS } from "@/lib/templates";
import type { Meeting, SummaryLanguage } from "@/lib/types";
import { fmtTs } from "@/lib/ai/transcript";

/** Shared preamble: who the model is and how to read the transcript. */
export const BASE_SYSTEM = `You are Fanthom, an AI meeting assistant that writes accurate, concise meeting notes.
The transcript is given one utterance per line as "[mm:ss] Speaker: text" (or "[h:mm:ss]" past one hour).
Ground every statement in the transcript. Never invent facts, numbers, names or commitments that were not said.
Refer to people by name. Write crisp, specific notes (numbers, owners, dates) rather than vague generalities.`;

/** Rule for converting a line's timestamp into a start_ms field. */
export const TIMESTAMP_RULE = `Every item carries "start_ms": the timestamp of the transcript line where it is best evidenced,
converted to integer milliseconds ([mm:ss] -> (mm*60 + ss) * 1000; [h:mm:ss] -> (h*3600 + mm*60 + ss) * 1000).`;

export function languageRule(language: SummaryLanguage | string = "en"): string {
  const label = LANGUAGE_LABELS[language as SummaryLanguage] ?? language;
  return language === "en"
    ? "Write in English."
    : `Write all text values in ${label}, even though the transcript may be in another language. Keep JSON keys in English.`;
}

export function meetingHeader(meeting: Pick<Meeting, "title" | "recording_start" | "duration_sec">, participants: string): string {
  const date = meeting.recording_start ? new Date(meeting.recording_start).toUTCString().slice(0, 16) : "unknown date";
  return `Meeting: ${meeting.title}\nDate: ${date}\nDuration: ${fmtTs(meeting.duration_sec * 1000)}\nParticipants:\n${participants}`;
}

export function transcriptBlock(text: string): string {
  return `<transcript>\n${text}\n</transcript>`;
}
