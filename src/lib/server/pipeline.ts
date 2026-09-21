import "server-only";
import {
  extractActionItems,
  extractChapters,
  extractDecisions,
  detectMeetingType,
  generateSummary,
  sectionsToMarkdown,
  suggestHighlights,
} from "@/lib/ai";
import { getRepo } from "@/lib/db";
import { mapUtterances, transcribeUrl } from "@/lib/deepgram";
import { defaultTemplateFor } from "@/lib/templates";
import type { Meeting, ProcessingStage, ProcessingStatus, SummaryTemplateKey } from "@/lib/types";
import { STORAGE_URL_PREFIX, signedReadUrl } from "./storage";

const STAGE_PROGRESS: Record<ProcessingStage, number> = {
  awaiting_upload: 5,
  queued: 10,
  transcribing: 35,
  analyzing: 70,
  ready: 100,
  failed: 100,
};

export function statusOf(m: Meeting): ProcessingStatus {
  return {
    meeting_id: m.id,
    status: m.status,
    stage: m.processing_stage,
    progress: STAGE_PROGRESS[m.processing_stage] ?? 0,
    error: m.processing_error,
  };
}

export const isRunning = (m: Meeting) => m.processing_stage === "transcribing" || m.processing_stage === "analyzing";

/** Uploads keep the file name (with extension) as a provisional title; the AI suggestion replaces it. */
const PROVISIONAL_TITLE = /\.(mp3|m4a|mp4|wav|webm|mov|ogg|oga|aac|flac|mkv|m4v)$/i;

/**
 * Upload → ready: Deepgram transcription, then parallel LLM jobs (meeting type, action items, chapters,
 * highlights, decisions), then the default-template summary (needs chapters for map-reduce on long calls).
 * Writes `processing_stage` as it goes so GET /status can drive the progress UI.
 */
export async function runPipeline(meetingId: string, opts: { language?: string; origin: string }): Promise<void> {
  const repo = getRepo();
  const stage = (processing_stage: ProcessingStage, extra: Partial<Meeting> = {}) =>
    repo.updateMeeting(meetingId, { processing_stage, ...extra });
  try {
    let meeting = await repo.getMeeting(meetingId);
    if (!meeting) return;
    if (!meeting.media_url) throw new Error("No recording attached to this meeting");

    // 1. Resolve a URL Deepgram can fetch (and the player can play).
    let mediaUrl = meeting.media_url;
    if (mediaUrl.startsWith(STORAGE_URL_PREFIX)) {
      const path = mediaUrl.slice(STORAGE_URL_PREFIX.length).replace(/^[^/]+\//, ""); // strip bucket
      mediaUrl = await signedReadUrl(path);
      meeting = await repo.updateMeeting(meetingId, { media_url: mediaUrl });
    }
    const fetchUrl = mediaUrl.startsWith("/") ? `${opts.origin}${mediaUrl}` : mediaUrl;

    // 2. Transcribe.
    await stage("transcribing");
    const dg = await transcribeUrl(fetchUrl, opts.language);
    if (!dg.utterances.length) throw new Error("No speech was detected in this recording.");
    const { speakers, segments } = mapUtterances(dg.utterances);
    const participants = await repo.replaceParticipants(
      meetingId,
      speakers.map((s) => ({ name: s.name, email: null, is_external: false, color: s.color })),
    );
    const idBySpeaker = new Map(speakers.map((s, i) => [s.key, participants[i]?.id ?? null]));
    await repo.replaceSegments(
      meetingId,
      segments.map((s) => ({ participant_id: idBySpeaker.get(s.speaker) ?? null, start_ms: s.start_ms, end_ms: s.end_ms, text: s.text })),
    );
    const durationSec = Math.round(dg.duration_sec || segments[segments.length - 1].end_ms / 1000);
    const recStart = meeting.recording_start ? new Date(meeting.recording_start) : new Date();
    await stage("analyzing", {
      duration_sec: durationSec,
      transcript_language: (dg.language ?? meeting.transcript_language ?? "en").slice(0, 8),
      recording_end: new Date(recStart.getTime() + durationSec * 1000).toISOString(),
    });

    // 3. Parallel AI jobs.
    let detail = (await repo.getMeetingDetail(meetingId))!;
    const [type, items, chapters, highlights, decisions] = await Promise.allSettled([
      detectMeetingType(detail),
      extractActionItems(detail),
      extractChapters(detail),
      suggestHighlights(detail),
      extractDecisions(detail),
    ]);
    const patch: Partial<Meeting> = {};
    if (type.status === "fulfilled") {
      patch.meeting_type = type.value.value.meeting_type;
      if (type.value.value.title && PROVISIONAL_TITLE.test(meeting.title)) patch.title = type.value.value.title;
    }
    if (Object.keys(patch).length) meeting = await repo.updateMeeting(meetingId, patch);
    if (items.status === "fulfilled") await repo.replaceAiActionItems(meetingId, items.value.value);
    if (chapters.status === "fulfilled" && chapters.value.value.length) await repo.replaceChapters(meetingId, chapters.value.value);
    if (highlights.status === "fulfilled") {
      for (const h of highlights.value.value) {
        await repo.createHighlight(meetingId, { ...h, note: null, user_generated: false });
      }
    }
    if (decisions.status === "fulfilled") await repo.saveDecisions(meetingId, decisions.value.value);
    for (const r of [type, items, chapters, highlights, decisions]) if (r.status === "rejected") console.error("[pipeline] job failed", r.reason);

    // 4. Summaries: default template for the detected type (+ General), cached in the DB.
    detail = (await repo.getMeetingDetail(meetingId))!;
    const templates = Array.from(new Set<SummaryTemplateKey>([defaultTemplateFor(meeting.meeting_type), "general"]));
    await Promise.all(
      templates.map(async (template) => {
        const r = await generateSummary(detail, template, "en", null);
        await repo.saveSummary({
          meeting_id: meetingId,
          template,
          language: r.value.language,
          sections: r.value.sections,
          markdown: sectionsToMarkdown(r.value.sections),
          custom_instructions: null,
        });
      }),
    );

    await stage("ready", { status: "ready", processing_error: null });
  } catch (err) {
    console.error("[pipeline] failed", meetingId, err);
    const message = err instanceof Error ? err.message : "Processing failed";
    await repo.updateMeeting(meetingId, { status: "failed", processing_stage: "failed", processing_error: message }).catch(() => {});
  }
}
