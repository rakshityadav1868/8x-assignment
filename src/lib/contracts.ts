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
  code: z.string().optional(), // e.g. "not_found", "forbidden", "validation", "llm_failed"
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
});
export type ListMeetingsResponse = z.infer<typeof ListMeetingsResponse>;

/** GET /api/meetings/:id → MeetingDetail */
export const GetMeetingResponse = MeetingDetailSchema;
export type GetMeetingResponse = z.infer<typeof GetMeetingResponse>;

/** PATCH /api/meetings/:id — meeting-type badge edit, rename. */
export const UpdateMeetingRequest = z
  .object({
    title: z.string().min(1).max(200).optional(),
    meeting_type: MeetingTypeSchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.meeting_type !== undefined, "Nothing to update");
export type UpdateMeetingRequest = z.infer<typeof UpdateMeetingRequest>;
export const UpdateMeetingResponse = z.object({ meeting: MeetingSchema });
export type UpdateMeetingResponse = z.infer<typeof UpdateMeetingResponse>;

// ---------------------------------------------------------------------------
// Upload + processing
// ---------------------------------------------------------------------------

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

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

/** POST /api/playlists/:id/items */
export const AddPlaylistItemRequest = z
  .object({ meeting_id: id.optional(), highlight_id: id.optional() })
  .refine((v) => !!v.meeting_id !== !!v.highlight_id, "Provide exactly one of meeting_id / highlight_id");
export type AddPlaylistItemRequest = z.infer<typeof AddPlaylistItemRequest>;

// ---------------------------------------------------------------------------
// Route map
// ---------------------------------------------------------------------------

export const ROUTES = {
  pages: {
    landing: "/", // marketing page
    calls: "/calls", // app home: My Calls
    call: (id: string) => `/calls/${id}`,
    callAt: (id: string, ms: number) => `/calls/${id}?t=${Math.floor(ms / 1000)}`,
    share: (token: string) => `/share/${token}`,
    clip: (token: string) => `/clip/${token}`,
    search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : "/search"),
    upload: "/upload",
    playlists: "/playlists",
    settings: "/settings",
  },
  api: {
    capabilities: "/api/capabilities", // GET
    meetings: "/api/meetings", // GET
    meeting: (id: string) => `/api/meetings/${id}`, // GET, PATCH
    upload: "/api/upload", // POST
    process: (id: string) => `/api/meetings/${id}/process`, // POST
    status: (id: string) => `/api/meetings/${id}/status`, // GET
    summary: (id: string) => `/api/meetings/${id}/summary`, // GET (?template&language), POST
    ask: (id: string) => `/api/meetings/${id}/ask`, // GET history, POST stream
    askGlobal: "/api/ask", // POST stream (P3)
    search: "/api/search", // GET ?q
    highlights: (meetingId: string) => `/api/meetings/${meetingId}/highlights`, // GET, POST
    highlight: (id: string) => `/api/highlights/${id}`, // PATCH, DELETE
    highlightShare: (id: string) => `/api/highlights/${id}/share`, // POST
    actionItems: (meetingId: string) => `/api/meetings/${meetingId}/action-items`, // POST
    actionItem: (id: string) => `/api/action-items/${id}`, // PATCH, DELETE
    share: (meetingId: string) => `/api/meetings/${meetingId}/share`, // POST, DELETE
    shareAccess: (token: string) => `/api/share/${token}`, // GET
    clip: (token: string) => `/api/clip/${token}`, // GET
    followUpEmail: (id: string) => `/api/meetings/${id}/follow-up-email`, // POST
    catchUp: (id: string) => `/api/meetings/${id}/catch-up`, // POST
    decisions: (id: string) => `/api/meetings/${id}/decisions`, // GET, POST
    commitments: (id: string) => `/api/meetings/${id}/commitments`, // POST
    segment: (id: string) => `/api/segments/${id}`, // PATCH (P3)
    playlists: "/api/playlists", // GET, POST
    playlistItems: (id: string) => `/api/playlists/${id}/items`, // POST
  },
} as const;
