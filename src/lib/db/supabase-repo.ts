import "server-only";
import { randomBytes } from "node:crypto";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { HttpError, NotFoundError } from "@/lib/server/errors";
import { newId, newToken, nowIso } from "@/lib/server/ids";
import type {
  ActionItem,
  AutoRecordRule,
  BotSession,
  Comment,
  CrmSyncLog,
  DealOverrides,
  Folder,
  FolderWithCount,
  Notification,
  Reaction,
  SlackConfig,
  TeamMember,
  Tracker,
  User,
  UserPrefs,
  Webhook,
  WebhookDelivery,
  Workspace,
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
import {
  defaultPrefs,
  defaultSlackConfig,
  MEMBER_COLORS,
  nameFromEmail,
  overlaps,
  toCalendarEvent,
  withLibraryFields,
} from "./derive";
import type { Repo } from "./repo";
import type { StoredCalendarEvent } from "./seed-types";

/**
 * Supabase (Postgres) repository — used when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 * Schema: supabase/migrations/0001_init.sql + 0002_parity.sql (columns mirror `@/lib/types` 1:1). All access uses the
 * service-role key on the server; RLS is on with no policies so the anon key can read nothing.
 * Search runs through the `search_segments` SQL function (websearch_to_tsquery + GIN + ts_headline <mark>).
 */

const MEETING_COLS =
  "id,workspace_id,title,meeting_type,scheduled_start,scheduled_end,recording_start,recording_end,duration_sec," +
  "media_url,media_kind,status,processing_stage,processing_error,transcript_language,share_token,share_access," +
  "recorded_by,synthetic,created_at,folder_id,starred,deleted_at";
const CALENDAR_COLS = "id,title,start,end,attendees,meeting_type,meeting_url,platform,organizer_email,is_external,source,record_override";
const DEAL_SCALARS = ["name", "stage", "amount", "close_date"] as const;
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
const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const newSecret = () => `whsec_${randomBytes(24).toString("hex")}`;
const DEFAULT_TEMPLATE_MEETING = "m_design-review";

/** deal_overrides row → DealOverrides (null scalar columns = not overridden). */
function toDeal(row: Row): DealOverrides & { name?: string } {
  const out: Row = { domain: row.domain, workspace_id: row.workspace_id, bant: row.bant ?? {}, meddpicc: row.meddpicc ?? {}, updated_at: row.updated_at };
  for (const k of DEAL_SCALARS) if (row[k] != null) out[k] = k === "amount" ? Number(row[k]) : row[k];
  return out as unknown as DealOverrides & { name?: string };
}

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


  // ---------------------------------------------------------------- Phase 5 helpers
  /** Current (demo) user = first user of the default workspace; created on first use if the table is empty. */
  let ctxPromise: Promise<{ user: User; workspace: Workspace }> | null = null;
  function sessionCtx(): Promise<{ user: User; workspace: Workspace }> {
    ctxPromise ??= (async () => {
      const wsId = await defaultWorkspace();
      const workspace = found(await db.from("workspaces").select("id,name,domain").eq("id", wsId).maybeSingle(), "Workspace") as Workspace;
      const users = data(
        await db.from("users").select("id,workspace_id,name,email").eq("workspace_id", wsId).order("created_at").limit(1),
        "users",
      ) as User[];
      const user =
        users[0] ??
        (data(
          await db.from("users").insert({ workspace_id: wsId, name: "Demo User", email: `demo@${workspace.domain}` }).select("id,workspace_id,name,email").single(),
          "create user",
        ) as User);
      return { user, workspace };
    })().catch((e) => {
      ctxPromise = null;
      throw e;
    });
    return ctxPromise;
  }

  async function folderCounts(ids: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (!ids.length) return counts;
    const rows = data(
      await db.from("meetings").select("folder_id").in("folder_id", ids).is("deleted_at", null),
      "folder counts",
    ) as { folder_id: string }[];
    for (const r of rows) counts.set(r.folder_id, (counts.get(r.folder_id) ?? 0) + 1);
    return counts;
  }
  async function withCount(f: Folder): Promise<FolderWithCount> {
    return { ...f, meeting_count: (await folderCounts([f.id])).get(f.id) ?? 0 };
  }

  async function autoRecordRule(): Promise<AutoRecordRule> {
    const { user } = await sessionCtx();
    const row = data(await db.from("user_prefs").select("auto_record_rule").eq("user_id", user.id).maybeSingle(), "prefs") as {
      auto_record_rule: AutoRecordRule;
    } | null;
    return row?.auto_record_rule ?? "all";
  }

  async function currentMember(): Promise<TeamMember> {
    const { user, workspace } = await sessionCtx();
    const rows = data(
      await db.from("team_members").select("*").eq("workspace_id", workspace.id).or(`id.eq.${user.id},email.ilike.${user.email}`).limit(1),
      "current member",
    ) as TeamMember[];
    return (
      rows[0] ?? {
        id: user.id,
        workspace_id: workspace.id,
        name: user.name,
        email: user.email,
        role: "admin",
        title: null,
        team: null,
        color: MEMBER_COLORS[0],
        status: "active",
        invited_at: null,
        joined_at: null,
      }
    );
  }

  return {
    // ------------------------------------------------------------------ meetings
    async listMeetings(opts): Promise<MeetingListItem[]> {
      let q = db
        .from("meetings")
        .select(
          "id,title,meeting_type,recording_start,scheduled_start,duration_sec,status,processing_stage,media_kind,synthetic,created_at," +
            "folder_id,starred,deleted_at,recorded_by,share_invited_emails," +
            "participants(id,name,email,is_external,color,position),action_items(count),highlights(count),comments(count)",
        )
        .order("recording_start", { ascending: false, nullsFirst: false })
        .limit(500);
      if (!opts?.include_deleted) q = q.is("deleted_at", null);
      const [rows, ctx, deals] = await Promise.all([
        q.then((r) => data(r, "list meetings") as unknown as Row[]),
        sessionCtx(),
        db.from("deal_overrides").select("domain,name").not("name", "is", null).then((r) => data(r, "deal names") as { domain: string; name: string }[]),
      ]);
      const companyNames = new Map(deals.map((d) => [d.domain, d.name]));
      return rows
        .map((r) => {
          const { participants, action_items, highlights, comments, share_invited_emails, ...m } = r as Row & {
            participants: (MeetingListItem["participants"][number] & { position: number })[];
            action_items: { count: number }[];
            highlights: { count: number }[];
            comments: { count: number }[];
            share_invited_emails: string[] | null;
          };
          return withLibraryFields(
            {
              ...(m as unknown as Omit<MeetingListItem, "participants" | "action_item_count" | "highlight_count">),
              participants: [...participants].sort((a, b) => a.position - b.position).map(({ id, name, email, is_external, color }) => ({ id, name, email, is_external, color })),
              action_item_count: action_items?.[0]?.count ?? 0,
              highlight_count: highlights?.[0]?.count ?? 0,
            },
            {
              invited: share_invited_emails,
              user: ctx.user,
              workspaceDomain: ctx.workspace.domain,
              commentCount: comments?.[0]?.count ?? 0,
              companyNames,
            },
          );
        })
        .sort((a, b) => meetingDate(b).localeCompare(meetingDate(a)));
    },

    async listUpcoming(): Promise<UpcomingMeeting[]> {
      // The strip shows the next 7 days of the calendar (the /calendar page reads listCalendarEvents).
      const since = new Date(Date.now() - 3600e3).toISOString();
      const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
      return data(
        await db.from("upcoming_meetings").select("id,title,start,end,attendees,meeting_type").gt("end", since).lt("start", until).order("start"),
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

    async getPlaylist(id) {
      const row = data(
        await db
          .from("playlists")
          .select("id,workspace_id,name,description,created_at,items:playlist_items(id,playlist_id,meeting_id,highlight_id,position)")
          .eq("id", id)
          .maybeSingle(),
        "playlist",
      ) as (Playlist & { items: PlaylistItem[] }) | null;
      return row ? { ...row, items: [...(row.items ?? [])].sort((a, b) => a.position - b.position) } : null;
    },

    async removePlaylistItem(playlistId, itemId) {
      found(await db.from("playlists").select("id").eq("id", playlistId).maybeSingle(), "Playlist");
      found(
        await db.from("playlist_items").delete().eq("id", itemId).eq("playlist_id", playlistId).select("id").maybeSingle(),
        "Playlist item",
      );
      const rest = data(
        await db.from("playlist_items").select("id,position").eq("playlist_id", playlistId).order("position"),
        "playlist items",
      ) as Pick<PlaylistItem, "id" | "position">[];
      await Promise.all(
        rest
          .map((r, position) => ({ ...r, position }))
          .filter((r, i) => rest[i].position !== r.position)
          .map(async (r) => check((await db.from("playlist_items").update({ position: r.position }).eq("id", r.id)).error, "renumber playlist items")),
      );
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
    // =================================================================== Phase 5
    async listMeetingDetails(opts) {
      let q = db.from("meetings").select(MEETING_COLS).eq("status", "ready").is("deleted_at", null);
      if (opts?.ids) {
        if (!opts.ids.length) return [];
        q = q.in("id", opts.ids);
      }
      const meetings = data(await q.order("recording_start", { ascending: false, nullsFirst: false }).limit(500), "meetings") as unknown as Meeting[];
      const out: MeetingDetail[] = [];
      for (const batch of chunks(meetings, 8)) out.push(...(await Promise.all(batch.map(detail))));
      return out;
    },

    async updateMeetings(ids, patch) {
      if (!ids.length) return 0;
      const rows = data(await db.from("meetings").update(defined(patch)).in("id", [...new Set(ids)]).select("id"), "bulk update") as Row[];
      return rows.length;
    },

    // ---- folders
    async listFolders() {
      const { workspace } = await sessionCtx();
      const folders = data(await db.from("folders").select("*").eq("workspace_id", workspace.id).order("name"), "folders") as Folder[];
      const counts = await folderCounts(folders.map((f) => f.id));
      return folders.map((f) => ({ ...f, meeting_count: counts.get(f.id) ?? 0 }));
    },
    async getFolder(id) {
      const f = data(await db.from("folders").select("*").eq("id", id).maybeSingle(), "folder") as Folder | null;
      return f ? withCount(f) : null;
    },
    async createFolder(input) {
      const { workspace } = await sessionCtx();
      const f = data(
        await db.from("folders").insert({ id: newId("fld"), workspace_id: workspace.id, name: input.name, color: input.color ?? null }).select("*").single(),
        "create folder",
      ) as Folder;
      return { ...f, meeting_count: 0 };
    },
    async updateFolder(id, patch) {
      const f = found(await db.from("folders").update(defined(patch)).eq("id", id).select("*").maybeSingle(), "Folder") as Folder;
      return withCount(f);
    },
    async deleteFolder(id) {
      // meetings.folder_id → null via ON DELETE SET NULL
      found(await db.from("folders").delete().eq("id", id).select("id").maybeSingle(), "Folder");
    },

    // ---- trackers
    async listTrackers() {
      const { workspace } = await sessionCtx();
      return data(await db.from("trackers").select("*").eq("workspace_id", workspace.id).order("created_at"), "trackers") as Tracker[];
    },
    async getTracker(id) {
      return data(await db.from("trackers").select("*").eq("id", id).maybeSingle(), "tracker") as Tracker | null;
    },
    async createTracker(input) {
      const { workspace } = await sessionCtx();
      const { count } = await db.from("trackers").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);
      return data(
        await db
          .from("trackers")
          .insert({
            id: newId("trk"),
            workspace_id: workspace.id,
            name: input.name,
            description: input.description ?? null,
            keywords: input.keywords,
            color: input.color ?? MEMBER_COLORS[(count ?? 0) % MEMBER_COLORS.length],
          })
          .select("*")
          .single(),
        "create tracker",
      ) as Tracker;
    },
    async updateTracker(id, patch) {
      return found(await db.from("trackers").update(defined(patch)).eq("id", id).select("*").maybeSingle(), "Tracker") as Tracker;
    },
    async deleteTracker(id) {
      found(await db.from("trackers").delete().eq("id", id).select("id").maybeSingle(), "Tracker");
    },

    // ---- deals
    async listDealOverrides() {
      const { workspace } = await sessionCtx();
      return (data(await db.from("deal_overrides").select("*").eq("workspace_id", workspace.id), "deal overrides") as Row[]).map(toDeal);
    },
    async getDealOverrides(domain) {
      const { workspace } = await sessionCtx();
      const row = data(
        await db.from("deal_overrides").select("*").eq("workspace_id", workspace.id).eq("domain", domain.toLowerCase()).maybeSingle(),
        "deal overrides",
      ) as Row | null;
      return row ? toDeal(row) : null;
    },
    async saveDealOverrides(domain, patch) {
      const { workspace } = await sessionCtx();
      const key = domain.toLowerCase();
      const prev = data(
        await db.from("deal_overrides").select("*").eq("workspace_id", workspace.id).eq("domain", key).maybeSingle(),
        "deal overrides",
      ) as Row | null;
      const row: Row = {
        workspace_id: workspace.id,
        domain: key,
        name: prev?.name ?? null,
        stage: prev?.stage ?? null,
        amount: prev?.amount ?? null,
        close_date: prev?.close_date ?? null,
        bant: { ...((prev?.bant as object) ?? {}), ...(patch.bant ?? {}) },
        meddpicc: { ...((prev?.meddpicc as object) ?? {}), ...(patch.meddpicc ?? {}) },
        updated_at: nowIso(),
      };
      for (const k of DEAL_SCALARS) if (patch[k] !== undefined) row[k] = patch[k]; // null clears the override
      return toDeal(data(await db.from("deal_overrides").upsert(row, { onConflict: "workspace_id,domain" }).select("*").single(), "save deal") as Row);
    },

    // ---- comments
    async listComments(meetingId) {
      await requireMeeting(meetingId);
      return data(
        await db
          .from("comments")
          .select("*")
          .eq("meeting_id", meetingId)
          .order("timestamp_ms", { ascending: true, nullsFirst: false })
          .order("created_at"),
        "comments",
      ) as Comment[];
    },
    async getComment(id) {
      return data(await db.from("comments").select("*").eq("id", id).maybeSingle(), "comment") as Comment | null;
    },
    async createComment(meetingId, input) {
      await requireMeeting(meetingId);
      let timestamp = input.timestamp_ms ?? null;
      if (input.parent_id) {
        const parent = found(
          await db.from("comments").select("id,parent_id,timestamp_ms").eq("id", input.parent_id).eq("meeting_id", meetingId).maybeSingle(),
          "Parent comment",
        ) as Pick<Comment, "id" | "parent_id" | "timestamp_ms">;
        if (parent.parent_id) throw new HttpError(400, "validation", "Replies are one level deep");
        timestamp = input.timestamp_ms ?? parent.timestamp_ms;
      }
      const me = await currentMember();
      return data(
        await db
          .from("comments")
          .insert({
            id: newId("cm"),
            meeting_id: meetingId,
            timestamp_ms: timestamp,
            body: input.body,
            mentions: input.mentions ?? [],
            author_id: me.id,
            author_name: me.name,
            author_color: me.color,
            parent_id: input.parent_id ?? null,
          })
          .select("*")
          .single(),
        "create comment",
      ) as Comment;
    },
    async updateComment(id, patch) {
      return found(
        await db.from("comments").update({ ...defined(patch), updated_at: nowIso() }).eq("id", id).select("*").maybeSingle(),
        "Comment",
      ) as Comment;
    },
    async deleteComment(id) {
      found(await db.from("comments").delete().eq("id", id).select("id").maybeSingle(), "Comment"); // replies cascade
    },

    // ---- reactions
    async listReactions(meetingId) {
      await requireMeeting(meetingId);
      return data(await db.from("reactions").select("*").eq("meeting_id", meetingId).order("created_at"), "reactions") as Reaction[];
    },
    async toggleReaction(segmentId, emoji) {
      const seg = found(await db.from("transcript_segments").select("id,meeting_id").eq("id", segmentId).maybeSingle(), "Segment") as {
        meeting_id: string;
      };
      const { user } = await sessionCtx();
      const removed = data(
        await db.from("reactions").delete().eq("segment_id", segmentId).eq("user_id", user.id).eq("emoji", emoji).select("id"),
        "remove reaction",
      ) as Row[];
      if (!removed.length) {
        const res = await db
          .from("reactions")
          .insert({ id: newId("rx"), meeting_id: seg.meeting_id, segment_id: segmentId, emoji, user_id: user.id, user_name: user.name });
        if (res.error && res.error.code !== "23505") check(res.error, "add reaction"); // concurrent duplicate = already added
      }
      const reactions = data(await db.from("reactions").select("*").eq("segment_id", segmentId).order("created_at"), "reactions") as Reaction[];
      return { added: !removed.length, meeting_id: seg.meeting_id, reactions };
    },

    // ---- webhooks
    async listWebhooks() {
      const { workspace } = await sessionCtx();
      return data(await db.from("webhooks").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }), "webhooks") as Webhook[];
    },
    async getWebhook(id) {
      return data(await db.from("webhooks").select("*").eq("id", id).maybeSingle(), "webhook") as Webhook | null;
    },
    async createWebhook(input) {
      const { workspace } = await sessionCtx();
      return data(
        await db
          .from("webhooks")
          .insert({
            id: newId("wh"),
            workspace_id: workspace.id,
            url: input.url,
            description: input.description ?? null,
            events: input.events,
            secret: newSecret(),
            active: input.active ?? true,
          })
          .select("*")
          .single(),
        "create webhook",
      ) as Webhook;
    },
    async updateWebhook(id, patch) {
      const { rotate_secret, ...rest } = patch;
      const row: Row = defined(rest);
      if (rotate_secret) row.secret = newSecret();
      if (!Object.keys(row).length) return found(await db.from("webhooks").select("*").eq("id", id).maybeSingle(), "Webhook") as Webhook;
      return found(await db.from("webhooks").update(row).eq("id", id).select("*").maybeSingle(), "Webhook") as Webhook;
    },
    async deleteWebhook(id) {
      found(await db.from("webhooks").delete().eq("id", id).select("id").maybeSingle(), "Webhook"); // deliveries cascade
    },
    async listWebhookDeliveries(webhookId, limit = 50) {
      found(await db.from("webhooks").select("id").eq("id", webhookId).maybeSingle(), "Webhook");
      return data(
        await db.from("webhook_deliveries").select("*").eq("webhook_id", webhookId).order("created_at", { ascending: false }).limit(limit),
        "webhook deliveries",
      ) as WebhookDelivery[];
    },
    async recordWebhookDelivery(input) {
      found(await db.from("webhooks").select("id").eq("id", input.webhook_id).maybeSingle(), "Webhook");
      const d = data(
        await db.from("webhook_deliveries").insert({ ...input, id: input.id ?? newId("whd") }).select("*").single(),
        "record delivery",
      ) as WebhookDelivery;
      check(
        (await db.from("webhooks").update({ last_status: d.status_code ?? 0, last_delivery_at: d.created_at }).eq("id", input.webhook_id)).error,
        "update webhook status",
      );
      return d;
    },

    // ---- slack
    async getSlackConfig() {
      const { workspace } = await sessionCtx();
      const row = data(await db.from("slack_configs").select("*").eq("workspace_id", workspace.id).maybeSingle(), "slack config") as SlackConfig | null;
      return row ?? defaultSlackConfig(workspace.id, nowIso());
    },
    async saveSlackConfig(patch) {
      const { workspace } = await sessionCtx();
      const prev = data(await db.from("slack_configs").select("*").eq("workspace_id", workspace.id).maybeSingle(), "slack config") as SlackConfig | null;
      const row = { ...(prev ?? defaultSlackConfig(workspace.id, nowIso())), ...defined(patch), workspace_id: workspace.id, updated_at: nowIso() };
      return data(await db.from("slack_configs").upsert(row, { onConflict: "workspace_id" }).select("*").single(), "save slack config") as SlackConfig;
    },

    // ---- CRM
    async listCrmSyncLogs(meetingId) {
      let q = db.from("crm_sync_logs").select("*");
      if (meetingId) q = q.eq("meeting_id", meetingId);
      return data(await q.order("created_at", { ascending: false }).limit(200), "crm logs") as CrmSyncLog[];
    },
    async addCrmSyncLog(input) {
      await requireMeeting(input.meeting_id);
      return data(await db.from("crm_sync_logs").insert({ ...input, id: newId("crm") }).select("*").single(), "add crm log") as CrmSyncLog;
    },

    // ---- bot sessions
    async listBotSessions(limit = 20) {
      const { workspace } = await sessionCtx();
      return data(
        await db.from("bot_sessions").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(limit),
        "bot sessions",
      ) as BotSession[];
    },
    async getBotSession(id) {
      return data(await db.from("bot_sessions").select("*").eq("id", id).maybeSingle(), "bot session") as BotSession | null;
    },
    async createBotSession(input) {
      const { workspace } = await sessionCtx();
      const now = nowIso();
      return data(
        await db
          .from("bot_sessions")
          .insert({
            id: newId("bot"),
            workspace_id: workspace.id,
            meeting_url: input.meeting_url,
            platform: input.platform,
            title: input.title,
            state: "joining",
            simulated: true,
            events: [{ state: "joining", at: now, note: null }],
            created_at: now,
            updated_at: now,
          })
          .select("*")
          .single(),
        "create bot session",
      ) as BotSession;
    },
    async updateBotSession(id, patch) {
      return found(
        await db.from("bot_sessions").update({ ...defined(patch), updated_at: nowIso() }).eq("id", id).select("*").maybeSingle(),
        "Bot session",
      ) as BotSession;
    },

    async cloneMeetingFromTemplate(templateMeetingId, overrides) {
      let tmpl = templateMeetingId ? await getMeetingRow(templateMeetingId) : await getMeetingRow(DEFAULT_TEMPLATE_MEETING);
      if (!tmpl && !templateMeetingId) {
        const rows = data(
          await db.from("meetings").select(MEETING_COLS).eq("status", "ready").eq("synthetic", true).is("deleted_at", null).limit(1),
          "template",
        ) as unknown as Meeting[];
        tmpl = rows[0] ?? null;
      }
      if (!tmpl) throw new NotFoundError("Template meeting");
      // One meeting per bot session (idempotent across instances/retries).
      const id = overrides.bot_session_id ? `m_bot_${overrides.bot_session_id}` : newId();
      if (overrides.bot_session_id && (await getMeetingRow(id))) return id;
      const t = await detail(tmpl);
      const { user } = await sessionCtx();
      const now = Date.now();
      const created = new Date(now).toISOString();
      const began = new Date(now - t.meeting.duration_sec * 1000).toISOString();
      const pid = new Map(t.participants.map((p) => [p.id, newId()]));
      const mapP = (x: string | null) => (x ? (pid.get(x) ?? null) : null);
      data(
        await db.from("meetings").insert({
          ...t.meeting,
          id,
          title: overrides.title,
          recorded_by: overrides.recorded_by !== undefined ? overrides.recorded_by : user.name,
          scheduled_start: began,
          scheduled_end: created,
          recording_start: began,
          recording_end: created,
          status: "ready",
          processing_stage: "ready",
          processing_error: null,
          share_token: null,
          folder_id: null,
          starred: false,
          deleted_at: null,
          created_at: created,
          decisions: t.decisions ? t.decisions.map((d) => ({ ...d, participant_id: mapP(d.participant_id) })) : null,
        }),
        "clone meeting",
      );
      const insert = async (table: string, rows: Row[]) => {
        for (const batch of chunks(rows, 500)) if (batch.length) data(await db.from(table).insert(batch), `clone ${table}`);
      };
      await insert("participants", t.participants.map((p, i) => ({ ...p, id: pid.get(p.id), meeting_id: id, position: i })));
      await insert("transcript_segments", t.segments.map((x) => ({ ...x, id: newId(), meeting_id: id, participant_id: mapP(x.participant_id) })));
      await Promise.all([
        insert("summaries", t.summaries.map((x) => ({ ...x, id: newId("sum"), meeting_id: id, created_at: created }))),
        insert(
          "action_items",
          t.action_items.map((x) => ({ ...x, id: newId("ai"), meeting_id: id, assignee_participant_id: mapP(x.assignee_participant_id), completed: false, created_at: created })),
        ),
        insert("highlights", t.highlights.map((x) => ({ ...x, id: newId("hl"), meeting_id: id, share_token: newToken(), created_at: created }))),
        insert("chapters", t.chapters.map((x) => ({ ...x, id: newId("ch"), meeting_id: id }))),
      ]);
      return id;
    },

    // ---- calendar
    async listCalendarEvents(range) {
      const { workspace } = await sessionCtx();
      const [rows, rule] = await Promise.all([
        db.from("upcoming_meetings").select(CALENDAR_COLS).eq("workspace_id", workspace.id).order("start").limit(1000)
          .then((r) => data(r, "calendar") as StoredCalendarEvent[]),
        autoRecordRule(),
      ]);
      return rows.filter((e) => overlaps(e, range)).map((e) => toCalendarEvent(e, rule));
    },
    async setCalendarRecord(eventId, record) {
      const [e, rule] = await Promise.all([
        db.from("upcoming_meetings").update({ record_override: record }).eq("id", eventId).select(CALENDAR_COLS).maybeSingle()
          .then((r) => found(r, "Calendar event") as StoredCalendarEvent),
        autoRecordRule(),
      ]);
      return toCalendarEvent(e, rule);
    },

    // ---- prefs
    async getPrefs() {
      const { user } = await sessionCtx();
      const row = data(await db.from("user_prefs").select("*").eq("user_id", user.id).maybeSingle(), "prefs") as UserPrefs | null;
      return row ?? defaultPrefs(user.id, nowIso());
    },
    async updatePrefs(patch) {
      const { user } = await sessionCtx();
      const prev = data(await db.from("user_prefs").select("*").eq("user_id", user.id).maybeSingle(), "prefs") as UserPrefs | null;
      const row = { ...(prev ?? defaultPrefs(user.id, nowIso())), ...defined(patch), user_id: user.id, updated_at: nowIso() };
      return data(await db.from("user_prefs").upsert(row, { onConflict: "user_id" }).select("*").single(), "save prefs") as UserPrefs;
    },
    getAutoRecordRule: autoRecordRule,

    // ---- session & team
    async getCurrentSession() {
      const [{ user, workspace }, member] = await Promise.all([sessionCtx(), currentMember()]);
      return { user, workspace, member, auth_mode: "demo" as const };
    },
    async listTeamMembers() {
      const { workspace } = await sessionCtx();
      const rows = data(await db.from("team_members").select("*").eq("workspace_id", workspace.id), "team") as TeamMember[];
      return rows.sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || a.name.localeCompare(b.name));
    },
    async inviteTeamMembers(emails, role) {
      const { workspace } = await sessionCtx();
      const existing = data(await db.from("team_members").select("email").eq("workspace_id", workspace.id), "team emails") as { email: string }[];
      const known = new Set(existing.map((e) => e.email.toLowerCase()));
      const rows: TeamMember[] = [];
      for (const raw of emails) {
        const email = raw.trim().toLowerCase();
        if (!email || known.has(email)) continue;
        known.add(email);
        rows.push({
          id: newId("tm"),
          workspace_id: workspace.id,
          name: nameFromEmail(email),
          email,
          role,
          title: null,
          team: null,
          color: MEMBER_COLORS[(existing.length + rows.length) % MEMBER_COLORS.length],
          status: "invited",
          invited_at: nowIso(),
          joined_at: null,
        });
      }
      if (!rows.length) return [];
      return data(await db.from("team_members").insert(rows).select("*"), "invite") as TeamMember[];
    },
    async updateTeamMember(id, patch) {
      return found(await db.from("team_members").update(defined(patch)).eq("id", id).select("*").maybeSingle(), "Team member") as TeamMember;
    },
    async removeTeamMember(id) {
      const { user } = await sessionCtx();
      const m = found(await db.from("team_members").select("id,role").eq("id", id).maybeSingle(), "Team member") as Pick<TeamMember, "id" | "role">;
      if (m.id === user.id) throw new HttpError(409, "conflict", "You can't remove yourself");
      if (m.role === "owner") throw new HttpError(409, "conflict", "The workspace owner can't be removed");
      check((await db.from("team_members").delete().eq("id", id)).error, "remove member");
    },

    // ---- notifications
    async listNotifications(opts) {
      const { user } = await sessionCtx();
      let q = db.from("notifications").select("*").eq("user_id", user.id);
      if (opts?.unread) q = q.is("read_at", null);
      const [list, unread] = await Promise.all([
        q.order("created_at", { ascending: false }).limit(opts?.limit ?? 50).then((r) => data(r, "notifications") as Notification[]),
        db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
      ]);
      check(unread.error, "unread count");
      return { notifications: list, unread_count: unread.count ?? 0 };
    },
    async createNotification(input) {
      const { user } = await sessionCtx();
      return data(
        await db.from("notifications").insert({ ...input, user_id: input.user_id ?? user.id, id: newId("ntf") }).select("*").single(),
        "create notification",
      ) as Notification;
    },
    async markNotificationsRead(ids) {
      const { user } = await sessionCtx();
      let q = db.from("notifications").update({ read_at: nowIso() }).eq("user_id", user.id).is("read_at", null);
      if (ids) {
        if (!ids.length) q = q.in("id", ["__none__"]);
        else q = q.in("id", ids);
      }
      check((await q).error, "mark read");
      const { count, error } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
      check(error, "unread count");
      return count ?? 0;
    },
  };
}
