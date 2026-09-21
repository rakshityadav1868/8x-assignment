/**
 * Fanthom API contracts — zod schemas for every request/response.
 *
 * - Entity schemas mirror `types.ts` and are checked against it with `satisfies`
 *   so the two can never drift silently.
 * - Wire format is snake_case JSON (same names as DB columns).
 * - Every error response is `ApiError` with an HTTP 4xx/5xx status.
 * - Route handlers should `Schema.parse(await req.json())` for bodies and
 *   return `Response.json(ResponseSchema.parse(data))` (or at least type the payload with the inferred type).
 * - Change additively only; log changes in ARCHITECTURE.md "Contract changelog".
 */
import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "./routes";
import {
  AI_MODES,
  DATA_MODES,
  CHAT_ROLES,
  HIGHLIGHT_TYPES,
  MEDIA_KINDS,
  MEETING_STATUSES,
  MEETING_TYPES,
  PROCESSING_STAGES,
  SHARE_ACCESS,
  SUMMARY_LANGUAGES,
  SUMMARY_TEMPLATE_KEYS,
  type ActionItem,
  type Capabilities,
  type Chapter,
  type ChatMessage,
  type Citation,
  type ClipDetail,
  type Commitment,
  type CatchUpBullet,
  type Decision,
  type FollowUpEmail,
  type Highlight,
  type Meeting,
  type MeetingDetail,
  type MeetingListItem,
  type Participant,
  type Playlist,
  type ProcessingStatus,
  type SearchHit,
  type Summary,
  type SummaryBullet,
  type SummarySection,
  type TranscriptSegment,
  type UpcomingMeeting,
  SHARE_SCOPES,
} from "./types";
import {
  AUTH_MODES,
  AUTO_RECORD_RULES,
  BOT_PLATFORMS,
  BOT_STATES,
  BULK_MEETING_ACTIONS,
  CALENDAR_SOURCES,
  CRM_PROVIDERS,
  DEAL_STAGES,
  DOWNLOAD_FORMATS,
  INSIGHTS_RANGES,
  MEETING_SORTS,
  MEMBER_STATUSES,
  NOTIFICATION_KINDS,
  REACTION_EMOJIS,
  TEAM_ROLES,
  WEBHOOK_EVENTS,
  type BantFields,
  type BotSession,
  type CalendarEvent,
  type CoachingMetrics,
  type Comment,
  type CompanyDetail,
  type CompanySummary,
  type CrmFieldMapping,
  type CrmSyncLog,
  type CrmSyncPreview,
  type CurrentSession,
  type DealFields,
  type EmailRecap,
  type Folder,
  type FolderWithCount,
  type InsightsSummary,
  type MeddpiccFields,
  type MeetingListFilters,
  type Notification,
  type Reaction,
  type ReactionSummary,
  type SlackConfigView,
  type SpeakerCoachingMetrics,
  type Stakeholder,
  type TeamMember,
  type Tracker,
  type TrackerHit,
  type TrackerWithStats,
  type User,
  type UserPrefs,
  type Webhook,
  type WebhookDelivery,
  type Workspace,
} from "./types";

// ---------------------------------------------------------------------------
// Primitives / enums
// ---------------------------------------------------------------------------

const id = z.string().min(1);
const ms = z.number().int().nonnegative();
const isoTs = z.string(); // Postgres timestamptz strings; not strict ISO (offsets vary)

export const MeetingTypeSchema = z.enum(MEETING_TYPES);
export const SummaryTemplateKeySchema = z.enum(SUMMARY_TEMPLATE_KEYS);
export const SummaryLanguageSchema = z.enum(SUMMARY_LANGUAGES);
export const HighlightTypeSchema = z.enum(HIGHLIGHT_TYPES);
export const MeetingStatusSchema = z.enum(MEETING_STATUSES);
export const ProcessingStageSchema = z.enum(PROCESSING_STAGES);
export const MediaKindSchema = z.enum(MEDIA_KINDS);
export const ShareAccessSchema = z.enum(SHARE_ACCESS);
export const ChatRoleSchema = z.enum(CHAT_ROLES);
export const AiModeSchema = z.enum(AI_MODES);
export const DataModeSchema = z.enum(DATA_MODES);

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(), // e.g. "not_found", "forbidden", "validation", "llm_failed", "rate_limited"
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const OkSchema = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof OkSchema>;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const MeetingSchema = z.object({
  id,
  workspace_id: id,
  title: z.string(),
  meeting_type: MeetingTypeSchema,
  scheduled_start: isoTs.nullable(),
  scheduled_end: isoTs.nullable(),
  recording_start: isoTs.nullable(),
  recording_end: isoTs.nullable(),
  duration_sec: z.number().nonnegative(),
  media_url: z.string().nullable(),
  media_kind: MediaKindSchema,
  status: MeetingStatusSchema,
  processing_stage: ProcessingStageSchema,
  processing_error: z.string().nullable(),
  transcript_language: z.string(),
  share_token: z.string().nullable(),
  share_access: ShareAccessSchema,
  recorded_by: z.string().nullable(),
  synthetic: z.boolean(),
  created_at: isoTs,
  folder_id: id.nullable().optional(), // Phase 5
  starred: z.boolean().optional(), // Phase 5
  deleted_at: isoTs.nullable().optional(), // Phase 5
}) satisfies z.ZodType<Meeting>;

export const ParticipantSchema = z.object({
  id,
  meeting_id: id,
  name: z.string(),
  email: z.string().nullable(),
  is_external: z.boolean(),
  color: z.string(),
}) satisfies z.ZodType<Participant>;

export const TranscriptSegmentSchema = z.object({
  id,
  meeting_id: id,
  participant_id: id.nullable(),
  start_ms: ms,
  end_ms: ms,
  text: z.string(),
}) satisfies z.ZodType<TranscriptSegment>;

export const SummaryBulletSchema = z.object({
  text: z.string().min(1),
  start_ms: ms,
}) satisfies z.ZodType<SummaryBullet>;

export const SummarySectionSchema = z.object({
  heading: z.string().min(1),
  bullets: z.array(SummaryBulletSchema),
}) satisfies z.ZodType<SummarySection>;

export const SummarySchema = z.object({
  id,
  meeting_id: id,
  template: SummaryTemplateKeySchema,
  language: SummaryLanguageSchema,
  markdown: z.string(),
  sections: z.array(SummarySectionSchema),
  custom_instructions: z.string().nullable(),
  created_at: isoTs,
}) satisfies z.ZodType<Summary>;

export const ActionItemSchema = z.object({
  id,
  meeting_id: id,
  description: z.string(),
  assignee_participant_id: id.nullable(),
  timestamp_ms: ms.nullable(),
  completed: z.boolean(),
  user_generated: z.boolean(),
  created_at: isoTs,
}) satisfies z.ZodType<ActionItem>;

export const HighlightSchema = z.object({
  id,
  meeting_id: id,
  start_ms: ms,
  end_ms: ms,
  type: HighlightTypeSchema,
  title: z.string(),
  note: z.string().nullable(),
  share_token: z.string(),
  user_generated: z.boolean(),
  created_at: isoTs,
}) satisfies z.ZodType<Highlight>;

export const ChapterSchema = z.object({
  id,
  meeting_id: id,
  title: z.string(),
  start_ms: ms,
  end_ms: ms,
  summary: z.string().nullable(),
}) satisfies z.ZodType<Chapter>;

export const PlaylistSchema = z.object({
  id,
  workspace_id: id,
  name: z.string(),
  description: z.string().nullable(),
  created_at: isoTs,
}) satisfies z.ZodType<Playlist>;

export const CitationSchema = z.object({
  index: z.number().int().positive(),
  segment_id: id,
  meeting_id: id,
  start_ms: ms,
  quote: z.string().optional(),
}) satisfies z.ZodType<Citation>;

export const ChatMessageSchema = z.object({
  id,
  meeting_id: id.nullable(),
  role: ChatRoleSchema,
  content: z.string(),
  citations: z.array(CitationSchema),
  created_at: isoTs,
}) satisfies z.ZodType<ChatMessage>;

const AttendeeSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  is_external: z.boolean(),
});

export const MeetingListItemSchema = MeetingSchema.pick({
  id: true,
  title: true,
  meeting_type: true,
  recording_start: true,
  scheduled_start: true,
  duration_sec: true,
  status: true,
  processing_stage: true,
  media_kind: true,
  synthetic: true,
  created_at: true,
}).extend({
  participants: z.array(ParticipantSchema.pick({ id: true, name: true, email: true, is_external: true, color: true })),
  action_item_count: z.number().int().nonnegative(),
  highlight_count: z.number().int().nonnegative(),
  // Phase 5 (optional)
  folder_id: id.nullable().optional(),
  starred: z.boolean().optional(),
  deleted_at: isoTs.nullable().optional(),
  recorded_by: z.string().nullable().optional(),
  scope: z.enum(SHARE_SCOPES).optional(),
  company_domain: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  comment_count: z.number().int().nonnegative().optional(),
}) satisfies z.ZodType<MeetingListItem>;

export const UpcomingMeetingSchema = z.object({
  id,
  title: z.string(),
  start: isoTs,
  end: isoTs,
  attendees: z.array(AttendeeSchema),
  meeting_type: MeetingTypeSchema,
}) satisfies z.ZodType<UpcomingMeeting>;

export const DecisionSchema = z.object({
  text: z.string().min(1),
  start_ms: ms,
  participant_id: id.nullable(),
}) satisfies z.ZodType<Decision>;

export const MeetingDetailSchema = z.object({
  meeting: MeetingSchema,
  participants: z.array(ParticipantSchema),
  segments: z.array(TranscriptSegmentSchema),
  summaries: z.array(SummarySchema),
  action_items: z.array(ActionItemSchema),
  highlights: z.array(HighlightSchema),
  chapters: z.array(ChapterSchema),
  decisions: z.array(DecisionSchema).optional(), // additive (phase 1)
  default_summary_template: SummaryTemplateKeySchema.nullable().optional(), // additive (phase 5)
}) satisfies z.ZodType<MeetingDetail>;

export const ClipDetailSchema = z.object({
  highlight: HighlightSchema,
  meeting: MeetingSchema.pick({
    id: true,
    title: true,
    media_url: true,
    media_kind: true,
    recording_start: true,
    duration_sec: true,
  }),
  participants: z.array(ParticipantSchema),
  segments: z.array(TranscriptSegmentSchema),
}) satisfies z.ZodType<ClipDetail>;

export const ProcessingStatusSchema = z.object({
  meeting_id: id,
  status: MeetingStatusSchema,
  stage: ProcessingStageSchema,
  progress: z.number().min(0).max(100),
  error: z.string().nullable(),
}) satisfies z.ZodType<ProcessingStatus>;

export const SearchHitSchema = z.object({
  meeting_id: id,
  meeting_title: z.string(),
  meeting_date: isoTs.nullable(),
  meeting_type: MeetingTypeSchema,
  segment_id: id,
  participant_id: id.nullable(),
  speaker_name: z.string(),
  speaker_color: z.string().nullable(),
  snippet: z.string(),
  start_ms: ms,
  rank: z.number(),
}) satisfies z.ZodType<SearchHit>;

export const CommitmentSchema = z.object({
  text: z.string().min(1),
  start_ms: ms,
  participant_id: id,
  due: z.string().nullable(),
}) satisfies z.ZodType<Commitment>;

export const CatchUpBulletSchema = z.object({
  text: z.string().min(1),
  start_ms: ms,
}) satisfies z.ZodType<CatchUpBullet>;

export const FollowUpEmailSchema = z.object({
  subject: z.string(),
  body_markdown: z.string(),
}) satisfies z.ZodType<FollowUpEmail>;

/** Phase 5 library folder (defined early: used by ListMeetingsResponse). */
export const FolderSchema = z.object({
  id,
  workspace_id: id,
  name: z.string(),
  color: z.string().nullable(),
  created_at: isoTs,
}) satisfies z.ZodType<Folder>;
export const FolderWithCountSchema = FolderSchema.extend({
  meeting_count: z.number().int().nonnegative(),
}) satisfies z.ZodType<FolderWithCount>;

// ---------------------------------------------------------------------------
// Capabilities (keyless-first)
// ---------------------------------------------------------------------------

/** GET /api/capabilities */
export const CapabilitiesResponse = z.object({
  ai_mode: AiModeSchema,
  transcription: z.boolean(),
  data_mode: DataModeSchema,
}) satisfies z.ZodType<Capabilities>;
export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponse>;

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

/** GET /api/meetings */
export const ListMeetingsResponse = z.object({
  meetings: z.array(MeetingListItemSchema), // newest first; UI groups by date
  upcoming: z.array(UpcomingMeetingSchema),
  folders: z.array(FolderWithCountSchema).optional(), // Phase 5: sidebar folders (same as GET /api/folders)
});
export type ListMeetingsResponse = z.infer<typeof ListMeetingsResponse>;

/** GET /api/meetings/:id → MeetingDetail */
export const GetMeetingResponse = MeetingDetailSchema;
export type GetMeetingResponse = z.infer<typeof GetMeetingResponse>;

/**
 * PATCH /api/meetings/:id — meeting-type badge edit, rename.
 * Phase 5 additions: `folder_id` (move; null = remove from folder), `starred`, `deleted` (true = soft delete to
 * trash, false = restore). DELETE /api/meetings/:id is equivalent to `{deleted: true}`.
 */
export const UpdateMeetingRequest = z
  .object({
    title: z.string().min(1).max(200).optional(),
    meeting_type: MeetingTypeSchema.optional(),
    folder_id: id.nullable().optional(),
    starred: z.boolean().optional(),
    deleted: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update");
export type UpdateMeetingRequest = z.infer<typeof UpdateMeetingRequest>;
export const UpdateMeetingResponse = z.object({ meeting: MeetingSchema });
export type UpdateMeetingResponse = z.infer<typeof UpdateMeetingResponse>;

// ---------------------------------------------------------------------------
// Upload + processing
// ---------------------------------------------------------------------------

export { MAX_UPLOAD_BYTES };

/**
 * POST /api/upload — creates a `processing` meeting and a Supabase signed upload URL. */
export const UploadRequest = z.object({
  filename: z.string().min(1),
  content_type: z.string().regex(/^(audio|video)\//, "Must be an audio or video file"),
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  title: z.string().max(200).optional(),
});
export type UploadRequest = z.infer<typeof UploadRequest>;

/**
 * Client then uploads with
 * `supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)`
 * (or PUT the file to `signed_url`), then calls POST /api/meetings/:id/process.
 */
export const UploadResponse = z.object({
  meeting_id: id,
  bucket: z.string(),
  path: z.string(),
  signed_url: z.string(),
  token: z.string(),
});
export type UploadResponse = z.infer<typeof UploadResponse>;

/**
 * POST /api/meetings/:id/process — kicks off Deepgram + parallel LLM jobs. Returns immediately.
 * Without DEEPGRAM_API_KEY: 503 ApiError {code:"transcription_unavailable"} (honest stub; UI explains).
 * Without ANTHROPIC_API_KEY but with Deepgram: transcript is real, AI artifacts use the demo fallback.
 */
export const ProcessRequest = z.object({
  language: z.string().optional(), // hint for Deepgram; default auto/en
});
export type ProcessRequest = z.infer<typeof ProcessRequest>;
export const ProcessResponse = ProcessingStatusSchema;
export type ProcessResponse = z.infer<typeof ProcessResponse>;

/** GET /api/meetings/:id/status — poll every ~2s until stage is ready|failed. */
export const StatusResponse = ProcessingStatusSchema;
export type StatusResponse = z.infer<typeof StatusResponse>;

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/** GET /api/meetings/:id/summary?template=&language= — cached lookup only (never generates). */
export const GetSummaryQuery = z.object({
  template: SummaryTemplateKeySchema,
  language: SummaryLanguageSchema.default("en"),
});
export type GetSummaryQuery = z.infer<typeof GetSummaryQuery>;
export const GetSummaryResponse = z.object({ summary: SummarySchema.nullable() });
export type GetSummaryResponse = z.infer<typeof GetSummaryResponse>;

/**
 * POST /api/meetings/:id/summary — (re)generate with template/language/custom instructions.
 * Returns cached row when an identical (template, language, custom_instructions) exists unless `force`.
 */
export const RegenerateSummaryRequest = z.object({
  template: SummaryTemplateKeySchema,
  language: SummaryLanguageSchema.default("en"),
  custom_instructions: z.string().max(2000).nullable().optional(),
  force: z.boolean().optional(),
});
export type RegenerateSummaryRequest = z.infer<typeof RegenerateSummaryRequest>;
export const RegenerateSummaryResponse = z.object({ summary: SummarySchema, ai_mode: AiModeSchema });
export type RegenerateSummaryResponse = z.infer<typeof RegenerateSummaryResponse>;

/** LLM output schema for summary generation (what the model must return). */
export const SummaryLLMOutput = z.object({
  sections: z.array(SummarySectionSchema).min(1),
});
export type SummaryLLMOutput = z.infer<typeof SummaryLLMOutput>;

// ---------------------------------------------------------------------------
// Ask Fanthom (streaming)
// ---------------------------------------------------------------------------

/** GET /api/meetings/:id/ask — chat history for the meeting. */
export const AskHistoryResponse = z.object({ messages: z.array(ChatMessageSchema) });
export type AskHistoryResponse = z.infer<typeof AskHistoryResponse>;

/** POST /api/meetings/:id/ask  (and POST /api/ask for cross-meeting, P3). */
export const AskRequest = z.object({
  question: z.string().min(1).max(2000),
});
export type AskRequest = z.infer<typeof AskRequest>;

/**
 * Response: `Content-Type: application/x-ndjson`, one AskStreamEvent JSON per line.
 * Order: `start` → many `delta` → `citations` → `done` (or `error` at any point).
 * Assistant text references citations inline as `[1]`, `[2]` (Citation.index).
 */
export const AskStreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), user_message: ChatMessageSchema, ai_mode: AiModeSchema }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("citations"), citations: z.array(CitationSchema) }),
  z.object({ type: z.literal("done"), message: ChatMessageSchema, ai_mode: AiModeSchema }),
  z.object({ type: z.literal("error"), error: z.string() }),
]);
export type AskStreamEvent = z.infer<typeof AskStreamEvent>;
export const ASK_STREAM_CONTENT_TYPE = "application/x-ndjson";

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** GET /api/search?q=&meeting_id=&limit= — Postgres FTS over transcript_segments. */
export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  meeting_id: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type SearchQuery = z.infer<typeof SearchQuery>;
export const SearchResponse = z.object({
  query: z.string(),
  hits: z.array(SearchHitSchema), // best rank first
  total: z.number().int().nonnegative(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

// ---------------------------------------------------------------------------
// Highlights (clips)
// ---------------------------------------------------------------------------

/** GET /api/meetings/:id/highlights */
export const ListHighlightsResponse = z.object({ highlights: z.array(HighlightSchema) });
export type ListHighlightsResponse = z.infer<typeof ListHighlightsResponse>;

/** POST /api/meetings/:id/highlights — server generates share_token. */
export const CreateHighlightRequest = z
  .object({
    start_ms: ms,
    end_ms: ms,
    type: HighlightTypeSchema,
    title: z.string().min(1).max(200),
    note: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.end_ms > v.start_ms, "end_ms must be after start_ms");
export type CreateHighlightRequest = z.infer<typeof CreateHighlightRequest>;
export const HighlightResponse = z.object({ highlight: HighlightSchema });
export type HighlightResponse = z.infer<typeof HighlightResponse>;

/** PATCH /api/highlights/:id */
export const UpdateHighlightRequest = z.object({
  start_ms: ms.optional(),
  end_ms: ms.optional(),
  type: HighlightTypeSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  note: z.string().max(2000).nullable().optional(),
});
export type UpdateHighlightRequest = z.infer<typeof UpdateHighlightRequest>;

/** DELETE /api/highlights/:id → Ok */

/** GET /api/clip/:token → ClipDetail (public, no auth). */
export const ClipResponse = ClipDetailSchema;
export type ClipResponse = z.infer<typeof ClipResponse>;

// ---------------------------------------------------------------------------
// Action items
// ---------------------------------------------------------------------------

/** POST /api/meetings/:id/action-items — always user_generated=true. */
export const CreateActionItemRequest = z.object({
  description: z.string().min(1).max(1000),
  assignee_participant_id: id.nullable().optional(),
  timestamp_ms: ms.nullable().optional(),
});
export type CreateActionItemRequest = z.infer<typeof CreateActionItemRequest>;

/** PATCH /api/action-items/:id — toggle completed / edit. */
export const UpdateActionItemRequest = z.object({
  completed: z.boolean().optional(),
  description: z.string().min(1).max(1000).optional(),
  assignee_participant_id: id.nullable().optional(),
  timestamp_ms: ms.nullable().optional(),
});
export type UpdateActionItemRequest = z.infer<typeof UpdateActionItemRequest>;
export const ActionItemResponse = z.object({ action_item: ActionItemSchema });
export type ActionItemResponse = z.infer<typeof ActionItemResponse>;

/** DELETE /api/action-items/:id → Ok */

/** LLM output schema for action item extraction. `assignee` is a speaker name matched to a participant server-side. */
export const ActionItemsLLMOutput = z.object({
  action_items: z.array(
    z.object({
      description: z.string().min(1),
      assignee: z.string().nullable(),
      start_ms: ms.nullable(),
    }),
  ),
});
export type ActionItemsLLMOutput = z.infer<typeof ActionItemsLLMOutput>;

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

/** POST /api/meetings/:id/share — creates (or reuses) share_token and sets access. */
export const CreateShareRequest = z.object({
  access: ShareAccessSchema.default("anyone_with_link"),
  invited_emails: z.array(z.string().email()).optional(), // stored but not enforced (no real auth)
});
export type CreateShareRequest = z.infer<typeof CreateShareRequest>;
export const CreateShareResponse = z.object({
  share_token: z.string(),
  share_url: z.string(), // `${NEXT_PUBLIC_APP_URL}/share/${token}`
  access: ShareAccessSchema,
});
export type CreateShareResponse = z.infer<typeof CreateShareResponse>;

/** DELETE /api/meetings/:id/share → Ok (revokes link: share_token = null). */

/** POST /api/highlights/:id/share → clip link (token already exists; this just returns the URL). */
export const HighlightShareResponse = z.object({ share_token: z.string(), share_url: z.string() });
export type HighlightShareResponse = z.infer<typeof HighlightShareResponse>;

/**
 * GET /api/share/:token → MeetingDetail (public).
 * 404 {code:"not_found"} if token unknown; 403 {code:"forbidden"} when access != anyone_with_link
 * (same_domain / invited are shown as a gated screen since there is no real auth).
 */
export const ShareAccessResponse = MeetingDetailSchema;
export type ShareAccessResponse = z.infer<typeof ShareAccessResponse>;

// ---------------------------------------------------------------------------
// AI extras: follow-up email, catch-me-up, decisions, commitments, chapters
// ---------------------------------------------------------------------------

/** POST /api/meetings/:id/follow-up-email */
export const FollowUpEmailRequest = z.object({
  tone: z.enum(["friendly", "formal", "concise"]).default("friendly"),
  recipient_participant_id: id.nullable().optional(),
});
export type FollowUpEmailRequest = z.infer<typeof FollowUpEmailRequest>;
export const FollowUpEmailResponse = FollowUpEmailSchema.extend({ ai_mode: AiModeSchema });
export type FollowUpEmailResponse = z.infer<typeof FollowUpEmailResponse>;

/** POST /api/meetings/:id/catch-up — summarise [from_ms, to_ms ?? end]. */
export const CatchUpRequest = z.object({
  from_ms: ms,
  to_ms: ms.nullable().optional(),
});
export type CatchUpRequest = z.infer<typeof CatchUpRequest>;
export const CatchUpResponse = z.object({
  from_ms: ms,
  to_ms: ms,
  bullets: z.array(CatchUpBulletSchema),
  ai_mode: AiModeSchema,
});
export type CatchUpResponse = z.infer<typeof CatchUpResponse>;

/** GET /api/meetings/:id/decisions — cached; POST same path regenerates. */
export const DecisionsResponse = z.object({ decisions: z.array(DecisionSchema), ai_mode: AiModeSchema });
export type DecisionsResponse = z.infer<typeof DecisionsResponse>;

/** POST /api/meetings/:id/commitments — "What did <person> commit to?" */
export const CommitmentsRequest = z.object({ participant_id: id });
export type CommitmentsRequest = z.infer<typeof CommitmentsRequest>;
export const CommitmentsResponse = z.object({
  participant_id: id,
  commitments: z.array(CommitmentSchema),
  ai_mode: AiModeSchema,
});
export type CommitmentsResponse = z.infer<typeof CommitmentsResponse>;

/** LLM output schemas for pipeline jobs. */
export const ChaptersLLMOutput = z.object({
  chapters: z.array(z.object({ title: z.string().min(1), start_ms: ms, end_ms: ms, summary: z.string() })).min(1),
});
export type ChaptersLLMOutput = z.infer<typeof ChaptersLLMOutput>;

export const HighlightsLLMOutput = z.object({
  highlights: z.array(
    z.object({ type: HighlightTypeSchema, title: z.string().min(1), start_ms: ms, end_ms: ms }),
  ),
});
export type HighlightsLLMOutput = z.infer<typeof HighlightsLLMOutput>;

export const MeetingTypeLLMOutput = z.object({
  meeting_type: MeetingTypeSchema,
  title: z.string().min(1).max(120).optional(), // suggested title for uploads
});
export type MeetingTypeLLMOutput = z.infer<typeof MeetingTypeLLMOutput>;

// ---------------------------------------------------------------------------
// Transcript edit (P3)
// ---------------------------------------------------------------------------

/** PATCH /api/segments/:id */
export const UpdateSegmentRequest = z.object({
  text: z.string().min(1).optional(),
  participant_id: id.nullable().optional(),
});
export type UpdateSegmentRequest = z.infer<typeof UpdateSegmentRequest>;
export const UpdateSegmentResponse = z.object({ segment: TranscriptSegmentSchema });
export type UpdateSegmentResponse = z.infer<typeof UpdateSegmentResponse>;

// ---------------------------------------------------------------------------
// Playlists (P3)
// ---------------------------------------------------------------------------

/** GET /api/playlists */
export const ListPlaylistsResponse = z.object({
  playlists: z.array(PlaylistSchema.extend({ item_count: z.number().int().nonnegative() })),
});
export type ListPlaylistsResponse = z.infer<typeof ListPlaylistsResponse>;

/** POST /api/playlists */
export const CreatePlaylistRequest = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
});
export type CreatePlaylistRequest = z.infer<typeof CreatePlaylistRequest>;

export const PlaylistItemSchema = z.object({
  id,
  playlist_id: id,
  meeting_id: id.nullable(),
  highlight_id: id.nullable(),
  position: z.number().int().nonnegative(),
});

/** GET /api/playlists/:id — items resolved to their meeting row (meeting items) or clip payload (highlight items). */
export const PlaylistItemDetailSchema = PlaylistItemSchema.extend({
  meeting: MeetingListItemSchema.nullable(), // for highlight items: the clip's source meeting
  clip: ClipDetailSchema.nullable(), // null for whole-meeting items
});
export const GetPlaylistResponse = z.object({
  playlist: PlaylistSchema.extend({ item_count: z.number().int().nonnegative() }),
  items: z.array(PlaylistItemDetailSchema), // ordered by position; items whose target was deleted are dropped
});
export type GetPlaylistResponse = z.infer<typeof GetPlaylistResponse>;

/** DELETE /api/playlists/:id/items/:itemId → Ok */

/** POST /api/playlists/:id/items */
export const AddPlaylistItemRequest = z
  .object({ meeting_id: id.optional(), highlight_id: id.optional() })
  .refine((v) => !!v.meeting_id !== !!v.highlight_id, "Provide exactly one of meeting_id / highlight_id");
export type AddPlaylistItemRequest = z.infer<typeof AddPlaylistItemRequest>;

// ===========================================================================
// PHASE 5 — full Fathom feature parity (additive). Route map: ARCHITECTURE.md §10.
// Writes require the demo-session cookie like every other mutation.
// ===========================================================================

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a #rrggbb color");
const qBool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");
const dateStr = z.string().min(1); // ISO date or datetime

export const ShareScopeSchema = z.enum(SHARE_SCOPES);
export const MeetingSortSchema = z.enum(MEETING_SORTS);
export const BotPlatformSchema = z.enum(BOT_PLATFORMS);
export const BotStateSchema = z.enum(BOT_STATES);
export const AutoRecordRuleSchema = z.enum(AUTO_RECORD_RULES);
export const CalendarSourceSchema = z.enum(CALENDAR_SOURCES);
export const InsightsRangeSchema = z.enum(INSIGHTS_RANGES);
export const DealStageSchema = z.enum(DEAL_STAGES);
export const ReactionEmojiSchema = z.enum(REACTION_EMOJIS);
export const DownloadFormatSchema = z.enum(DOWNLOAD_FORMATS);
export const WebhookEventSchema = z.enum(WEBHOOK_EVENTS);
export const CrmProviderSchema = z.enum(CRM_PROVIDERS);
export const TeamRoleSchema = z.enum(TEAM_ROLES);
export const MemberStatusSchema = z.enum(MEMBER_STATUSES);
export const AuthModeSchema = z.enum(AUTH_MODES);
export const NotificationKindSchema = z.enum(NOTIFICATION_KINDS);
export const BulkMeetingActionSchema = z.enum(BULK_MEETING_ACTIONS);

// ---------------------------------------------------------------------------
// A. Library: list filters, bulk actions, folders
// ---------------------------------------------------------------------------

/**
 * GET /api/meetings?scope=&folder_id=&q=&meeting_type=&participant=&company=&from=&to=&has_action_items=&starred=&trash=&sort=
 * Response stays `ListMeetingsResponse` (+ optional `folders`). No params = previous behaviour (all non-deleted, newest first).
 */
export const ListMeetingsQuery = z.object({
  scope: z.union([ShareScopeSchema, z.literal("all")]).optional(),
  folder_id: z.string().min(1).optional(), // folder id or "none"
  q: z.string().trim().max(200).optional(),
  meeting_type: MeetingTypeSchema.optional(),
  participant: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  has_action_items: qBool.optional(),
  starred: qBool.optional(),
  trash: qBool.optional(),
  sort: MeetingSortSchema.optional(),
}) satisfies z.ZodType<MeetingListFilters, unknown>;
export type ListMeetingsQuery = z.infer<typeof ListMeetingsQuery>;

/** POST /api/meetings/bulk — move/star/unstar/delete/restore many calls. */
export const BulkMeetingsRequest = z
  .object({
    meeting_ids: z.array(id).min(1).max(500),
    action: BulkMeetingActionSchema,
    folder_id: id.nullable().optional(), // required (nullable) when action = "move"
  })
  .refine((v) => v.action !== "move" || v.folder_id !== undefined, "folder_id is required for move");
export type BulkMeetingsRequest = z.infer<typeof BulkMeetingsRequest>;
export const BulkMeetingsResponse = z.object({ updated: z.number().int().nonnegative() });
export type BulkMeetingsResponse = z.infer<typeof BulkMeetingsResponse>;

/** DELETE /api/meetings/:id → Ok (soft delete; restore with PATCH {deleted:false} or bulk "restore"). */


/** GET /api/folders */
export const ListFoldersResponse = z.object({ folders: z.array(FolderWithCountSchema) });
export type ListFoldersResponse = z.infer<typeof ListFoldersResponse>;

/** POST /api/folders */
export const CreateFolderRequest = z.object({
  name: z.string().trim().min(1).max(80),
  color: hex.nullable().optional(),
});
export type CreateFolderRequest = z.infer<typeof CreateFolderRequest>;
export const FolderResponse = z.object({ folder: FolderWithCountSchema });
export type FolderResponse = z.infer<typeof FolderResponse>;

/** PATCH /api/folders/:id */
export const UpdateFolderRequest = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: hex.nullable().optional(),
});
export type UpdateFolderRequest = z.infer<typeof UpdateFolderRequest>;

/** DELETE /api/folders/:id → Ok (meetings inside move to "no folder"; never deleted). */

/** POST /api/folders/:id/meetings — move calls into this folder (use folder id "none" to remove from folders). */
export const MoveToFolderRequest = z.object({ meeting_ids: z.array(id).min(1).max(500) });
export type MoveToFolderRequest = z.infer<typeof MoveToFolderRequest>;
export const MoveToFolderResponse = BulkMeetingsResponse;

// ---------------------------------------------------------------------------
// B. Capture: bots + calendar
// ---------------------------------------------------------------------------

export const BotStateEventSchema = z.object({ state: BotStateSchema, at: isoTs, note: z.string().nullable() });

export const BotSessionSchema = z.object({
  id,
  workspace_id: id,
  meeting_url: z.string(),
  platform: BotPlatformSchema,
  title: z.string(),
  state: BotStateSchema,
  simulated: z.boolean(),
  meeting_id: id.nullable(),
  error: z.string().nullable(),
  events: z.array(BotStateEventSchema),
  created_at: isoTs,
  joined_at: isoTs.nullable(),
  admitted_at: isoTs.nullable(),
  recording_ended_at: isoTs.nullable(),
  completed_at: isoTs.nullable(),
  updated_at: isoTs,
}) satisfies z.ZodType<BotSession>;

/** POST /api/bots — "Send Fanthom to a live meeting". Platform detected from URL (zoom.us / meet.google.com / teams.microsoft.com|teams.live.com). */
export const CreateBotSessionRequest = z.object({
  meeting_url: z.string().trim().url().max(2000),
  title: z.string().trim().max(200).optional(),
});
export type CreateBotSessionRequest = z.infer<typeof CreateBotSessionRequest>;
export const BotSessionResponse = z.object({ session: BotSessionSchema });
export type BotSessionResponse = z.infer<typeof BotSessionResponse>;

/** GET /api/bots — recent sessions, newest first. */
export const ListBotSessionsResponse = z.object({ sessions: z.array(BotSessionSchema) });
export type ListBotSessionsResponse = z.infer<typeof ListBotSessionsResponse>;

/**
 * POST /api/bots/:id/advance — drive the simulated state machine.
 * `next`: joining→waiting_room→recording→processing→done (done creates the meeting); `stop`: recording→processing;
 * `fail`: any non-terminal → failed. Illegal transitions → 409 `conflict`. GET /api/bots/:id → BotSessionResponse
 * (the UI polls it; the server may also auto-advance by elapsed time).
 */
export const AdvanceBotSessionRequest = z.object({
  action: z.enum(["next", "stop", "fail"]).default("next"),
  note: z.string().max(500).optional(),
});
export type AdvanceBotSessionRequest = z.infer<typeof AdvanceBotSessionRequest>;

export const CalendarEventSchema = UpcomingMeetingSchema.extend({
  meeting_url: z.string().nullable(),
  platform: BotPlatformSchema,
  organizer_email: z.string().nullable(),
  is_external: z.boolean(),
  source: CalendarSourceSchema,
  record_override: z.boolean().nullable(),
  record: z.boolean(),
}) satisfies z.ZodType<CalendarEvent>;

/** GET /api/calendar?from=&to= (default: current week Mon..Sun). */
export const CalendarQuery = z.object({ from: dateStr.optional(), to: dateStr.optional() });
export type CalendarQuery = z.infer<typeof CalendarQuery>;
export const CalendarResponse = z.object({
  events: z.array(CalendarEventSchema), // ordered by start
  auto_record_rule: AutoRecordRuleSchema,
  calendar_connected: z.boolean(),
});
export type CalendarResponse = z.infer<typeof CalendarResponse>;

/** PATCH /api/calendar/:eventId — per-event Record toggle (null = follow rule). */
export const UpdateCalendarEventRequest = z.object({ record: z.boolean().nullable() });
export type UpdateCalendarEventRequest = z.infer<typeof UpdateCalendarEventRequest>;
export const CalendarEventResponse = z.object({ event: CalendarEventSchema });
export type CalendarEventResponse = z.infer<typeof CalendarEventResponse>;

// ---------------------------------------------------------------------------
// C. Insights: coaching, dashboard, trackers, deals
// ---------------------------------------------------------------------------

const FillerWordCountSchema = z.object({ word: z.string(), count: z.number().int().nonnegative() });

export const SpeakerCoachingMetricsSchema = z.object({
  participant_id: id,
  name: z.string(),
  color: z.string(),
  is_external: z.boolean(),
  talk_ms: ms,
  talk_pct: z.number(),
  segment_count: z.number().int().nonnegative(),
  words: z.number().int().nonnegative(),
  words_per_minute: z.number(),
  longest_monologue_ms: ms,
  longest_monologue_start_ms: ms.nullable(),
  questions_asked: z.number().int().nonnegative(),
  filler_words: z.number().int().nonnegative(),
  filler_per_100_words: z.number(),
  filler_breakdown: z.array(FillerWordCountSchema),
  interruptions: z.number().int().nonnegative(),
  avg_patience_ms: z.number(),
}) satisfies z.ZodType<SpeakerCoachingMetrics>;

export const CoachingMetricsSchema = z.object({
  meeting_id: id,
  duration_ms: ms,
  total_talk_ms: ms,
  silence_ms: ms,
  speaker_switches: z.number().int().nonnegative(),
  questions_asked: z.number().int().nonnegative(),
  filler_words: z.number().int().nonnegative(),
  interruptions: z.number().int().nonnegative(),
  avg_patience_ms: z.number(),
  internal_talk_pct: z.number(),
  external_talk_pct: z.number(),
  speakers: z.array(SpeakerCoachingMetricsSchema),
}) satisfies z.ZodType<CoachingMetrics>;

/** GET /api/meetings/:id/coaching (also works for share-page consumers server-side). */
export const CoachingResponse = z.object({ metrics: CoachingMetricsSchema });
export type CoachingResponse = z.infer<typeof CoachingResponse>;

export const InsightsSummarySchema = z.object({
  range: InsightsRangeSchema,
  from: isoTs.nullable(),
  to: isoTs,
  totals: z.object({
    meetings: z.number().int().nonnegative(),
    hours_recorded: z.number(),
    avg_duration_min: z.number(),
    external_meetings: z.number().int().nonnegative(),
    action_items: z.number().int().nonnegative(),
    open_action_items: z.number().int().nonnegative(),
    highlights: z.number().int().nonnegative(),
  }),
  weekly: z.array(
    z.object({
      week_start: z.string(),
      meetings: z.number().int().nonnegative(),
      hours: z.number(),
      external_meetings: z.number().int().nonnegative(),
      avg_talk_pct_me: z.number().nullable(),
      questions: z.number().int().nonnegative(),
    }),
  ),
  by_person: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      color: z.string(),
      is_external: z.boolean(),
      meetings: z.number().int().nonnegative(),
      total_talk_ms: ms,
      avg_talk_pct: z.number(),
      avg_words_per_minute: z.number(),
      avg_questions: z.number(),
      avg_filler_per_100_words: z.number(),
      avg_longest_monologue_ms: z.number(),
      avg_patience_ms: z.number(),
      total_interruptions: z.number().int().nonnegative(),
    }),
  ),
  by_type: z.array(z.object({ meeting_type: MeetingTypeSchema, meetings: z.number().int(), hours: z.number() })),
  meeting_load: z.array(z.object({ day: z.number().int(), hour: z.number().int(), meetings: z.number().int() })),
  top_trackers: z.array(z.object({ tracker_id: id, name: z.string(), color: z.string(), hits: z.number().int() })),
}) satisfies z.ZodType<InsightsSummary>;

/** GET /api/insights?range=30d&internal_only=true */
export const InsightsQuery = z.object({
  range: InsightsRangeSchema.default("30d"),
  internal_only: qBool.optional(), // by_person without external people
});
export type InsightsQuery = z.infer<typeof InsightsQuery>;
export const InsightsResponse = InsightsSummarySchema;
export type InsightsResponse = z.infer<typeof InsightsResponse>;

export const TrackerSchema = z.object({
  id,
  workspace_id: id,
  name: z.string(),
  description: z.string().nullable(),
  keywords: z.array(z.string()),
  color: z.string(),
  created_at: isoTs,
}) satisfies z.ZodType<Tracker>;
export const TrackerWithStatsSchema = TrackerSchema.extend({
  hit_count: z.number().int().nonnegative(),
  meeting_count: z.number().int().nonnegative(),
  last_hit_at: isoTs.nullable(),
}) satisfies z.ZodType<TrackerWithStats>;
export const TrackerHitSchema = z.object({
  tracker_id: id,
  keyword: z.string(),
  meeting_id: id,
  meeting_title: z.string(),
  meeting_date: isoTs.nullable(),
  segment_id: id,
  participant_id: id.nullable(),
  speaker_name: z.string(),
  speaker_color: z.string().nullable(),
  start_ms: ms,
  snippet: z.string(),
}) satisfies z.ZodType<TrackerHit>;

/** GET /api/trackers */
export const ListTrackersResponse = z.object({ trackers: z.array(TrackerWithStatsSchema) });
export type ListTrackersResponse = z.infer<typeof ListTrackersResponse>;

/** POST /api/trackers */
export const CreateTrackerRequest = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
  color: hex.optional(),
});
export type CreateTrackerRequest = z.infer<typeof CreateTrackerRequest>;
/** PATCH /api/trackers/:id */
export const UpdateTrackerRequest = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(50).optional(),
  color: hex.optional(),
});
export type UpdateTrackerRequest = z.infer<typeof UpdateTrackerRequest>;
export const TrackerResponse = z.object({ tracker: TrackerWithStatsSchema });
export type TrackerResponse = z.infer<typeof TrackerResponse>;
/** DELETE /api/trackers/:id → Ok */

/** GET /api/trackers/:id/hits?meeting_id=&limit= — newest meeting first, then start_ms. */
export const TrackerHitsQuery = z.object({
  meeting_id: id.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export type TrackerHitsQuery = z.infer<typeof TrackerHitsQuery>;
export const TrackerHitsResponse = z.object({
  tracker: TrackerWithStatsSchema,
  hits: z.array(TrackerHitSchema),
  by_meeting: z.array(z.object({ meeting_id: id, meeting_title: z.string(), meeting_date: isoTs.nullable(), hits: z.number().int() })),
  by_keyword: z.array(z.object({ keyword: z.string(), hits: z.number().int() })),
});
export type TrackerHitsResponse = z.infer<typeof TrackerHitsResponse>;

/** GET /api/meetings/:id/trackers — every tracker's hits inside one call (timeline markers on the call page). */
export const MeetingTrackerHitsResponse = z.object({
  trackers: z.array(TrackerSchema),
  hits: z.array(TrackerHitSchema), // ordered by start_ms
});
export type MeetingTrackerHitsResponse = z.infer<typeof MeetingTrackerHitsResponse>;

const nstr = z.string().nullable();
export const BantFieldsSchema = z.object({ budget: nstr, authority: nstr, need: nstr, timeline: nstr }) satisfies z.ZodType<BantFields>;
export const MeddpiccFieldsSchema = z.object({
  metrics: nstr,
  economic_buyer: nstr,
  decision_criteria: nstr,
  decision_process: nstr,
  paper_process: nstr,
  identify_pain: nstr,
  champion: nstr,
  competition: nstr,
}) satisfies z.ZodType<MeddpiccFields>;
export const DealFieldsSchema = z.object({
  stage: DealStageSchema,
  amount: z.number().nullable(),
  close_date: z.string().nullable(),
  bant: BantFieldsSchema,
  meddpicc: MeddpiccFieldsSchema,
}) satisfies z.ZodType<DealFields>;

export const StakeholderSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  color: z.string(),
  meeting_count: z.number().int().nonnegative(),
  talk_ms: ms,
  last_seen: isoTs.nullable(),
}) satisfies z.ZodType<Stakeholder>;

export const CompanySummarySchema = z.object({
  domain: z.string(),
  name: z.string(),
  meeting_count: z.number().int().nonnegative(),
  first_meeting_at: isoTs.nullable(),
  last_meeting_at: isoTs.nullable(),
  stakeholder_count: z.number().int().nonnegative(),
  stage: DealStageSchema,
  latest_meeting_id: id.nullable(),
  latest_meeting_title: z.string().nullable(),
}) satisfies z.ZodType<CompanySummary>;

export const CompanyDetailSchema = CompanySummarySchema.extend({
  meetings: z.array(MeetingListItemSchema),
  stakeholders: z.array(StakeholderSchema),
  internal_team: z.array(StakeholderSchema),
  latest_summary: SummarySchema.nullable(),
  next_steps: z.array(z.object({ text: z.string(), meeting_id: id, start_ms: ms.nullable(), completed: z.boolean() })),
  fields: DealFieldsSchema,
  timeline: z.array(
    z.object({ meeting_id: id, title: z.string(), date: isoTs.nullable(), meeting_type: MeetingTypeSchema, headline: z.string().nullable() }),
  ),
}) satisfies z.ZodType<CompanyDetail>;

/** GET /api/deals — companies from external calls, most recent activity first. */
export const ListDealsResponse = z.object({ companies: z.array(CompanySummarySchema) });
export type ListDealsResponse = z.infer<typeof ListDealsResponse>;
/** GET /api/deals/:domain */
export const DealResponse = z.object({ company: CompanyDetailSchema });
export type DealResponse = z.infer<typeof DealResponse>;
/** PATCH /api/deals/:domain — save user overrides (merged over derived fields). Returns DealResponse. */
export const UpdateDealRequest = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  stage: DealStageSchema.optional(),
  amount: z.number().nonnegative().nullable().optional(),
  close_date: z.string().nullable().optional(),
  bant: BantFieldsSchema.partial().optional(),
  meddpicc: MeddpiccFieldsSchema.partial().optional(),
});
export type UpdateDealRequest = z.infer<typeof UpdateDealRequest>;

// ---------------------------------------------------------------------------
// D. Collaboration: comments, reactions, downloads, highlight trim
// ---------------------------------------------------------------------------

export const CommentSchema = z.object({
  id,
  meeting_id: id,
  timestamp_ms: ms.nullable(),
  body: z.string(),
  mentions: z.array(id),
  author_id: id,
  author_name: z.string(),
  author_color: z.string(),
  parent_id: id.nullable(),
  created_at: isoTs,
  updated_at: isoTs.nullable(),
}) satisfies z.ZodType<Comment>;

/** GET /api/meetings/:id/comments — ordered by timestamp_ms (nulls last) then created_at. */
export const ListCommentsResponse = z.object({ comments: z.array(CommentSchema) });
export type ListCommentsResponse = z.infer<typeof ListCommentsResponse>;
/** POST /api/meetings/:id/comments — author = current user; each mention creates a `mention` Notification. */
export const CreateCommentRequest = z.object({
  body: z.string().trim().min(1).max(4000),
  timestamp_ms: ms.nullable().optional(),
  mentions: z.array(id).max(50).optional(),
  parent_id: id.nullable().optional(),
});
export type CreateCommentRequest = z.infer<typeof CreateCommentRequest>;
/** PATCH /api/comments/:id (author only) */
export const UpdateCommentRequest = z.object({
  body: z.string().trim().min(1).max(4000).optional(),
  mentions: z.array(id).max(50).optional(),
  timestamp_ms: ms.nullable().optional(),
});
export type UpdateCommentRequest = z.infer<typeof UpdateCommentRequest>;
export const CommentResponse = z.object({ comment: CommentSchema });
export type CommentResponse = z.infer<typeof CommentResponse>;
/** DELETE /api/comments/:id → Ok (also deletes replies) */

export const ReactionSchema = z.object({
  id,
  meeting_id: id,
  segment_id: id,
  emoji: ReactionEmojiSchema,
  user_id: id,
  user_name: z.string(),
  created_at: isoTs,
}) satisfies z.ZodType<Reaction>;
export const ReactionSummarySchema = z.object({
  segment_id: id,
  emoji: ReactionEmojiSchema,
  count: z.number().int().positive(),
  reacted_by_me: z.boolean(),
  user_names: z.array(z.string()),
}) satisfies z.ZodType<ReactionSummary>;

/** GET /api/meetings/:id/reactions */
export const ListReactionsResponse = z.object({ reactions: z.array(ReactionSummarySchema) });
export type ListReactionsResponse = z.infer<typeof ListReactionsResponse>;
/** POST /api/segments/:id/reactions — toggle current user's emoji on a transcript line. */
export const ToggleReactionRequest = z.object({ emoji: ReactionEmojiSchema });
export type ToggleReactionRequest = z.infer<typeof ToggleReactionRequest>;
export const ToggleReactionResponse = z.object({
  added: z.boolean(),
  segment_id: id,
  reactions: z.array(ReactionSummarySchema), // all summaries for this segment after the toggle
});
export type ToggleReactionResponse = z.infer<typeof ToggleReactionResponse>;

/**
 * GET /api/meetings/:id/download?format=transcript_txt|transcript_srt|transcript_vtt|transcript_md|summary_md|recording
 * &template=&language= (summary_md only; default = newest summary).
 * Returns the file with `Content-Disposition: attachment; filename="<slug>.<ext>"` (NOT JSON).
 * `recording` → 302 redirect to media_url (404 when none).
 */
export const DownloadQuery = z.object({
  format: DownloadFormatSchema,
  template: SummaryTemplateKeySchema.optional(),
  language: SummaryLanguageSchema.optional(),
});
export type DownloadQuery = z.infer<typeof DownloadQuery>;

/**
 * Clip trim editor uses the existing PATCH /api/highlights/:id with {start_ms, end_ms}.
 * This schema adds the validation the handler applies when both are present (end > start, ≤ 10 min).
 */
export const TrimHighlightRequest = z
  .object({ start_ms: ms, end_ms: ms })
  .refine((v) => v.end_ms > v.start_ms, "end_ms must be after start_ms")
  .refine((v) => v.end_ms - v.start_ms <= 10 * 60 * 1000, "Clips are limited to 10 minutes");
export type TrimHighlightRequest = z.infer<typeof TrimHighlightRequest>;

// ---------------------------------------------------------------------------
// D. Integrations: webhooks, Slack, CRM, email recap
// ---------------------------------------------------------------------------

export const WebhookSchema = z.object({
  id,
  workspace_id: id,
  url: z.string(),
  description: z.string().nullable(),
  events: z.array(WebhookEventSchema),
  secret: z.string(),
  active: z.boolean(),
  last_status: z.number().int().nullable(),
  last_delivery_at: isoTs.nullable(),
  created_at: isoTs,
}) satisfies z.ZodType<Webhook>;
export const WebhookDeliverySchema = z.object({
  id,
  webhook_id: id,
  event: WebhookEventSchema,
  test: z.boolean(),
  request_body: z.string(),
  status_code: z.number().int().nullable(),
  ok: z.boolean(),
  response_body: z.string().nullable(),
  error: z.string().nullable(),
  duration_ms: z.number().nonnegative(),
  created_at: isoTs,
}) satisfies z.ZodType<WebhookDelivery>;

/** https only (http allowed for localhost in dev); private-network hosts rejected server-side (SSRF guard). */
const webhookUrl = z.string().trim().url().max(2000);

/** GET /api/integrations/webhooks */
export const ListWebhooksResponse = z.object({ webhooks: z.array(WebhookSchema) });
export type ListWebhooksResponse = z.infer<typeof ListWebhooksResponse>;
/** POST /api/integrations/webhooks — server generates `secret`. */
export const CreateWebhookRequest = z.object({
  url: webhookUrl,
  description: z.string().max(200).nullable().optional(),
  events: z.array(WebhookEventSchema).min(1).default(["meeting.ready"]),
  active: z.boolean().default(true),
});
export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequest>;
/** PATCH /api/integrations/webhooks/:id */
export const UpdateWebhookRequest = z.object({
  url: webhookUrl.optional(),
  description: z.string().max(200).nullable().optional(),
  events: z.array(WebhookEventSchema).min(1).optional(),
  active: z.boolean().optional(),
  rotate_secret: z.boolean().optional(),
});
export type UpdateWebhookRequest = z.infer<typeof UpdateWebhookRequest>;
export const WebhookResponse = z.object({ webhook: WebhookSchema });
export type WebhookResponse = z.infer<typeof WebhookResponse>;
/** DELETE /api/integrations/webhooks/:id → Ok */

/** POST /api/integrations/webhooks/:id/test — REAL POST of a sample `meeting.ready` payload (latest ready meeting unless meeting_id). */
export const TestWebhookRequest = z.object({ meeting_id: id.optional() });
export type TestWebhookRequest = z.infer<typeof TestWebhookRequest>;
export const WebhookDeliveryResponse = z.object({ delivery: WebhookDeliverySchema });
export type WebhookDeliveryResponse = z.infer<typeof WebhookDeliveryResponse>;

/** GET /api/integrations/webhooks/:id/deliveries — newest first, max 50. */
export const ListWebhookDeliveriesResponse = z.object({ deliveries: z.array(WebhookDeliverySchema) });
export type ListWebhookDeliveriesResponse = z.infer<typeof ListWebhookDeliveriesResponse>;

export const SlackConfigViewSchema = z.object({
  workspace_id: id,
  channel_label: z.string().nullable(),
  auto_post_on_ready: z.boolean(),
  include_summary: z.boolean(),
  include_action_items: z.boolean(),
  include_highlights: z.boolean(),
  updated_at: isoTs,
  connected: z.boolean(),
  webhook_url_masked: z.string().nullable(),
}) satisfies z.ZodType<SlackConfigView>;

/** GET /api/integrations/slack */
export const SlackConfigResponse = z.object({ config: SlackConfigViewSchema });
export type SlackConfigResponse = z.infer<typeof SlackConfigResponse>;
/** PUT /api/integrations/slack — `webhook_url` must start with https://hooks.slack.com/ ; null disconnects. */
export const UpdateSlackConfigRequest = z.object({
  webhook_url: z
    .string()
    .trim()
    .regex(/^https:\/\/hooks\.slack\.com\//, "Must be a Slack incoming-webhook URL (https://hooks.slack.com/...)")
    .nullable()
    .optional(),
  channel_label: z.string().max(80).nullable().optional(),
  auto_post_on_ready: z.boolean().optional(),
  include_summary: z.boolean().optional(),
  include_action_items: z.boolean().optional(),
  include_highlights: z.boolean().optional(),
});
export type UpdateSlackConfigRequest = z.infer<typeof UpdateSlackConfigRequest>;

/**
 * POST /api/meetings/:id/slack — REAL post of the meeting recap to the configured Slack webhook.
 * POST /api/integrations/slack/test — posts a short test message (no body).
 * 409 `conflict` when Slack is not connected.
 */
export const SendToSlackRequest = z.object({
  template: SummaryTemplateKeySchema.optional(),
  note: z.string().max(1000).optional(), // optional message prepended
});
export type SendToSlackRequest = z.infer<typeof SendToSlackRequest>;
export const SendToSlackResponse = z.object({
  ok: z.boolean(),
  status_code: z.number().int().nullable(),
  error: z.string().nullable(),
  preview_text: z.string(), // the mrkdwn text that was sent
});
export type SendToSlackResponse = z.infer<typeof SendToSlackResponse>;

export const CrmFieldMappingSchema = z.object({
  crm_object: z.string(),
  crm_field: z.string(),
  label: z.string(),
  value: z.string(),
  source: z.enum(["summary", "action_items", "participants", "meeting", "deal_fields"]),
}) satisfies z.ZodType<CrmFieldMapping>;
export const CrmSyncPreviewSchema = z.object({
  meeting_id: id,
  provider: CrmProviderSchema,
  company_domain: z.string().nullable(),
  fields: z.array(CrmFieldMappingSchema),
  connected: z.boolean(),
}) satisfies z.ZodType<CrmSyncPreview>;
export const CrmSyncLogSchema = z.object({
  id,
  meeting_id: id,
  provider: CrmProviderSchema,
  status: z.enum(["simulated", "success", "failed"]),
  field_count: z.number().int().nonnegative(),
  fields: z.array(CrmFieldMappingSchema),
  message: z.string(),
  created_at: isoTs,
}) satisfies z.ZodType<CrmSyncLog>;

/** GET /api/meetings/:id/crm?provider=hubspot — field-mapping preview. */
export const CrmPreviewQuery = z.object({ provider: CrmProviderSchema.default("hubspot") });
export type CrmPreviewQuery = z.infer<typeof CrmPreviewQuery>;
export const CrmPreviewResponse = z.object({ preview: CrmSyncPreviewSchema });
export type CrmPreviewResponse = z.infer<typeof CrmPreviewResponse>;
/** POST /api/meetings/:id/crm — "Sync" (simulated: writes a CrmSyncLog with status "simulated"). */
export const CrmSyncRequest = z.object({
  provider: CrmProviderSchema,
  fields: z.array(CrmFieldMappingSchema).optional(), // user-edited mapping; default = preview
});
export type CrmSyncRequest = z.infer<typeof CrmSyncRequest>;
export const CrmSyncResponse = z.object({ log: CrmSyncLogSchema });
export type CrmSyncResponse = z.infer<typeof CrmSyncResponse>;
/** GET /api/integrations/crm/logs?meeting_id= — newest first. */
export const CrmLogsResponse = z.object({ logs: z.array(CrmSyncLogSchema) });
export type CrmLogsResponse = z.infer<typeof CrmLogsResponse>;

export const EmailRecapSchema = z.object({
  subject: z.string(),
  to: z.array(z.string()),
  html: z.string(),
  text: z.string(),
}) satisfies z.ZodType<EmailRecap>;
/** POST /api/meetings/:id/email-recap — preview only (never sent). */
export const EmailRecapRequest = z.object({
  template: SummaryTemplateKeySchema.optional(),
  include_action_items: z.boolean().default(true),
  include_highlights: z.boolean().default(true),
  recipients: z.enum(["all", "internal", "external"]).default("all"),
});
export type EmailRecapRequest = z.infer<typeof EmailRecapRequest>;
export const EmailRecapResponse = z.object({ recap: EmailRecapSchema });
export type EmailRecapResponse = z.infer<typeof EmailRecapResponse>;

// ---------------------------------------------------------------------------
// E. Account, team, notifications, prefs
// ---------------------------------------------------------------------------

export const WorkspaceSchema = z.object({ id, name: z.string(), domain: z.string() }) satisfies z.ZodType<Workspace>;
export const UserSchema = z.object({ id, workspace_id: id, name: z.string(), email: z.string() }) satisfies z.ZodType<User>;

export const TeamMemberSchema = z.object({
  id,
  workspace_id: id,
  name: z.string(),
  email: z.string(),
  role: TeamRoleSchema,
  title: z.string().nullable(),
  team: z.string().nullable(),
  color: z.string(),
  status: MemberStatusSchema,
  invited_at: isoTs.nullable(),
  joined_at: isoTs.nullable(),
}) satisfies z.ZodType<TeamMember>;

/** GET /api/me */
export const MeResponse = z.object({
  user: UserSchema,
  workspace: WorkspaceSchema,
  member: TeamMemberSchema,
  auth_mode: AuthModeSchema,
}) satisfies z.ZodType<CurrentSession>;
export type MeResponse = z.infer<typeof MeResponse>;

/** GET /api/team */
export const ListTeamResponse = z.object({ members: z.array(TeamMemberSchema) });
export type ListTeamResponse = z.infer<typeof ListTeamResponse>;
/** POST /api/team/invite — stub: creates `invited` members, no email is sent. */
export const InviteTeamRequest = z.object({
  emails: z.array(z.string().trim().email()).min(1).max(50),
  role: TeamRoleSchema.exclude(["owner"]).default("member"),
});
export type InviteTeamRequest = z.infer<typeof InviteTeamRequest>;
export const InviteTeamResponse = z.object({ members: z.array(TeamMemberSchema) });
export type InviteTeamResponse = z.infer<typeof InviteTeamResponse>;
/** PATCH /api/team/:id — change role (owner/admin only; the last owner cannot be demoted → 409). */
export const UpdateTeamMemberRequest = z.object({ role: TeamRoleSchema.exclude(["owner"]) });
export type UpdateTeamMemberRequest = z.infer<typeof UpdateTeamMemberRequest>;
export const TeamMemberResponse = z.object({ member: TeamMemberSchema });
export type TeamMemberResponse = z.infer<typeof TeamMemberResponse>;
/** DELETE /api/team/:id → Ok (removes member / revokes invite; cannot remove self). */

export const NotificationSchema = z.object({
  id,
  user_id: id,
  kind: NotificationKindSchema,
  title: z.string(),
  body: z.string().nullable(),
  href: z.string().nullable(),
  meeting_id: id.nullable(),
  actor_name: z.string().nullable(),
  read_at: isoTs.nullable(),
  created_at: isoTs,
}) satisfies z.ZodType<Notification>;

/** GET /api/notifications?unread=true&limit= — newest first. */
export const ListNotificationsQuery = z.object({
  unread: qBool.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuery>;
export const ListNotificationsResponse = z.object({
  notifications: z.array(NotificationSchema),
  unread_count: z.number().int().nonnegative(),
});
export type ListNotificationsResponse = z.infer<typeof ListNotificationsResponse>;
/** POST /api/notifications/read — mark some (`ids`) or all (`all: true`) as read. */
export const MarkNotificationsReadRequest = z
  .object({ ids: z.array(id).optional(), all: z.boolean().optional() })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, "Provide ids or all:true");
export type MarkNotificationsReadRequest = z.infer<typeof MarkNotificationsReadRequest>;
export const MarkNotificationsReadResponse = z.object({ unread_count: z.number().int().nonnegative() });
export type MarkNotificationsReadResponse = z.infer<typeof MarkNotificationsReadResponse>;

export const UserPrefsSchema = z.object({
  user_id: id,
  default_template: SummaryTemplateKeySchema,
  default_language: SummaryLanguageSchema,
  default_share_access: ShareAccessSchema,
  auto_record_rule: AutoRecordRuleSchema,
  email_recap_enabled: z.boolean(),
  notify_meeting_ready: z.boolean(),
  notify_mentions: z.boolean(),
  notify_shared: z.boolean(),
  calendar_connected: z.boolean(),
  onboarding_completed: z.boolean(),
  updated_at: isoTs,
}) satisfies z.ZodType<UserPrefs>;

/** GET /api/prefs */
export const PrefsResponse = z.object({ prefs: UserPrefsSchema });
export type PrefsResponse = z.infer<typeof PrefsResponse>;
/** PATCH /api/prefs */
export const UpdatePrefsRequest = UserPrefsSchema.omit({ user_id: true, updated_at: true }).partial();
export type UpdatePrefsRequest = z.infer<typeof UpdatePrefsRequest>;

// ---------------------------------------------------------------------------
// Route map
// ---------------------------------------------------------------------------

export { ROUTES } from "./routes";

