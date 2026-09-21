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

export interface Repo {
  // Meetings
  listMeetings(): Promise<MeetingListItem[]>; // newest first
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
  /** Additive (phase 2, optional until both repos implement it): playlist + its items ordered by position; null if missing. */
  getPlaylist?(id: string): Promise<(Playlist & { items: PlaylistItem[] }) | null>;
  /** Additive (phase 2): remove one item (throw NotFoundError if missing) and re-number positions. */
  removePlaylistItem?(playlistId: string, itemId: string): Promise<void>;
}
