/**
 * Fanthom shared domain types — THE contract between database, backend and frontend.
 *
 * Conventions (read before changing anything):
 * - Field names are snake_case and mirror the Postgres columns 1:1, so rows from
 *   Supabase can be returned without mapping. JSON over the wire uses the same names.
 * - All media offsets are integer milliseconds (`*_ms`). Durations of whole meetings are `duration_sec`.
 * - Timestamps (wall clock) are ISO-8601 strings.
 * - IDs are uuid strings. Share tokens are url-safe random strings.
 * - Change additively only; document changes in ARCHITECTURE.md ("Contract changelog").
 *
 * Runtime enum values are exported as `as const` arrays so zod schemas in
 * `contracts.ts` can be built from the same source of truth.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const MEETING_TYPES = [
  "sales",
  "customer_success",
  "standup",
  "one_on_one",
  "interview",
  "project_update",
  "planning",
  "qa",
  "general",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const SUMMARY_TEMPLATE_KEYS = [
  "general",
  "sales",
  "sales_bant",
  "sales_meddpicc",
  "sales_spiced",
  "qa",
  "standup",
  "one_on_one",
  "project_update",
  "customer_success",
  "interview",
] as const;
export type SummaryTemplateKey = (typeof SUMMARY_TEMPLATE_KEYS)[number];

export const SUMMARY_LANGUAGES = ["en", "es", "fr", "de", "pt", "it", "ja", "hi"] as const;
export type SummaryLanguage = (typeof SUMMARY_LANGUAGES)[number];

export const HIGHLIGHT_TYPES = ["positive", "pain_point", "question", "action_item", "decision"] as const;
export type HighlightType = (typeof HIGHLIGHT_TYPES)[number];

/** Coarse status stored on `meetings.status`. */
export const MEETING_STATUSES = ["processing", "ready", "failed"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** Fine-grained pipeline stage stored on `meetings.processing_stage` (drives the upload progress UI). */
export const PROCESSING_STAGES = [
  "awaiting_upload",
  "queued",
  "transcribing",
  "analyzing", // parallel LLM jobs: summary, action items, chapters, highlights, meeting type
  "ready",
  "failed",
] as const;
export type ProcessingStage = (typeof PROCESSING_STAGES)[number];

export const MEDIA_KINDS = ["video", "audio"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const SHARE_ACCESS = ["anyone_with_link", "same_domain", "invited"] as const;
export type ShareAccess = (typeof SHARE_ACCESS)[number];

export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

// ---------------------------------------------------------------------------
// Core entities (1:1 with tables)
// ---------------------------------------------------------------------------

export interface Workspace {
  id: string;
  name: string;
  domain: string; // e.g. "fanthom.dev" — used for `same_domain` share access and is_external
}

export interface User {
  id: string;
  workspace_id: string;
  name: string;
  email: string;
}

export interface Meeting {
  id: string;
  workspace_id: string;
  title: string;
  meeting_type: MeetingType;
  scheduled_start: string | null;
  scheduled_end: string | null;
  recording_start: string | null;
  recording_end: string | null;
  duration_sec: number;
  media_url: string | null; // public or signed URL playable by <video>/<audio>
  media_kind: MediaKind;
  status: MeetingStatus;
  processing_stage: ProcessingStage;
  processing_error: string | null;
  transcript_language: string; // BCP-47-ish, e.g. "en"
  share_token: string | null;
  share_access: ShareAccess;
  recorded_by: string | null; // display name of the recorder (demo user)
  synthetic: boolean; // true when the media is a synthetic/placeholder asset (seed data)
  created_at: string;
}

export interface Participant {
  id: string;
  meeting_id: string;
  name: string;
  email: string | null;
  is_external: boolean;
  color: string; // hex, stable per participant, used for avatars + speaker timeline
}

export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  participant_id: string | null; // null = unknown speaker
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface SummaryBullet {
  text: string;
  start_ms: number; // every bullet links to a transcript moment
}

export interface SummarySection {
  heading: string; // e.g. "Topics discussed", "Key takeaways", "Next steps"
  bullets: SummaryBullet[];
}

export interface Summary {
  id: string;
  meeting_id: string;
  template: SummaryTemplateKey;
  language: SummaryLanguage;
  markdown: string; // rendered markdown (for copy/export); `sections` is the structured source of truth for the UI
  sections: SummarySection[];
  custom_instructions: string | null;
  created_at: string;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  description: string;
  assignee_participant_id: string | null;
  timestamp_ms: number | null;
  completed: boolean;
  user_generated: boolean;
  created_at: string;
}

export interface Highlight {
  id: string;
  meeting_id: string;
  start_ms: number;
  end_ms: number;
  type: HighlightType;
  title: string;
  note: string | null;
  share_token: string; // every highlight is a clip with its own /clip/[token] link
  user_generated: boolean; // false = AI-suggested during processing
  created_at: string;
}

export interface Chapter {
  id: string;
  meeting_id: string;
  title: string;
  start_ms: number;
  end_ms: number;
  summary: string | null;
}

export interface Playlist {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  meeting_id: string | null;
  highlight_id: string | null;
  position: number;
}

export interface SummaryTemplateRow {
  key: SummaryTemplateKey;
  name: string;
  prompt: string;
}

export interface Citation {
  /** 1-based index; assistant text references it inline as `[n]`. */
  index: number;
  segment_id: string;
  meeting_id: string;
  start_ms: number;
  /** Short quote of the cited segment, for hover previews. */
  quote?: string;
}

export interface ChatMessage {
  id: string;
  meeting_id: string | null; // null = cross-meeting Ask (P3)
  role: ChatRole;
  content: string;
  citations: Citation[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Derived / aggregate shapes
// ---------------------------------------------------------------------------

/** Minimal participant shape used in lists and upcoming meetings. */
export interface Attendee {
  name: string;
  email: string | null;
  is_external: boolean;
}

/** Row on Home "My Calls". */
export interface MeetingListItem
  extends Pick<
    Meeting,
    | "id"
    | "title"
    | "meeting_type"
    | "recording_start"
    | "scheduled_start"
    | "duration_sec"
    | "status"
    | "processing_stage"
    | "media_kind"
    | "synthetic"
    | "created_at"
  > {
  participants: Pick<Participant, "id" | "name" | "email" | "is_external" | "color">[];
  action_item_count: number;
  highlight_count: number;
}

/** Seeded "upcoming meetings" strip (calendar OAuth is stubbed). */
export interface UpcomingMeeting {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: Attendee[];
  meeting_type: MeetingType;
}

/** Everything the call page (/calls/[id]) and share page (/share/[token]) need in one fetch. */
export interface MeetingDetail {
  meeting: Meeting;
  participants: Participant[];
  segments: TranscriptSegment[]; // ordered by start_ms
  summaries: Summary[]; // all cached summaries (template × language); newest first
  action_items: ActionItem[];
  highlights: Highlight[]; // ordered by start_ms
  chapters: Chapter[]; // ordered by start_ms
}

/** Public-safe clip payload for /clip/[token]. */
export interface ClipDetail {
  highlight: Highlight;
  meeting: Pick<Meeting, "id" | "title" | "media_url" | "media_kind" | "recording_start" | "duration_sec">;
  participants: Participant[];
  segments: TranscriptSegment[]; // only the segments overlapping [start_ms, end_ms]
}

export interface ProcessingStatus {
  meeting_id: string;
  status: MeetingStatus;
  stage: ProcessingStage;
  progress: number; // 0..100, best effort
  error: string | null;
}

export interface SearchHit {
  meeting_id: string;
  meeting_title: string;
  meeting_date: string | null; // recording_start ?? scheduled_start
  meeting_type: MeetingType;
  segment_id: string;
  participant_id: string | null;
  speaker_name: string;
  speaker_color: string | null;
  /**
   * HTML-escaped snippet in which ONLY `<mark>…</mark>` tags are raw HTML
   * (ts_headline StartSel/StopSel). Safe to render with dangerouslySetInnerHTML.
   */
  snippet: string;
  start_ms: number;
  rank: number;
}

export interface Decision {
  text: string;
  start_ms: number;
  participant_id: string | null; // who made / announced the decision
}

export interface Commitment {
  text: string;
  start_ms: number;
  participant_id: string;
  due: string | null; // free text as spoken, e.g. "by Friday"
}

/** Computed client-side from segments (no API needed). */
export interface SpeakerStat {
  participant_id: string;
  name: string;
  color: string;
  talk_ms: number;
  talk_pct: number; // 0..100
  segment_count: number;
  longest_monologue_ms: number;
}

export interface CatchUpBullet {
  text: string;
  start_ms: number;
}

export interface FollowUpEmail {
  subject: string;
  body_markdown: string;
}
