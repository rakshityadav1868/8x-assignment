import "server-only";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { NotFoundError } from "@/lib/server/errors";
import { newId, newToken } from "@/lib/server/ids";
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
  TranscriptSegment,
  UpcomingMeeting,
} from "@/lib/types";
import type { Repo } from "./repo";

/**
 * Supabase (Postgres) repository — used when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 * Schema: supabase/migrations/0001_init.sql (columns mirror `@/lib/types` 1:1). All access uses the
 * service-role key on the server; RLS is on with no policies so the anon key can read nothing.
 * Search runs through the `search_segments` SQL function (websearch_to_tsquery + GIN + ts_headline <mark>).
 */

const MEETING_COLS =
  "id,workspace_id,title,meeting_type,scheduled_start,scheduled_end,recording_start,recording_end,duration_sec," +
  "media_url,media_kind,status,processing_stage,processing_error,transcript_language,share_token,share_access," +
  "recorded_by,synthetic,created_at";
const PARTICIPANT_COLS = "id,meeting_id,name,email,is_external,color";
const SEGMENT_COLS = "id,meeting_id,participant_id,start_ms,end_ms,text";
const PAGE = 1000; // PostgREST default max-rows

type Row = Record<string, unknown>;

function check(error: PostgrestError | null, what: string): void {
  if (error) throw new Error(`Supabase ${what} failed: ${error.message}`);
}

function data<T>(res: { data: T | null; error: PostgrestError | null }, what: string): T {
  check(res.error, what);
  return res.data as T;
}

/** Row → value, throwing NotFoundError when the row is missing. */
function found<T>(res: { data: T | null; error: PostgrestError | null }, what: string): T {
  const d = data(res, what);
  if (d == null) throw new NotFoundError(what);
  return d;
}

const meetingDate = (m: Pick<Meeting, "recording_start" | "scheduled_start" | "created_at">) =>
  m.recording_start ?? m.scheduled_start ?? m.created_at;
const byStart = (a: { start_ms: number }, b: { start_ms: number }) => a.start_ms - b.start_ms;
const normInstr = (s: string | null | undefined) => (s ?? "").trim() || null;
const chunks = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export function createSupabaseRepo(): Repo {
  const db: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let workspaceId: Promise<string> | null = null;
  function defaultWorkspace(): Promise<string> {
    workspaceId ??= (async () => {
      const rows = data(await db.from("workspaces").select("id").order("created_at").limit(1), "workspaces") as Row[];
      if (rows[0]) return rows[0].id as string;
      const created = data(
        await db.from("workspaces").insert({ name: "Fanthom Demo", domain: "fanthom.dev" }).select("id").single(),
        "create workspace",
      ) as Row;
      return created.id as string;
    })().catch((e) => {
      workspaceId = null;
      throw e;
    });
    return workspaceId;
  }

  async function allSegments(filter: (q: ReturnType<typeof segQuery>) => ReturnType<typeof segQuery>): Promise<TranscriptSegment[]> {
    const out: TranscriptSegment[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = data(await filter(segQuery()).order("start_ms").range(from, from + PAGE - 1), "segments") as TranscriptSegment[];
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }
  function segQuery() {
    return db.from("transcript_segments").select(SEGMENT_COLS);
  }

  async function getMeetingRow(id: string): Promise<Meeting | null> {
    return data(await db.from("meetings").select(MEETING_COLS).eq("id", id).maybeSingle(), "meeting") as Meeting | null;
  }
  async function requireMeeting(id: string): Promise<Meeting> {
    const m = await getMeetingRow(id);
    if (!m) throw new NotFoundError("Meeting");
    return m;
  }

  async function detail(meeting: Meeting): Promise<MeetingDetail> {
    const id = meeting.id;
    const [participants, segments, summaries, action_items, highlights, chapters, extra] = await Promise.all([
      db.from("participants").select(PARTICIPANT_COLS).eq("meeting_id", id).order("position").then((r) => data(r, "participants") as Participant[]),
      allSegments((q) => q.eq("meeting_id", id)),
      db.from("summaries").select("*").eq("meeting_id", id).order("created_at", { ascending: false }).then((r) => data(r, "summaries") as Summary[]),
      db.from("action_items").select("*").eq("meeting_id", id).order("timestamp_ms", { nullsFirst: false }).then((r) => data(r, "action_items") as ActionItem[]),
      db.from("highlights").select("*").eq("meeting_id", id).order("start_ms").then((r) => data(r, "highlights") as Highlight[]),
      db.from("chapters").select("*").eq("meeting_id", id).order("start_ms").then((r) => data(r, "chapters") as Chapter[]),
      db.from("meetings").select("decisions").eq("id", id).single().then((r) => data(r, "decisions") as { decisions: Decision[] | null }),
    ]);
    return {
      meeting,
      participants,
      segments,
      summaries,
      action_items,
      highlights,
      chapters,
      decisions: extra.decisions ?? undefined,
    };
  }

  return {
    // ------------------------------------------------------------------ meetings
    async listMeetings(): Promise<MeetingListItem[]> {
      const rows = data(
        await db
          .from("meetings")
          .select(
            "id,title,meeting_type,recording_start,scheduled_start,duration_sec,status,processing_stage,media_kind,synthetic,created_at," +
              "participants(id,name,email,is_external,color,position),action_items(count),highlights(count)",
          )
          .order("recording_start", { ascending: false, nullsFirst: false })
          .limit(500),
        "list meetings",
      ) as unknown as Row[];
      return rows
        .map((r) => {
          const { participants, action_items, highlights, ...m } = r as Row & {
            participants: (MeetingListItem["participants"][number] & { position: number })[];
            action_items: { count: number }[];
            highlights: { count: number }[];
          };
          return {
            ...(m as unknown as Omit<MeetingListItem, "participants" | "action_item_count" | "highlight_count">),
            participants: [...participants].sort((a, b) => a.position - b.position).map(({ id, name, email, is_external, color }) => ({ id, name, email, is_external, color })),
            action_item_count: action_items?.[0]?.count ?? 0,
            highlight_count: highlights?.[0]?.count ?? 0,
          };
        })
        .sort((a, b) => meetingDate(b).localeCompare(meetingDate(a)));
    },

    async listUpcoming(): Promise<UpcomingMeeting[]> {
      const since = new Date(Date.now() - 3600e3).toISOString();
      return data(
        await db.from("upcoming_meetings").select("id,title,start,end,attendees,meeting_type").gt("end", since).order("start"),
        "upcoming",
      ) as UpcomingMeeting[];
    },

    getMeeting: getMeetingRow,

    async getMeetingDetail(id) {
      const m = await getMeetingRow(id);
      return m ? detail(m) : null;
    },

    async getMeetingDetailByShareToken(token) {
      const m = data(await db.from("meetings").select(MEETING_COLS).eq("share_token", token).maybeSingle(), "meeting by token") as Meeting | null;
      return m ? detail(m) : null;
    },

    async createMeeting(input) {
      const row = { ...input, workspace_id: input.workspace_id ?? (await defaultWorkspace()) };
      return data(await db.from("meetings").insert(row).select(MEETING_COLS).single(), "create meeting") as Meeting;
    },

    async updateMeeting(id, patch) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _i, workspace_id: _w, created_at: _c, ...rest } = patch as Partial<Meeting>;
      return found(await db.from("meetings").update(rest).eq("id", id).select(MEETING_COLS).maybeSingle(), "Meeting") as Meeting;
    },

    // ------------------------------------------------------------------ transcript
    async replaceParticipants(meetingId, participants) {
      await requireMeeting(meetingId);
      check((await db.from("participants").delete().eq("meeting_id", meetingId)).error, "delete participants");
      if (!participants.length) return [];
      const rows = participants.map((p, i) => ({ ...p, id: p.id ?? newId(), meeting_id: meetingId, position: i }));
      data(await db.from("participants").insert(rows), "insert participants");
      return rows.map(({ position: _p, ...p }) => p as Participant); // eslint-disable-line @typescript-eslint/no-unused-vars
    },

    async replaceSegments(meetingId, segments) {
      await requireMeeting(meetingId);
      check((await db.from("transcript_segments").delete().eq("meeting_id", meetingId)).error, "delete segments");
      const rows = segments.map((s) => ({ ...s, id: newId(), meeting_id: meetingId })).sort(byStart);
      for (const batch of chunks(rows, 500)) data(await db.from("transcript_segments").insert(batch), "insert segments");
      return rows;
    },

    async updateSegment(id, patch) {
      return found(await db.from("transcript_segments").update(patch).eq("id", id).select(SEGMENT_COLS).maybeSingle(), "Segment") as TranscriptSegment;
    },

    // ------------------------------------------------------------------ summaries
    async findSummary(meetingId, template, language, customInstructions) {
      const ci = normInstr(customInstructions);
      let q = db.from("summaries").select("*").eq("meeting_id", meetingId).eq("template", template).eq("language", language);
      q = ci ? q.eq("custom_instructions", ci) : q.is("custom_instructions", null);
      const rows = data(await q.order("created_at", { ascending: false }).limit(1), "find summary") as Summary[];
      return rows[0] ?? null;
    },

    async saveSummary(input) {
      await requireMeeting(input.meeting_id);
      const ci = normInstr(input.custom_instructions);
      let del = db.from("summaries").delete().eq("meeting_id", input.meeting_id).eq("template", input.template).eq("language", input.language);
      del = ci ? del.eq("custom_instructions", ci) : del.is("custom_instructions", null);
      check((await del).error, "replace summary");
      return data(
        await db.from("summaries").insert({ ...input, custom_instructions: ci, id: newId("sum") }).select("*").single(),
        "save summary",
      ) as Summary;
    },

    // ------------------------------------------------------------------ action items
    async replaceAiActionItems(meetingId, items) {
      await requireMeeting(meetingId);
      check((await db.from("action_items").delete().eq("meeting_id", meetingId).eq("user_generated", false)).error, "delete action items");
      if (items.length) {
        data(await db.from("action_items").insert(items.map((i) => ({ ...i, id: newId("ai"), meeting_id: meetingId }))), "insert action items");
      }
      return data(
        await db.from("action_items").select("*").eq("meeting_id", meetingId).order("timestamp_ms", { nullsFirst: false }),
        "action items",
      ) as ActionItem[];
    },

    async createActionItem(meetingId, input) {
      await requireMeeting(meetingId);
      return data(
        await db.from("action_items").insert({ ...input, id: newId("ai"), meeting_id: meetingId }).select("*").single(),
        "create action item",
      ) as ActionItem;
    },

    async updateActionItem(id, patch) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _i, meeting_id: _m, created_at: _c, ...rest } = patch as Partial<ActionItem>;
      return found(await db.from("action_items").update(rest).eq("id", id).select("*").maybeSingle(), "Action item") as ActionItem;
    },

    async deleteActionItem(id) {
      found(await db.from("action_items").delete().eq("id", id).select("id").maybeSingle(), "Action item");
    },

    // ------------------------------------------------------------------ highlights / clips
    async listHighlights(meetingId) {
      await requireMeeting(meetingId);
      return data(await db.from("highlights").select("*").eq("meeting_id", meetingId).order("start_ms"), "highlights") as Highlight[];
    },

    async createHighlight(meetingId, input) {
      await requireMeeting(meetingId);
      return data(
        await db.from("highlights").insert({ ...input, id: newId("hl"), meeting_id: meetingId, share_token: newToken() }).select("*").single(),
        "create highlight",
      ) as Highlight;
    },

    async updateHighlight(id, patch) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _i, meeting_id: _m, created_at: _c, share_token: _s, ...rest } = patch as Partial<Highlight>;
      return found(await db.from("highlights").update(rest).eq("id", id).select("*").maybeSingle(), "Highlight") as Highlight;
    },

    async deleteHighlight(id) {
      found(await db.from("highlights").delete().eq("id", id).select("id").maybeSingle(), "Highlight"); // playlist_items cascade
    },

    async getClipByToken(token): Promise<ClipDetail | null> {
      const h = data(await db.from("highlights").select("*").eq("share_token", token).maybeSingle(), "clip") as Highlight | null;
      if (!h) return null;
      const [meeting, participants, segments] = await Promise.all([
        db.from("meetings").select("id,title,media_url,media_kind,recording_start,duration_sec").eq("id", h.meeting_id).single()
          .then((r) => data(r, "clip meeting") as ClipDetail["meeting"]),
        db.from("participants").select(PARTICIPANT_COLS).eq("meeting_id", h.meeting_id).order("position").then((r) => data(r, "participants") as Participant[]),
        allSegments((q) => q.eq("meeting_id", h.meeting_id).gt("end_ms", h.start_ms).lt("start_ms", h.end_ms)),
      ]);
      return { highlight: h, meeting, participants, segments };
    },

    // ------------------------------------------------------------------ chapters & insights
    async replaceChapters(meetingId, chapters) {
      await requireMeeting(meetingId);
      check((await db.from("chapters").delete().eq("meeting_id", meetingId)).error, "delete chapters");
      const rows = chapters.map((c) => ({ ...c, id: newId("ch"), meeting_id: meetingId })).sort(byStart);
      if (rows.length) data(await db.from("chapters").insert(rows), "insert chapters");
      return rows;
    },

    async getDecisions(meetingId) {
      const row = data(await db.from("meetings").select("decisions").eq("id", meetingId).maybeSingle(), "decisions") as { decisions: Decision[] | null } | null;
      return row?.decisions ?? null;
    },

    async saveDecisions(meetingId, decisions) {
      found(await db.from("meetings").update({ decisions }).eq("id", meetingId).select("id").maybeSingle(), "Meeting");
    },

    // ------------------------------------------------------------------ share
    async setShare(meetingId, access, invitedEmails) {
      const m = await requireMeeting(meetingId);
      const patch: Row = { share_token: m.share_token ?? newToken(), share_access: access };
      if (invitedEmails) patch.share_invited_emails = invitedEmails;
      return data(await db.from("meetings").update(patch).eq("id", meetingId).select(MEETING_COLS).single(), "set share") as Meeting;
    },

    async revokeShare(meetingId) {
      found(await db.from("meetings").update({ share_token: null }).eq("id", meetingId).select("id").maybeSingle(), "Meeting");
    },

    // ------------------------------------------------------------------ search
    async search({ q, meeting_id, limit }) {
      if (!q.trim()) return { hits: [], total: 0 };
      const rows = data(
        await db.rpc("search_segments", { q, p_meeting_id: meeting_id ?? null, p_limit: limit }),
        "search",
      ) as (Omit<SearchHit, "rank"> & { rank: number; total: number })[];
      return {
        hits: rows.map(({ total: _t, ...h }) => ({ ...h, rank: Math.round(Number(h.rank) * 1000) / 1000 })), // eslint-disable-line @typescript-eslint/no-unused-vars
        total: rows[0] ? Number(rows[0].total) : 0,
      };
    },

    // ------------------------------------------------------------------ Ask
    async listChatMessages(meetingId) {
      let q = db.from("chat_messages").select("*");
      q = meetingId ? q.eq("meeting_id", meetingId) : q.is("meeting_id", null);
      return data(await q.order("created_at"), "chat messages") as ChatMessage[];
    },

    async addChatMessage(input) {
      return data(await db.from("chat_messages").insert({ ...input, id: newId("msg") }).select("*").single(), "add chat message") as ChatMessage;
    },

    // ------------------------------------------------------------------ playlists
    async listPlaylists() {
      const rows = data(
        await db.from("playlists").select("id,workspace_id,name,description,created_at,playlist_items(count)").order("created_at", { ascending: false }),
        "playlists",
      ) as unknown as (Playlist & { playlist_items: { count: number }[] })[];
      return rows.map(({ playlist_items, ...p }) => ({ ...p, item_count: playlist_items?.[0]?.count ?? 0 }));
    },

    async createPlaylist(input) {
      return data(
        await db
          .from("playlists")
          .insert({ id: newId("pl"), workspace_id: await defaultWorkspace(), name: input.name, description: input.description ?? null })
          .select("id,workspace_id,name,description,created_at")
          .single(),
        "create playlist",
      ) as Playlist;
    },

    async addPlaylistItem(playlistId, input) {
      found(await db.from("playlists").select("id").eq("id", playlistId).maybeSingle(), "Playlist");
      if (input.meeting_id) await requireMeeting(input.meeting_id);
      if (input.highlight_id) found(await db.from("highlights").select("id").eq("id", input.highlight_id).maybeSingle(), "Highlight");
      const { count, error } = await db.from("playlist_items").select("id", { count: "exact", head: true }).eq("playlist_id", playlistId);
      check(error, "count playlist items");
      return data(
        await db
          .from("playlist_items")
          .insert({
            id: newId("pli"),
            playlist_id: playlistId,
            meeting_id: input.meeting_id ?? null,
            highlight_id: input.highlight_id ?? null,
            position: count ?? 0,
          })
          .select("*")
          .single(),
        "add playlist item",
      ) as PlaylistItem;
    },
  };
}
