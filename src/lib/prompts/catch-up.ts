import { z } from "zod";
import { fmtTs } from "@/lib/ai/transcript";
import { BASE_SYSTEM, TIMESTAMP_RULE, transcriptBlock } from "./common";

export const CatchUpLLMOutput = z.object({
  bullets: z.array(z.object({ text: z.string().min(1), start_ms: z.number().int().nonnegative() })).min(1),
});

export const CATCH_UP_SYSTEM = `${BASE_SYSTEM}

Someone joined late or stepped away. Catch them up on what happened in the given part of the meeting.
- 3–8 bullets in chronological order: what was discussed, decided, and who is doing what. Lead with the most important.
- Each bullet one sentence, specific, with names.
- ${TIMESTAMP_RULE}

Output shape: {"bullets":[{"text":string,"start_ms":integer}]}`;

export function catchUpUser(header: string, fromMs: number, toMs: number, transcript: string, earlierContext: string): string {
  return `${header}

The person needs a catch-up on ${fmtTs(fromMs)}–${fmtTs(toMs)}.
${earlierContext ? `Context from earlier in the meeting (do not summarise this, only use it to understand references):\n${earlierContext}\n` : ""}
${transcriptBlock(transcript)}

Return the catch-up JSON now.`;
}
