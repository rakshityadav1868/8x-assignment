/**
 * Repository interface — the ONLY way server code touches data.
 *
 * Two implementations (owned by the database agent):
 *  - `supabase-repo.ts`  used when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
 *  - `seed-repo.ts`      keyless demo mode: loads `src/data/seed/*.json` into memory; mutations
 *                        live in memory per server instance (lost on cold start — documented as "demo mode").
 *
 * Route handlers / server components call `getRepo()` (see ./index.ts) and never branch on which is active.
 * All methods are async and return contract types from `@/lib/types`.
 */
import type {
  ActionItem,
  Chapter,
  ChatMessage,
  ClipDetail,
  Decision,
  Highlight,
  Meeting,
  MeetingDetail,
  MeetingListItem,
  Participant,
  Playlist,
  PlaylistItem,
  SearchHit,
  Summary,
  SummaryLanguage,
  SummaryTemplateKey,
  TranscriptSegment,
  UpcomingMeeting,
  // Phase 5
  AutoRecordRule,
  BotSession,
  CalendarEvent,
  Comment,
  CrmSyncLog,
  CurrentSession,
  DealOverrides,
  Folder,
  FolderWithCount,
  Notification,
  Reaction,
  ReactionEmoji,
  SlackConfig,
  TeamMember,
  TeamRole,
  Tracker,
  UserPrefs,
  Webhook,
  WebhookDelivery,
} from "@/lib/types";

/** Insert shapes: server generates id/created_at (and share_token where relevant). */
export type NewMeeting = Omit<Meeting, "id" | "created_at" | "workspace_id"> & { workspace_id?: string };
export type NewParticipant = Omit<Participant, "id" | "meeting_id"> & { id?: string };
export type NewSegment = Omit<TranscriptSegment, "id" | "meeting_id">;
export type NewSummary = Omit<Summary, "id" | "created_at">;
export type NewActionItem = Omit<ActionItem, "id" | "created_at" | "meeting_id">;
export type NewHighlight = Omit<Highlight, "id" | "created_at" | "share_token" | "meeting_id">;
export type NewChapter = Omit<Chapter, "id" | "meeting_id">;
export type NewChatMessage = Omit<ChatMessage, "id" | "created_at">;

export interface SearchOptions {
  q: string;
  meeting_id?: string;
  limit: number;
}

// ---- Phase 5 insert/patch shapes ----
export interface ListMeetingsRepoOptions {
  /** Include soft-deleted meetings (default false). Filtering/sorting beyond this is `filterMeetings()` in analytics/library.ts. */
  include_deleted?: boolean;
}
export type NewFolder = { name: string; color?: string | null };
export type FolderPatch = Partial<Pick<Folder, "name" | "color">>;
export type NewTracker = Pick<Tracker, "name" | "keywords"> & { description?: string | null; color?: string };
export type TrackerPatch = Partial<Pick<Tracker, "name" | "keywords" | "description" | "color">>;
export type DealOverridesPatch = Partial<Omit<DealOverrides, "domain" | "workspace_id" | "updated_at">> & { name?: string };
/** Author fields are filled by the repo from the current user. */
export type NewComment = Pick<Comment, "body"> & { timestamp_ms?: number | null; mentions?: string[]; parent_id?: string | null };
export type CommentPatch = Partial<Pick<Comment, "body" | "mentions" | "timestamp_ms">>;
export type NewWebhook = Pick<Webhook, "url" | "events"> & { description?: string | null; active?: boolean };
export type WebhookPatch = Partial<Pick<Webhook, "url" | "events" | "description" | "active">> & { rotate_secret?: boolean };
export type NewWebhookDelivery = Omit<WebhookDelivery, "id" | "created_at">;
export type SlackConfigPatch = Partial<Omit<SlackConfig, "workspace_id" | "updated_at">>;
export type NewCrmSyncLog = Omit<CrmSyncLog, "id" | "created_at">;
export type NewBotSession = Pick<BotSession, "meeting_url" | "platform" | "title">;
export type BotSessionPatch = Partial<Omit<BotSession, "id" | "workspace_id" | "created_at">>;
export type UserPrefsPatch = Partial<Omit<UserPrefs, "user_id" | "updated_at">>;
export type NewNotification = Omit<Notification, "id" | "created_at" | "read_at" | "user_id"> & { user_id?: string };
export type TeamMemberPatch = Partial<Pick<TeamMember, "role" | "title" | "team">>;

export interface Repo {
  // Meetings
  /**
   * Newest first. Phase 5: excludes soft-deleted unless `include_deleted`; each item carries
   * folder_id / starred / deleted_at / recorded_by / scope (relative to the current user) /
   * company_domain / company_name / comment_count.
   */
  listMeetings(opts?: ListMeetingsRepoOptions): Promise<MeetingListItem[]>;
  listUpcoming(): Promise<UpcomingMeeting[]>;
  getMeeting(id: string): Promise<Meeting | null>;
  getMeetingDetail(id: string): Promise<MeetingDetail | null>;
  getMeetingDetailByShareToken(token: string): Promise<MeetingDetail | null>;
  createMeeting(input: NewMeeting): Promise<Meeting>;
  updateMeeting(id: string, patch: Partial<Omit<Meeting, "id" | "workspace_id" | "created_at">>): Promise<Meeting>;

  // Transcript
  replaceParticipants(meetingId: string, participants: NewParticipant[]): Promise<Participant[]>;
  replaceSegments(meetingId: string, segments: NewSegment[]): Promise<TranscriptSegment[]>;
  updateSegment(id: string, patch: Partial<Pick<TranscriptSegment, "text" | "participant_id">>): Promise<TranscriptSegment>;

  // Summaries (cache: one row per meeting × template × language × custom_instructions)
  findSummary(
    meetingId: string,
    template: SummaryTemplateKey,
    language: SummaryLanguage,
    customInstructions?: string | null,
  ): Promise<Summary | null>;
  saveSummary(input: NewSummary): Promise<Summary>;

  // Action items
  replaceAiActionItems(meetingId: string, items: NewActionItem[]): Promise<ActionItem[]>; // keeps user_generated rows
  createActionItem(meetingId: string, input: NewActionItem): Promise<ActionItem>;
  updateActionItem(id: string, patch: Partial<Omit<ActionItem, "id" | "meeting_id" | "created_at">>): Promise<ActionItem>;
  deleteActionItem(id: string): Promise<void>;

  // Highlights / clips
  listHighlights(meetingId: string): Promise<Highlight[]>;
  createHighlight(meetingId: string, input: NewHighlight): Promise<Highlight>;
  updateHighlight(id: string, patch: Partial<Omit<Highlight, "id" | "meeting_id" | "created_at" | "share_token">>): Promise<Highlight>;
  deleteHighlight(id: string): Promise<void>;
  getClipByToken(token: string): Promise<ClipDetail | null>;

  // Chapters & insights
  replaceChapters(meetingId: string, chapters: NewChapter[]): Promise<Chapter[]>;
  getDecisions(meetingId: string): Promise<Decision[] | null>; // null = never generated
  saveDecisions(meetingId: string, decisions: Decision[]): Promise<void>;

  // Share
  setShare(meetingId: string, access: Meeting["share_access"], invitedEmails?: string[]): Promise<Meeting>; // creates token if missing
  revokeShare(meetingId: string): Promise<void>;

  // Search (Postgres FTS in supabase; simple tokenised match in seed mode). Snippet contract: see SearchHit.
  search(opts: SearchOptions): Promise<{ hits: SearchHit[]; total: number }>;

  // Ask Fanthom
  listChatMessages(meetingId: string | null): Promise<ChatMessage[]>;
  addChatMessage(input: NewChatMessage): Promise<ChatMessage>;

  // Playlists (P3)
  listPlaylists(): Promise<(Playlist & { item_count: number })[]>;
  createPlaylist(input: { name: string; description?: string | null }): Promise<Playlist>;
  addPlaylistItem(playlistId: string, input: { meeting_id?: string; highlight_id?: string }): Promise<PlaylistItem>;
  /** Playlist + its items ordered by position; null if missing. */
  getPlaylist(id: string): Promise<(Playlist & { items: PlaylistItem[] }) | null>;
  /** Remove one item (throw NotFoundError if missing) and re-number positions. */
  removePlaylistItem(playlistId: string, itemId: string): Promise<void>;

  // =========================================================================
  // Phase 5 — full parity. Missing rows → throw NotFoundError. Soft-deleted
  // meetings are still returned by getMeeting/getMeetingDetail (call page shows "in trash").
  // `updateMeeting` already covers folder_id / starred / deleted_at / title.
  // =========================================================================

  // Bulk (analytics input): details of many meetings in one go (ready, non-deleted). Used by insights,
  // trackers, deals. `ids` omitted = all.
  listMeetingDetails(opts?: { ids?: string[] }): Promise<MeetingDetail[]>;
  /** Bulk patch used by POST /api/meetings/bulk. Returns number of rows updated (unknown ids ignored). */
  updateMeetings(ids: string[], patch: Partial<Pick<Meeting, "folder_id" | "starred" | "deleted_at">>): Promise<number>;

  // Folders
  listFolders(): Promise<FolderWithCount[]>; // by name
  getFolder(id: string): Promise<FolderWithCount | null>;
  createFolder(input: NewFolder): Promise<FolderWithCount>;
  updateFolder(id: string, patch: FolderPatch): Promise<FolderWithCount>;
  /** Deletes the folder; its meetings get folder_id = null. */
  deleteFolder(id: string): Promise<void>;

  // Trackers (hit search itself is analytics/trackers.ts)
  listTrackers(): Promise<Tracker[]>;
  getTracker(id: string): Promise<Tracker | null>;
  createTracker(input: NewTracker): Promise<Tracker>;
  updateTracker(id: string, patch: TrackerPatch): Promise<Tracker>;
  deleteTracker(id: string): Promise<void>;

  // Deals (grouping is analytics/deals.ts; only user overrides are stored, keyed by lowercase domain)
  listDealOverrides(): Promise<(DealOverrides & { name?: string })[]>;
  getDealOverrides(domain: string): Promise<(DealOverrides & { name?: string }) | null>;
  saveDealOverrides(domain: string, patch: DealOverridesPatch): Promise<DealOverrides & { name?: string }>; // merge-upsert

  // Comments (author = current user)
  listComments(meetingId: string): Promise<Comment[]>; // timestamp_ms asc (nulls last), then created_at
  getComment(id: string): Promise<Comment | null>;
  createComment(meetingId: string, input: NewComment): Promise<Comment>;
  updateComment(id: string, patch: CommentPatch): Promise<Comment>; // sets updated_at
  deleteComment(id: string): Promise<void>; // cascades replies

  // Reactions (per user × segment × emoji unique)
  listReactions(meetingId: string): Promise<Reaction[]>;
  /** Adds the current user's reaction, or removes it if present. Throws NotFoundError for unknown segment. */
  toggleReaction(segmentId: string, emoji: ReactionEmoji): Promise<{ added: boolean; meeting_id: string; reactions: Reaction[] /* this segment's, after toggle */ }>;

  // Webhooks
  listWebhooks(): Promise<Webhook[]>;
  getWebhook(id: string): Promise<Webhook | null>;
  createWebhook(input: NewWebhook): Promise<Webhook>; // generates secret ("whsec_" + random)
  updateWebhook(id: string, patch: WebhookPatch): Promise<Webhook>;
  deleteWebhook(id: string): Promise<void>; // cascades deliveries
  listWebhookDeliveries(webhookId: string, limit?: number): Promise<WebhookDelivery[]>; // newest first, default 50
  /** Stores a delivery AND updates the webhook's last_status / last_delivery_at. */
  recordWebhookDelivery(input: NewWebhookDelivery): Promise<WebhookDelivery>;

  // Slack (single config per workspace; returns defaults when never saved)
  getSlackConfig(): Promise<SlackConfig>;
  saveSlackConfig(patch: SlackConfigPatch): Promise<SlackConfig>;

  // CRM sync logs
  listCrmSyncLogs(meetingId?: string): Promise<CrmSyncLog[]>; // newest first
  addCrmSyncLog(input: NewCrmSyncLog): Promise<CrmSyncLog>;

  // Bot sessions (state machine logic lives in integrations/bot.ts; repo only persists)
  listBotSessions(limit?: number): Promise<BotSession[]>; // newest first
  getBotSession(id: string): Promise<BotSession | null>;
  createBotSession(input: NewBotSession): Promise<BotSession>; // state "joining", simulated true, events [joining]
  updateBotSession(id: string, patch: BotSessionPatch): Promise<BotSession>; // sets updated_at

  /**
   * Seed-template cloning for the simulated bot / recorder in demo mode: deep-copies a seed meeting
   * (participants, segments, summaries, action items, highlights, chapters, decisions) under a new id with
   * the given title and recording_start = now. Returns the new meeting id.
   */
  cloneMeetingFromTemplate(templateMeetingId: string | null, overrides: { title: string; recorded_by?: string | null }): Promise<string>;

  // Calendar (events are seeded; OAuth stubbed). `record` is computed by the repo via analytics/calendar.ts
  listCalendarEvents(range: { from: string; to: string }): Promise<CalendarEvent[]>; // ordered by start
  setCalendarRecord(eventId: string, record: boolean | null): Promise<CalendarEvent>;

  // Prefs (current user; defaults when never saved)
  getPrefs(): Promise<UserPrefs>;
  updatePrefs(patch: UserPrefsPatch): Promise<UserPrefs>;
  /** Convenience used by the calendar: prefs.auto_record_rule. */
  getAutoRecordRule(): Promise<AutoRecordRule>;

  // Session & team
  getCurrentSession(): Promise<CurrentSession>; // demo: Priya Raman, auth_mode "demo"
  listTeamMembers(): Promise<TeamMember[]>; // active first, then invited; by name
  inviteTeamMembers(emails: string[], role: Exclude<TeamRole, "owner">): Promise<TeamMember[]>; // skips existing emails
  updateTeamMember(id: string, patch: TeamMemberPatch): Promise<TeamMember>;
  removeTeamMember(id: string): Promise<void>;

  // Notifications (current user)
  listNotifications(opts?: { unread?: boolean; limit?: number }): Promise<{ notifications: Notification[]; unread_count: number }>;
  createNotification(input: NewNotification): Promise<Notification>; // user_id defaults to current user
  /** `ids` omitted = mark all read. Returns remaining unread count. */
  markNotificationsRead(ids?: string[]): Promise<number>;
}
