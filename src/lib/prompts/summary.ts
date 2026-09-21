import { TEMPLATE_BY_KEY } from "@/lib/templates";
import type { SummaryLanguage, SummaryTemplateKey } from "@/lib/types";
import { BASE_SYSTEM, TIMESTAMP_RULE, languageRule, transcriptBlock } from "./common";

/**
 * One prompt per summary template: what each section should capture.
 * Section headings themselves come from `SUMMARY_TEMPLATES` (src/lib/templates.ts) so UI and prompt never drift.
 */
export const TEMPLATE_PROMPTS: Record<SummaryTemplateKey, string> = {
  general: `A balanced recap for anyone who missed the meeting.
- Meeting purpose: one or two bullets on why the meeting happened.
- Topics discussed: one bullet per substantive topic, in the order discussed, with the gist of what was said.
- Key takeaways: conclusions, agreements, notable numbers and open questions.
- Next steps: concrete follow-ups with owner names (and dates if said).`,
  sales: `A discovery / sales call recap for an account executive and their manager.
- Prospect background: company, team, role of each prospect attendee, relevant context.
- Pain points: the problems in the prospect's own words, with their impact.
- Current solution: tools/process they use today and why it falls short.
- Objections & concerns: every hesitation, risk, or blocker raised.
- Pricing & budget: any figures, budget ownership, procurement signals. Say "Not discussed" if absent.
- Next steps: agreed follow-ups with owners and dates.`,
  sales_bant: `Qualify the deal with BANT. For each section write what was learned, quoting numbers and names; if not discussed, a single bullet "Not discussed — ask about <x> next call".
- Budget: amount, who owns it, timing of spend.
- Authority: decision maker(s), influencers, approval steps.
- Need: the business problem and its severity.
- Timeline: deadlines, events driving urgency, target dates.
- Next steps: follow-ups with owners.`,
  sales_meddpicc: `Qualify the deal with MEDDPICC. For each section capture evidence from the call; if missing, one bullet "Unknown — <what to find out>".
- Metrics: quantified business impact the buyer cares about.
- Economic buyer: who controls budget and whether we have access.
- Decision criteria: technical/business criteria for choosing a vendor.
- Decision process: steps and people involved in deciding.
- Paper process: legal, security, procurement steps.
- Identify pain: the core pain and its consequence.
- Champion: who is selling internally for us and evidence of it.
- Competition: alternatives considered (including doing nothing).
- Next steps: follow-ups with owners.`,
  sales_spiced: `Qualify the deal with SPICED; if a section wasn't covered, one bullet "Not covered — <what to ask>".
- Situation: the customer's current context and facts.
- Pain: the problems they described.
- Impact: the business impact (quantified where possible).
- Critical event: the date/event creating urgency.
- Decision: how and by whom the decision gets made.
- Next steps: follow-ups with owners.`,
  qa: `Capture every question asked in the meeting.
- Questions & answers: each bullet "Q: <question> — A: <answer summary> (answered by <name>)".
- Open questions: questions that were not answered or were deferred.
- Next steps: follow-ups, especially promised answers.`,
  standup: `A stand-up recap organised by person. Prefix bullets with the person's name ("Name: ...").
- Completed: what each person finished since last time.
- In progress / today: what each person is working on now.
- Blockers: anything blocking progress and who can unblock it.
- Next steps: follow-ups agreed during the stand-up.`,
  one_on_one: `A 1:1 recap between a manager and a report.
- Updates & wins: accomplishments and good news.
- Challenges: difficulties, frustrations, concerns raised.
- Feedback: feedback given in either direction.
- Career & growth: goals, development, promotion or learning topics.
- Next steps: commitments made by either person.`,
  project_update: `A project/planning update for stakeholders.
- Status overview: overall status and headline (on track / at risk / off track) with evidence.
- Progress since last update: what shipped or advanced.
- Risks & blockers: risks, dependencies, blockers with owners.
- Decisions made: every decision taken, who made it.
- Next steps: follow-ups with owners and dates.`,
  customer_success: `A customer success / account review recap.
- Account health: overall sentiment, usage/adoption signals, satisfaction.
- Customer goals: what the customer wants to achieve.
- Feedback & issues: product feedback, bugs, support issues.
- Expansion opportunities: upsell/cross-sell signals, new teams or use cases.
- Risks: churn risk, escalations, competitor mentions.
- Next steps: follow-ups with owners.`,
  interview: `A hiring interview debrief for the hiring team. Be fair and evidence-based; avoid judgements about protected characteristics.
- Candidate background: experience and relevant history.
- Key strengths: demonstrated strengths with evidence.
- Concerns: gaps or risks with evidence.
- Questions asked by candidate: what the candidate asked.
- Recommendation & next steps: the interviewer's stated view (if any) and next steps in the process.`,
};

export function summarySystem(
  template: SummaryTemplateKey,
  language: SummaryLanguage,
  customInstructions?: string | null,
): string {
  const t = TEMPLATE_BY_KEY[template];
  return `${BASE_SYSTEM}

You are writing the "${t.name}" summary template.
${TEMPLATE_PROMPTS[template]}

Output shape: {"sections":[{"heading":string,"bullets":[{"text":string,"start_ms":integer}]}]}
- Produce exactly these sections, in this order, with these exact headings: ${t.sections.map((s) => `"${s}"`).join(", ")}.
- 1–6 bullets per section; each bullet one or two sentences, no leading dash, no markdown.
- ${TIMESTAMP_RULE}
- ${languageRule(language)}${
    customInstructions?.trim()
      ? `\n\nThe user added custom instructions. Follow them as long as they don't conflict with the output shape:\n"""${customInstructions.trim()}"""`
      : ""
  }`;
}

export function summaryUser(header: string, transcript: string): string {
  return `${header}\n\n${transcriptBlock(transcript)}\n\nWrite the summary JSON now.`;
}

/** Map step for long meetings: notes for one chapter, same template headings. */
export function summaryMapSystem(template: SummaryTemplateKey, customInstructions?: string | null): string {
  const t = TEMPLATE_BY_KEY[template];
  return `${BASE_SYSTEM}

You are taking detailed notes on ONE PART of a longer meeting; another step will merge all parts.
Relevant headings (use only those with real content from this part): ${t.sections.map((s) => `"${s}"`).join(", ")}.
${TEMPLATE_PROMPTS[template]}

Output shape: {"sections":[{"heading":string,"bullets":[{"text":string,"start_ms":integer}]}]}
- Be thorough: capture every concrete fact, number, owner and commitment in this part.
- ${TIMESTAMP_RULE}
- Write in English.${customInstructions?.trim() ? `\nUser's custom instructions (for context): """${customInstructions.trim()}"""` : ""}`;
}

export function summaryMapUser(header: string, partTitle: string | null, transcript: string): string {
  return `${header}\n\nPart: ${partTitle ?? "(untitled segment)"}\n\n${transcriptBlock(transcript)}\n\nWrite the notes JSON for this part.`;
}

/** Reduce step: merge per-chapter notes into the final template. */
export function summaryReduceUser(header: string, partNotes: string): string {
  return `${header}

Below are timestamped notes taken from each part of the meeting, in order. Merge them into the final summary:
deduplicate, keep the most important points, and keep each bullet's start_ms from the note it came from.

<part_notes>
${partNotes}
</part_notes>

Write the final summary JSON now.`;
}
