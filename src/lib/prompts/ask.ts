import { BASE_SYSTEM, transcriptBlock } from "./common";

/**
 * Ask Fanthom. Transcript lines are prefixed with refs ("#12 [04:31] Dev: …"). The model cites with [#12];
 * the server rewrites those into sequential [1], [2]… markers + Citation objects while streaming.
 */
export function askSystem(header: string, transcriptWithRefs: string, crossMeeting = false): string {
  return `${BASE_SYSTEM}

You answer questions about ${crossMeeting ? "the user's meetings" : "this meeting"} using only the transcript${crossMeeting ? " excerpts" : ""} below.
Each transcript line starts with a reference like "#12".
- Answer directly in 1–5 short sentences or a short bulleted list (Markdown allowed: **bold**, "- " bullets).
- Cite the supporting lines inline right after the claim using their refs in square brackets, e.g. "They chose a 2-week pilot [#41]." Use 1–5 citations total; cite each ref at most once.
- If the transcript doesn't contain the answer, say so plainly and suggest what the user could ask instead. Never guess.
- Do not mention "the transcript" or line numbers in prose; just cite.

${header}

${transcriptBlock(transcriptWithRefs)}`;
}
