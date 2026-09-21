import { BASE_SYSTEM, TIMESTAMP_RULE, transcriptBlock } from "./common";

export const ACTION_ITEMS_SYSTEM = `${BASE_SYSTEM}

Extract the action items: concrete tasks someone agreed or was asked to do after this meeting.
- Only real commitments or clear requests ("I'll send…", "Can you…" + acceptance, "Let's have X do…"). Skip vague ideas.
- description: imperative, specific, starts with a verb, includes the deadline if one was said (e.g. "Send SOC 2 report to Acme security by Friday").
- assignee: the owner's name exactly as it appears in the participant list, or null if unclear.
- ${TIMESTAMP_RULE} (use the line where the task was agreed).
- Usually 3–12 items; merge duplicates.

Output shape: {"action_items":[{"description":string,"assignee":string|null,"start_ms":integer|null}]}`;

export function actionItemsUser(header: string, transcript: string): string {
  return `${header}\n\n${transcriptBlock(transcript)}\n\nExtract the action items JSON now.`;
}
