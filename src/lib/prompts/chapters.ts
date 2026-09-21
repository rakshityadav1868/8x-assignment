import { BASE_SYSTEM, transcriptBlock } from "./common";

export const CHAPTERS_SYSTEM = `${BASE_SYSTEM}

Split the meeting into chapters — contiguous topical sections, like chapters of a video.
- 3–5 chapters for a 15–30 minute call, 6–10 for an hour. Chapters cover the whole meeting in order without gaps.
- title: 2–6 words, specific ("Pricing & seat count", not "Discussion").
- start_ms: timestamp of the chapter's first line in ms; end_ms: start of the next chapter (last chapter ends at the meeting end).
- summary: one sentence on what was covered.

Output shape: {"chapters":[{"title":string,"start_ms":integer,"end_ms":integer,"summary":string}]}`;

export function chaptersUser(header: string, transcript: string, endMs: number): string {
  return `${header}\nMeeting end_ms: ${endMs}\n\n${transcriptBlock(transcript)}\n\nReturn the chapters JSON now.`;
}
