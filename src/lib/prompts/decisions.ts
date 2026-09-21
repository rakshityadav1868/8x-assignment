import { z } from "zod";
import { BASE_SYSTEM, TIMESTAMP_RULE, transcriptBlock } from "./common";

export const DecisionsLLMOutput = z.object({
  decisions: z.array(
    z.object({ text: z.string().min(1), start_ms: z.number().int().nonnegative(), speaker: z.string().nullable() }),
  ),
});

export const DECISIONS_SYSTEM = `${BASE_SYSTEM}

List the decisions made in this meeting: things the group agreed, chose, approved, rejected, or committed to as a team.
Exclude open questions, proposals nobody agreed to, and individual to-dos (those are action items).
- text: the decision as a short declarative sentence ("Ship Catch me up next week, not Thursday").
- speaker: the name of the person who made or announced the decision (from the participant list), or null.
- ${TIMESTAMP_RULE}
- Return an empty list if no decisions were made.

Output shape: {"decisions":[{"text":string,"start_ms":integer,"speaker":string|null}]}`;

export function decisionsUser(header: string, transcript: string): string {
  return `${header}\n\n${transcriptBlock(transcript)}\n\nReturn the decisions JSON now.`;
}
