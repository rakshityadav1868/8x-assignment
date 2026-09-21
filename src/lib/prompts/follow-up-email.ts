import { BASE_SYSTEM, transcriptBlock } from "./common";

export type EmailTone = "friendly" | "formal" | "concise";

const TONES: Record<EmailTone, string> = {
  friendly: "warm and friendly but professional",
  formal: "formal and polished",
  concise: "brief and to the point — short sentences, minimal pleasantries",
};

export function followUpSystem(tone: EmailTone): string {
  return `${BASE_SYSTEM}

Draft the follow-up email the organiser sends after this meeting. Tone: ${TONES[tone]}.
- subject: specific, under 80 characters.
- body_markdown: Markdown email body. Greeting, one-line thanks/context, a short recap of key points,
  a "Next steps" list with owners (and dates if said), and a sign-off with the sender's first name.
  Only include facts from the meeting. No placeholders like [Name] — use real names.

Output shape: {"subject":string,"body_markdown":string}`;
}

export function followUpUser(opts: {
  header: string;
  sender: string;
  recipient: string | null;
  summaryText: string;
  actionItemsText: string;
  transcript: string;
}): string {
  return `${opts.header}

Sender: ${opts.sender}
Recipient: ${opts.recipient ?? "all attendees (greet them as a group, or by first names if there are only a few external attendees)"}

Existing summary notes:
${opts.summaryText || "(none)"}

Action items:
${opts.actionItemsText || "(none)"}

${transcriptBlock(opts.transcript)}

Return the email JSON now.`;
}
