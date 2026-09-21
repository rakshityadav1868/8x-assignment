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

/**
 * Keyless-first: every AI response says whether Claude produced it ("live") or the
 * deterministic local fallback did ("demo" — UI shows a subtle "AI offline – demo mode" badge).
 */
export const AI_MODES = ["live", "demo"] as const;
export type AiMode = (typeof AI_MODES)[number];

/** Which repository implementation is active (UI must not branch on this; informational only). */
export const DATA_MODES = ["supabase", "seed"] as const;
export type DataMode = (typeof DATA_MODES)[number];

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
  /**
   * Playable URL. Seed meetings: "/media/<meeting-slug>.m4a" served from public/media/
   * (synthetic multi-voice audio, exact timestamps). Uploads: Supabase Storage signed/public URL.
   */
  media_url: string | null;
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
  // --- Phase 5 (additive, optional so older rows/seed files stay valid; repos always populate them) ---
  /** Library folder; null/undefined = not in a folder. */
  folder_id?: string | null;
  /** Starred by the current user (single-user demo workspace → stored on the meeting row). */
  starred?: boolean;
  /** Soft delete (trash). Non-null rows are hidden from lists unless `include_deleted`. */
  deleted_at?: string | null;
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
  // --- Phase 5 (additive, optional; repos populate them) ---
  folder_id?: string | null;
  starred?: boolean;
  deleted_at?: string | null;
  recorded_by?: string | null;
  /** Which library tab the meeting belongs to for the current user. */
  scope?: ShareScope;
  /** Derived: primary external company (most frequent external email domain), null for internal calls. */
  company_domain?: string | null;
  company_name?: string | null;
  comment_count?: number;
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
  /** Cached AI decisions (additive, optional). Seed files always carry it; absent/undefined = never generated. */
  decisions?: Decision[];
  /**
   * Phase 5 (additive, optional): template of the summary the call page should open with — the user's
   * prefs.default_template when cached for this meeting, else the meeting type's default, else General / newest.
   * Set by GET /api/meetings/:id and GET /api/share/:token (server-side `chooseSummary`).
   */
  default_summary_template?: SummaryTemplateKey | null;
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

/** GET /api/capabilities — lets the UI show demo badges / explain disabled upload. */
export interface Capabilities {
  ai_mode: AiMode; // "live" iff ANTHROPIC_API_KEY is set
  transcription: boolean; // true iff DEEPGRAM_API_KEY (or ASSEMBLYAI_API_KEY) is set
  data_mode: DataMode;
}

// ---------------------------------------------------------------------------
// Seed data file format (keyless demo mode) — see ARCHITECTURE.md §3 "Seed data files"
// ---------------------------------------------------------------------------

/** `src/data/seed/meetings/<slug>.json` — one file per meeting. */
export interface SeedMeetingFile extends MeetingDetail {
  decisions: Decision[];
}

/** `src/data/seed/workspace.json` */
export interface SeedWorkspaceFile {
  workspace: Workspace;
  user: User;
  upcoming: UpcomingMeeting[];
  playlists: (Playlist & { items: PlaylistItem[] })[];
}

// ===========================================================================
// PHASE 5 — full Fathom feature parity (additive). See ARCHITECTURE.md §10.
// ===========================================================================

// ---------------------------------------------------------------------------
// A. Library & organization
// ---------------------------------------------------------------------------

/** Library tabs: My calls (recorded by me) / Shared with me (shared/invited to me) / Team (everyone else in workspace). */
export const SHARE_SCOPES = ["mine", "shared", "team"] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];

export const MEETING_SORTS = ["newest", "oldest", "longest", "shortest", "title"] as const;
export type MeetingSort = (typeof MEETING_SORTS)[number];

export interface Folder {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null; // hex; UI falls back to accent
  created_at: string;
}

export interface FolderWithCount extends Folder {
  meeting_count: number; // excludes soft-deleted meetings
}

/** Library filters (GET /api/meetings query). All optional; combined with AND. */
export interface MeetingListFilters {
  scope?: ShareScope | "all";
  folder_id?: string | "none"; // "none" = not in any folder
  q?: string; // title / participant name substring
  meeting_type?: MeetingType;
  participant?: string; // email or name (case-insensitive)
  company?: string; // email domain, e.g. "acmelogistics.com"
  from?: string; // ISO date (inclusive) on recording_start ?? scheduled_start ?? created_at
  to?: string; // ISO date (inclusive)
  has_action_items?: boolean;
  starred?: boolean;
  trash?: boolean; // true = only soft-deleted meetings
  sort?: MeetingSort;
}

export const BULK_MEETING_ACTIONS = ["move", "star", "unstar", "delete", "restore"] as const;
export type BulkMeetingAction = (typeof BULK_MEETING_ACTIONS)[number];

// ---------------------------------------------------------------------------
// B. Capture: bot sessions + calendar
// ---------------------------------------------------------------------------

export const BOT_PLATFORMS = ["zoom", "google_meet", "teams", "unknown"] as const;
export type BotPlatform = (typeof BOT_PLATFORMS)[number];

export const BOT_STATES = ["joining", "waiting_room", "recording", "processing", "done", "failed"] as const;
export type BotState = (typeof BOT_STATES)[number];

export interface BotStateEvent {
  state: BotState;
  at: string; // ISO
  note: string | null;
}

/**
 * "Send Fanthom to a live meeting". The bot is SIMULATED (no real meeting joins) — `simulated` is always true
 * and the UI must say so. In demo mode reaching `done` creates a meeting cloned from a seed template (`meeting_id`).
 */
export interface BotSession {
  id: string;
  workspace_id: string;
  meeting_url: string;
  platform: BotPlatform;
  title: string;
  state: BotState;
  simulated: boolean;
  meeting_id: string | null; // set when state === "done"
  error: string | null;
  events: BotStateEvent[]; // state history, oldest first
  created_at: string;
  joined_at: string | null; // entered waiting room
  admitted_at: string | null; // recording started
  recording_ended_at: string | null;
  completed_at: string | null; // done | failed
  updated_at: string;
}

/** Auto-record rule for calendar events (like Fathom's "record all / external only / internal only / none"). */
export const AUTO_RECORD_RULES = ["all", "external_only", "internal_only", "none"] as const;
export type AutoRecordRule = (typeof AUTO_RECORD_RULES)[number];

export const CALENDAR_SOURCES = ["seed", "google", "outlook"] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

/** Upcoming calendar event (extends the seeded UpcomingMeeting). Calendar OAuth is stubbed; events are seeded. */
export interface CalendarEvent extends UpcomingMeeting {
  meeting_url: string | null;
  platform: BotPlatform;
  organizer_email: string | null;
  is_external: boolean; // any attendee external
  source: CalendarSource;
  /** Explicit per-event toggle; null = follow the auto-record rule. */
  record_override: boolean | null;
  /** Effective decision = record_override ?? rule(event). Computed server-side. */
  record: boolean;
}

// ---------------------------------------------------------------------------
// C. Insights: coaching metrics, team dashboard, trackers, deals
// ---------------------------------------------------------------------------

export interface FillerWordCount {
  word: string; // e.g. "um", "uh", "like", "you know"
  count: number;
}

/** Per-speaker coaching metrics for one call. Computed from segments (never stored). */
export interface SpeakerCoachingMetrics {
  participant_id: string;
  name: string;
  color: string;
  is_external: boolean;
  talk_ms: number;
  talk_pct: number; // 0..100 of total talk time
  segment_count: number;
  words: number;
  words_per_minute: number; // words / (talk_ms / 60000)
  longest_monologue_ms: number; // longest run of consecutive segments by this speaker (gaps < 2s merged)
  longest_monologue_start_ms: number | null;
  questions_asked: number; // sentences ending in "?"
  filler_words: number;
  filler_per_100_words: number;
  filler_breakdown: FillerWordCount[];
  interruptions: number; // started speaking before previous (different) speaker's segment ended, or within 200ms overlap
  /** Avg pause (ms) this speaker leaves after another speaker stops before responding (Fathom "patience"). */
  avg_patience_ms: number;
}

/** GET /api/meetings/:id/coaching */
export interface CoachingMetrics {
  meeting_id: string;
  duration_ms: number;
  total_talk_ms: number;
  silence_ms: number; // duration_ms - union of speaking time
  speaker_switches: number;
  questions_asked: number;
  filler_words: number;
  interruptions: number;
  avg_patience_ms: number;
  internal_talk_pct: number; // 0..100
  external_talk_pct: number; // 0..100
  speakers: SpeakerCoachingMetrics[]; // sorted by talk_ms desc
}

export const INSIGHTS_RANGES = ["7d", "30d", "90d", "all"] as const;
export type InsightsRange = (typeof INSIGHTS_RANGES)[number];

export interface InsightsWeekPoint {
  week_start: string; // ISO date (Monday)
  meetings: number;
  hours: number;
  external_meetings: number;
  avg_talk_pct_me: number | null; // current user's avg talk % that week
  questions: number;
}

export interface PersonInsights {
  key: string; // lowercased email, or name when no email
  name: string;
  email: string | null;
  color: string;
  is_external: boolean;
  meetings: number;
  total_talk_ms: number;
  avg_talk_pct: number;
  avg_words_per_minute: number;
  avg_questions: number;
  avg_filler_per_100_words: number;
  avg_longest_monologue_ms: number;
  avg_patience_ms: number;
  total_interruptions: number;
}

/** GET /api/insights — team dashboard across calls in range. */
export interface InsightsSummary {
  range: InsightsRange;
  from: string | null;
  to: string;
  totals: {
    meetings: number;
    hours_recorded: number;
    avg_duration_min: number;
    external_meetings: number;
    action_items: number;
    open_action_items: number;
    highlights: number;
  };
  weekly: InsightsWeekPoint[]; // oldest first
  by_person: PersonInsights[]; // internal team first, then by meetings desc
  by_type: { meeting_type: MeetingType; meetings: number; hours: number }[];
  /** Meeting load heatmap: day 0=Mon..6=Sun, hour 0..23 (UTC). */
  meeting_load: { day: number; hour: number; meetings: number }[];
  top_trackers: { tracker_id: string; name: string; color: string; hits: number }[];
}

export interface Tracker {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  keywords: string[]; // words or phrases, case-insensitive, whole-word match
  color: string;
  created_at: string;
}

export interface TrackerHit {
  tracker_id: string;
  keyword: string; // which keyword matched
  meeting_id: string;
  meeting_title: string;
  meeting_date: string | null;
  segment_id: string;
  participant_id: string | null;
  speaker_name: string;
  speaker_color: string | null;
  start_ms: number;
  /** HTML-escaped; only `<mark>` raw (same contract as SearchHit.snippet). */
  snippet: string;
}

export interface TrackerWithStats extends Tracker {
  hit_count: number;
  meeting_count: number;
  last_hit_at: string | null; // meeting date of most recent hit
}

export const DEAL_STAGES = ["discovery", "evaluation", "proposal", "negotiation", "closed_won", "closed_lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface BantFields {
  budget: string | null;
  authority: string | null;
  need: string | null;
  timeline: string | null;
}

export interface MeddpiccFields {
  metrics: string | null;
  economic_buyer: string | null;
  decision_criteria: string | null;
  decision_process: string | null;
  paper_process: string | null;
  identify_pain: string | null;
  champion: string | null;
  competition: string | null;
}

/** Deal fields: derived from sales summaries, overridable by the user (overrides persisted per domain). */
export interface DealFields {
  stage: DealStage;
  amount: number | null;
  close_date: string | null;
  bant: BantFields;
  meddpicc: MeddpiccFields;
}

/** Partial user edits stored per company domain (`deal_overrides` table). */
export interface DealOverrides {
  domain: string;
  workspace_id: string;
  stage?: DealStage;
  amount?: number | null;
  close_date?: string | null;
  bant?: Partial<BantFields>;
  meddpicc?: Partial<MeddpiccFields>;
  updated_at: string;
}

export interface Stakeholder {
  name: string;
  email: string | null;
  color: string;
  meeting_count: number;
  talk_ms: number;
  last_seen: string | null;
}

/** Row on /deals — one company = one external email domain. */
export interface CompanySummary {
  domain: string;
  name: string; // derived from domain ("acmelogistics.com" → "Acmelogistics") unless overridden
  meeting_count: number;
  first_meeting_at: string | null;
  last_meeting_at: string | null;
  stakeholder_count: number;
  stage: DealStage;
  latest_meeting_id: string | null;
  latest_meeting_title: string | null;
}

/** GET /api/deals/:domain */
export interface CompanyDetail extends CompanySummary {
  meetings: MeetingListItem[]; // newest first
  stakeholders: Stakeholder[];
  internal_team: Stakeholder[]; // our people on these calls
  latest_summary: Summary | null;
  next_steps: { text: string; meeting_id: string; start_ms: number | null; completed: boolean }[];
  fields: DealFields; // derived ⊕ overrides
  timeline: { meeting_id: string; title: string; date: string | null; meeting_type: MeetingType; headline: string | null }[];
}

// ---------------------------------------------------------------------------
// D. Collaboration & export
// ---------------------------------------------------------------------------

export interface Comment {
  id: string;
  meeting_id: string;
  timestamp_ms: number | null; // null = general comment (no marker)
  body: string; // plain text; mentions appear as "@Name"
  mentions: string[]; // TeamMember ids
  author_id: string; // TeamMember/User id
  author_name: string;
  author_color: string;
  parent_id: string | null; // one level of replies
  created_at: string;
  updated_at: string | null;
}

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "🔥", "👀", "💯"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface Reaction {
  id: string;
  meeting_id: string;
  segment_id: string;
  emoji: ReactionEmoji;
  user_id: string;
  user_name: string;
  created_at: string;
}

/** Aggregated per (segment, emoji) for rendering chips on transcript lines. */
export interface ReactionSummary {
  segment_id: string;
  emoji: ReactionEmoji;
  count: number;
  reacted_by_me: boolean;
  user_names: string[];
}

export const DOWNLOAD_FORMATS = [
  "transcript_txt",
  "transcript_srt",
  "transcript_vtt",
  "transcript_md",
  "summary_md",
  "recording",
] as const;
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

export interface DownloadFile {
  filename: string;
  content_type: string;
  body: string;
}

export const WEBHOOK_EVENTS = ["meeting.ready", "meeting.shared", "highlight.created", "action_item.completed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Outgoing (Zapier-style) webhook. Deliveries are REAL HTTP POSTs, signed with HMAC-SHA256 of the body. */
export interface Webhook {
  id: string;
  workspace_id: string;
  url: string;
  description: string | null;
  events: WebhookEvent[];
  secret: string; // shown to the user; header `X-Fanthom-Signature: sha256=<hex>`
  active: boolean;
  last_status: number | null; // HTTP status of last delivery; 0 = network error
  last_delivery_at: string | null;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: WebhookEvent;
  test: boolean;
  request_body: string; // JSON string sent
  status_code: number | null; // null = network error / timeout
  ok: boolean;
  response_body: string | null; // truncated to 2 KB
  error: string | null;
  duration_ms: number;
  created_at: string;
}

/** Envelope POSTed to webhook URLs. */
export interface WebhookPayload {
  id: string; // delivery id
  event: WebhookEvent;
  created_at: string;
  test: boolean;
  data: {
    meeting: Pick<Meeting, "id" | "title" | "meeting_type" | "recording_start" | "duration_sec">;
    url: string; // absolute call URL
    share_url: string | null;
    participants: Attendee[];
    summary_markdown: string | null;
    action_items: { description: string; assignee: string | null; completed: boolean }[];
    highlights?: { title: string; type: HighlightType; start_ms: number; url: string }[];
  };
}

/** Slack incoming-webhook integration. `webhook_url` never leaves the server (API returns SlackConfigView). */
export interface SlackConfig {
  workspace_id: string;
  webhook_url: string | null;
  channel_label: string | null; // display only, e.g. "#sales-calls"
  auto_post_on_ready: boolean;
  include_summary: boolean;
  include_action_items: boolean;
  include_highlights: boolean;
  updated_at: string;
}

export interface SlackConfigView extends Omit<SlackConfig, "webhook_url"> {
  connected: boolean;
  webhook_url_masked: string | null; // "https://hooks.slack.com/services/T0…/…abcd"
}

export const CRM_PROVIDERS = ["hubspot", "salesforce"] as const;
export type CrmProvider = (typeof CRM_PROVIDERS)[number];

export interface CrmFieldMapping {
  crm_object: string; // "Deal" | "Opportunity" | "Note" | "Contact" | "Task"
  crm_field: string; // e.g. "hs_next_step", "NextStep"
  label: string;
  value: string;
  source: "summary" | "action_items" | "participants" | "meeting" | "deal_fields";
}

export interface CrmSyncPreview {
  meeting_id: string;
  provider: CrmProvider;
  company_domain: string | null;
  fields: CrmFieldMapping[];
  connected: boolean; // always false for now (CRM OAuth stubbed) → sync is simulated and logged
}

export interface CrmSyncLog {
  id: string;
  meeting_id: string;
  provider: CrmProvider;
  status: "simulated" | "success" | "failed";
  field_count: number;
  fields: CrmFieldMapping[];
  message: string;
  created_at: string;
}

/** Email recap preview (not sent; no mail provider). */
export interface EmailRecap {
  subject: string;
  to: string[];
  html: string;
  text: string;
}

// ---------------------------------------------------------------------------
// E. Account & team
// ---------------------------------------------------------------------------

export const TEAM_ROLES = ["owner", "admin", "member", "guest"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const MEMBER_STATUSES = ["active", "invited"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface TeamMember {
  id: string; // == User.id for active members
  workspace_id: string;
  name: string;
  email: string;
  role: TeamRole;
  title: string | null; // job title, e.g. "Account Executive"
  team: string | null; // e.g. "Sales", "Engineering"
  color: string;
  status: MemberStatus;
  invited_at: string | null;
  joined_at: string | null;
}

export const AUTH_MODES = ["demo", "supabase"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/** GET /api/me */
export interface CurrentSession {
  user: User;
  workspace: Workspace;
  member: TeamMember;
  auth_mode: AuthMode; // "demo" → UI shows "Demo workspace" badge
}

export const NOTIFICATION_KINDS = ["meeting_ready", "mention", "shared_with_you", "comment", "bot_status", "invite"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Notification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null; // in-app link, e.g. /calls/:id?t=123
  meeting_id: string | null;
  actor_name: string | null;
  read_at: string | null;
  created_at: string;
}

/** Server-persisted per-user preferences (replaces Phase 1–4 localStorage defaults). */
export interface UserPrefs {
  user_id: string;
  default_template: SummaryTemplateKey;
  default_language: SummaryLanguage;
  default_share_access: ShareAccess;
  auto_record_rule: AutoRecordRule;
  email_recap_enabled: boolean;
  notify_meeting_ready: boolean;
  notify_mentions: boolean;
  notify_shared: boolean;
  calendar_connected: boolean; // stub flag set by onboarding "Connect calendar"
  onboarding_completed: boolean;
  updated_at: string;
}
