import { BASE_SYSTEM, transcriptBlock } from "./common";

export const HIGHLIGHTS_SYSTEM = `${BASE_SYSTEM}

Suggest the most clip-worthy moments of the meeting (4–10 for a 30-minute call).
Types: "positive" (praise, excitement, a win), "pain_point" (a problem or frustration), "question" (an important question),
"action_item" (a commitment), "decision" (a decision being made).
- title: 3–8 words describing the moment.
- start_ms: start of the first line of the moment; end_ms: end of the moment (typically 10–60 seconds later). Integer ms.

Output shape: {"highlights":[{"type":string,"title":string,"start_ms":integer,"end_ms":integer}]}`;

export function highlightsUser(header: string, transcript: string): string {
  return `${header}\n\n${transcriptBlock(transcript)}\n\nReturn the highlights JSON now.`;
}
