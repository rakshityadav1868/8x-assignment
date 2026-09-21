import "server-only";
import {
  ActionItemsLLMOutput,
  ChaptersLLMOutput,
  FollowUpEmailSchema,
  HighlightsLLMOutput,
  MeetingTypeLLMOutput,
  SummaryLLMOutput,
} from "@/lib/contracts";
import { aiAvailable } from "@/lib/capabilities";
import { generateJSON } from "@/lib/llm";
import { ACTION_ITEMS_SYSTEM, actionItemsUser } from "@/lib/prompts/action-items";
import { CATCH_UP_SYSTEM, CatchUpLLMOutput, catchUpUser } from "@/lib/prompts/catch-up";
import { CHAPTERS_SYSTEM, chaptersUser } from "@/lib/prompts/chapters";
import { CommitmentsLLMOutput, commitmentsSystem, commitmentsUser } from "@/lib/prompts/commitments";
import { meetingHeader } from "@/lib/prompts/common";
import { DECISIONS_SYSTEM, DecisionsLLMOutput, decisionsUser } from "@/lib/prompts/decisions";
import { followUpSystem, followUpUser, type EmailTone } from "@/lib/prompts/follow-up-email";
import { HIGHLIGHTS_SYSTEM, highlightsUser } from "@/lib/prompts/highlights";
import { MEETING_TYPE_SYSTEM, meetingTypeUser } from "@/lib/prompts/meeting-type";
import {
  summaryMapSystem,
  summaryMapUser,
  summaryReduceUser,
  summarySystem,
  summaryUser,
} from "@/lib/prompts/summary";
import { TEMPLATE_BY_KEY } from "@/lib/templates";
import type {
  AiMode,
  CatchUpBullet,
  Commitment,
  Decision,
  FollowUpEmail,
  HighlightType,
  MeetingDetail,
  MeetingType,
  SummaryLanguage,
  SummarySection,
  SummaryTemplateKey,
} from "@/lib/types";
import * as demo from "./demo";
import {
  LONG_MEETING_MS,
  chunkForMapReduce,
  fmtTs,
  formatTranscript,
  matchParticipant,
  meetingEndMs,
  participantList,
  snapToSegment,
} from "./transcript";

export interface AiResult<T> {
  value: T;
  ai_mode: AiMode;
}

/**
 * Run the live Claude implementation when a key is configured; otherwise (or if Claude fails) the
 * deterministic demo fallback. Failures are logged; the response honestly reports `ai_mode: "demo"`.
 */
async function liveOrDemo<T>(label: string, live: () => Promise<T>, fallback: () => T): Promise<AiResult<T>> {
  if (aiAvailable()) {
    try {
      return { value: await live(), ai_mode: "live" };
    } catch (err) {
      console.error(`[ai] ${label} failed, using demo fallback`, err);
    }
  }
  return { value: fallback(), ai_mode: "demo" };
}

const header = (d: MeetingDetail) => meetingHeader(d.meeting, participantList(d));

function snapSections(sections: SummarySection[], d: MeetingDetail): SummarySection[] {
  return sections.map((s) => ({
    heading: s.heading,
    bullets: s.bullets.map((b) => ({ text: b.text.replace(/^[-•*]\s+/, ""), start_ms: snapToSegment(b.start_ms, d.segments) })),
  }));
}

export function sectionsToMarkdown(sections: SummarySection[]): string {
  return sections
    .map(
      (s) =>
        `## ${s.heading}\n${s.bullets.map((b) => `- ${b.text} ([${fmtTs(b.start_ms)}](#t=${Math.floor(b.start_ms / 1000)}))`).join("\n")}`,
    )
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function liveSummary(
  d: MeetingDetail,
  template: SummaryTemplateKey,
  language: SummaryLanguage,
  custom: string | null,
): Promise<SummarySection[]> {
  const system = summarySystem(template, language, custom);
  if (meetingEndMs(d) <= LONG_MEETING_MS) {
    const { text } = formatTranscript(d);
    const out = await generateJSON(SummaryLLMOutput, system, summaryUser(header(d), text), { maxTokens: 4096 });
    return snapSections(out.sections, d);
  }
  // Map-reduce by chapter for long meetings.
  const parts = chunkForMapReduce(d);
  const mapped = await Promise.all(
    parts.map(async (p) => {
      const { text } = formatTranscript(d, { from_ms: p.from_ms, to_ms: p.to_ms });
      if (!text) return null;
      const out = await generateJSON(SummaryLLMOutput, summaryMapSystem(template, custom), summaryMapUser(header(d), p.title, text), {
        maxTokens: 3000,
      });
      return { p, sections: out.sections };
    }),
  );
  const notes = mapped
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map(
      (x) =>
        `### ${x.p.title ?? `Part starting ${fmtTs(x.p.from_ms)}`} (${fmtTs(x.p.from_ms)})\n` +
        x.sections.map((s) => `${s.heading}:\n${s.bullets.map((b) => `- [start_ms=${b.start_ms}] ${b.text}`).join("\n")}`).join("\n"),
    )
    .join("\n\n");
  const out = await generateJSON(SummaryLLMOutput, system, summaryReduceUser(header(d), notes), { maxTokens: 4096 });
  return snapSections(out.sections, d);
}

/** Returns template-shaped sections (not yet saved). */
export async function generateSummary(
  d: MeetingDetail,
  template: SummaryTemplateKey,
  language: SummaryLanguage,
  custom: string | null,
): Promise<AiResult<{ sections: SummarySection[]; language: SummaryLanguage }>> {
  const r = await liveOrDemo(
    "summary",
    async () => ({ sections: await liveSummary(d, template, language, custom), language }),
    // Demo mode can't translate: extractive summaries are always English (UI sees language "en").
    () => ({ sections: demo.demoSummary(d, template, custom), language: "en" as SummaryLanguage }),
  );
  // Ensure headings follow the template order even if the model reorders them (extra sections kept at the end).
  if (r.ai_mode === "live") {
    const order = TEMPLATE_BY_KEY[template].sections.map((s) => s.toLowerCase());
    r.value.sections.sort((a, b) => {
      const ia = order.indexOf(a.heading.toLowerCase());
      const ib = order.indexOf(b.heading.toLowerCase());
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Catch-up, follow-up email, decisions, commitments
// ---------------------------------------------------------------------------

export async function catchUp(d: MeetingDetail, fromMs: number, toMs: number): Promise<AiResult<CatchUpBullet[]>> {
  return liveOrDemo(
    "catch-up",
    async () => {
      const { text } = formatTranscript(d, { from_ms: fromMs, to_ms: toMs });
      if (!text) return [];
      const earlier = d.chapters
        .filter((c) => c.start_ms < fromMs)
        .map((c) => `- ${c.title}${c.summary ? `: ${c.summary}` : ""}`)
        .join("\n");
      const out = await generateJSON(CatchUpLLMOutput, CATCH_UP_SYSTEM, catchUpUser(header(d), fromMs, toMs, text, earlier), {
        maxTokens: 2000,
      });
      return out.bullets.map((b) => ({ text: b.text, start_ms: Math.max(snapToSegment(b.start_ms, d.segments), 0) }));
    },
    () => demo.demoCatchUp(d, fromMs, toMs),
  );
}

export async function followUpEmail(d: MeetingDetail, tone: EmailTone, recipientId: string | null): Promise<AiResult<FollowUpEmail>> {
  return liveOrDemo(
    "follow-up email",
    async () => {
      const people = new Map(d.participants.map((p) => [p.id, p.name]));
      const summary = d.summaries.find((s) => s.language === "en" && !s.custom_instructions) ?? d.summaries[0];
      const summaryText = summary ? summary.sections.map((s) => `${s.heading}:\n${s.bullets.map((b) => `- ${b.text}`).join("\n")}`).join("\n") : "";
      const actionItemsText = d.action_items
        .map((a) => `- ${a.description}${a.assignee_participant_id ? ` (owner: ${people.get(a.assignee_participant_id) ?? "?"})` : ""}`)
        .join("\n");
      const { text } = formatTranscript(d);
      const recipient = recipientId ? (people.get(recipientId) ?? null) : null;
      return generateJSON(
        FollowUpEmailSchema,
        followUpSystem(tone),
        followUpUser({
          header: header(d),
          sender: d.meeting.recorded_by ?? d.participants.find((p) => !p.is_external)?.name ?? "the organiser",
          recipient,
          summaryText,
          actionItemsText,
          // The email is built mostly from notes; cap the raw transcript to keep it fast.
          transcript: text.length > 60_000 ? text.slice(0, 60_000) + "\n[…]" : text,
        }),
        { maxTokens: 2000 },
      );
    },
    () => demo.demoFollowUpEmail(d, tone, recipientId),
  );
}

export async function extractDecisions(d: MeetingDetail): Promise<AiResult<Decision[]>> {
  return liveOrDemo(
    "decisions",
    async () => {
      const { text } = formatTranscript(d);
      const out = await generateJSON(DecisionsLLMOutput, DECISIONS_SYSTEM, decisionsUser(header(d), text), { maxTokens: 2000 });
      return out.decisions.map((x) => ({
        text: x.text,
        start_ms: snapToSegment(x.start_ms, d.segments),
        participant_id: matchParticipant(x.speaker, d.participants),
      }));
    },
    () => demo.demoDecisions(d),
  );
}

export async function commitments(d: MeetingDetail, participantId: string): Promise<AiResult<Commitment[]>> {
  const person = d.participants.find((p) => p.id === participantId);
  return liveOrDemo(
    "commitments",
    async () => {
      const { text } = formatTranscript(d);
      const out = await generateJSON(CommitmentsLLMOutput, commitmentsSystem(person?.name ?? "this person"), commitmentsUser(header(d), text), {
        maxTokens: 2000,
      });
      return out.commitments.map((c) => ({
        text: c.text,
        start_ms: snapToSegment(c.start_ms, d.segments),
        participant_id: participantId,
        due: c.due,
      }));
    },
    () => demo.demoCommitments(d, participantId),
  );
}

// ---------------------------------------------------------------------------
// Pipeline jobs (upload → ready)
// ---------------------------------------------------------------------------

export async function detectMeetingType(d: MeetingDetail): Promise<AiResult<{ meeting_type: MeetingType; title?: string }>> {
  return liveOrDemo(
    "meeting type",
    async () => {
      // The first ~10 minutes are plenty to classify.
      const { text } = formatTranscript(d, { to_ms: 10 * 60_000 });
      return generateJSON(MeetingTypeLLMOutput, MEETING_TYPE_SYSTEM, meetingTypeUser(text, participantList(d)), { maxTokens: 300 });
    },
    () => ({ meeting_type: demo.demoMeetingType(d) }),
  );
}

export async function extractActionItems(d: MeetingDetail) {
  return liveOrDemo(
    "action items",
    async () => {
      const { text } = formatTranscript(d);
      const out = await generateJSON(ActionItemsLLMOutput, ACTION_ITEMS_SYSTEM, actionItemsUser(header(d), text), { maxTokens: 3000 });
      return out.action_items.map((a) => ({
        description: a.description,
        assignee_participant_id: matchParticipant(a.assignee, d.participants),
        timestamp_ms: a.start_ms == null ? null : snapToSegment(a.start_ms, d.segments),
        completed: false,
        user_generated: false,
      }));
    },
    () => demo.demoActionItems(d),
  );
}

export async function extractChapters(d: MeetingDetail) {
  const end = meetingEndMs(d);
  return liveOrDemo(
    "chapters",
    async () => {
      const { text } = formatTranscript(d);
      const out = await generateJSON(ChaptersLLMOutput, CHAPTERS_SYSTEM, chaptersUser(header(d), text, end), { maxTokens: 3000 });
      const starts = out.chapters
        .map((c) => ({ ...c, start_ms: snapToSegment(c.start_ms, d.segments) }))
        .sort((a, b) => a.start_ms - b.start_ms)
        .filter((c, i, arr) => i === 0 || c.start_ms > arr[i - 1].start_ms);
      if (starts.length) starts[0].start_ms = 0;
      return starts.map((c, i) => ({
        title: c.title,
        start_ms: c.start_ms,
        end_ms: starts[i + 1]?.start_ms ?? end,
        summary: c.summary || null,
      }));
    },
    () => demo.demoChapters(d),
  );
}

export async function suggestHighlights(d: MeetingDetail) {
  return liveOrDemo(
    "highlights",
    async () => {
      const { text } = formatTranscript(d);
      const out = await generateJSON(HighlightsLLMOutput, HIGHLIGHTS_SYSTEM, highlightsUser(header(d), text), { maxTokens: 2000 });
      return out.highlights.map((h) => {
        const start = snapToSegment(h.start_ms, d.segments);
        return { type: h.type as HighlightType, title: h.title, start_ms: start, end_ms: Math.max(h.end_ms, start + 5000) };
      });
    },
    () => demo.demoHighlights(d),
  );
}
