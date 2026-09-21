import { z } from "zod";
import { BASE_SYSTEM, TIMESTAMP_RULE, transcriptBlock } from "./common";

export const CommitmentsLLMOutput = z.object({
  commitments: z.array(
    z.object({ text: z.string().min(1), start_ms: z.number().int().nonnegative(), due: z.string().nullable() }),
  ),
});

export function commitmentsSystem(personName: string): string {
  return `${BASE_SYSTEM}

Answer: "What did ${personName} commit to in this meeting?"
List every commitment ${personName} made or accepted: things they said they will do, agreed to own, or promised to deliver.
Include tasks assigned to them that they accepted. Exclude things other people committed to.
- text: the commitment in third person, imperative-style and specific ("Send the pilot user list to Maya").
- due: the deadline as spoken ("by Friday", "next week") or null.
- ${TIMESTAMP_RULE}
- Return an empty list if they made no commitments.

Output shape: {"commitments":[{"text":string,"start_ms":integer,"due":string|null}]}`;
}

export function commitmentsUser(header: string, transcript: string): string {
  return `${header}\n\n${transcriptBlock(transcript)}\n\nReturn the commitments JSON now.`;
}
