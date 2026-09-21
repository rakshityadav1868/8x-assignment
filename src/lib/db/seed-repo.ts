import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { seedMeetings, seedParity, seedWorkspace } from "@/data/seed";
import { HttpError, NotFoundError } from "@/lib/server/errors";
import { newId, newToken, nowIso } from "@/lib/server/ids";
import { Bm25, highlightSnippet, matchRank, parseQuery, words } from "@/lib/search/text";
import type {
  ActionItem,
  BotSession,
  ChatMessage,
  Comment,
  DealOverrides,
  FolderWithCount,
  Notification,
  Reaction,
  TeamMember,
  User,
  Workspace,
  ClipDetail,
  Decision,
  Highlight,
  Meeting,
  MeetingDetail,
  MeetingListItem,
  Playlist,
  PlaylistItem,
  SearchHit,
  SeedMeetingFile,
  SeedWorkspaceFile,
  Summary,
} from "@/lib/types";
import { botIdFromMeetingId, botMeetingId, decodeBotToken, encodeBotToken } from "./bot-token";
import { CLIP_TOKEN_PREFIX, decodeClipToken, encodeClipToken } from "./clip-token";
import {
  commentOrder,
  defaultPrefs,
  defaultSlackConfig,
  MEMBER_COLORS,
  nameFromEmail,
  overlaps,
  toCalendarEvent,
  withLibraryFields,
} from "./derive";
import type { Repo } from "./repo";
import type { SeedParityFile, StoredCalendarEvent } from "./seed-types";
import { shiftSeed, type SeedAnchor } from "./seed-time";

/**
 * Keyless demo-mode repository: the static seed JSON (`src/data/seed/`) deep-cloned into an in-memory
 * store on `globalThis`. Mutations persist for the lifetime of the server instance (reset on cold start).
 */

interface MeetingRecord extends Omit<MeetingDetail, "decisions"> {
  decisions: Decision[] | null;
  invited_emails: string[];
}

interface Store {
  meetings: Map<string, MeetingRecord>;
  /** Calendar events (also feed the upcoming strip). */
  calendar: StoredCalendarEvent[];
  playlists: (Playlist & { items: PlaylistItem[] })[];
  chat: ChatMessage[];
  workspaceId: string;
  workspace: Workspace;
  user: User;
  /** Phase 5 collections (mutable). */
  p: SeedParityFile;
  bots: BotSession[];
  /** Self-contained clip tokens of highlights deleted in this instance (so they stop resolving here). */
  deletedClipTokens?: Set<string>;
}

const g = globalThis as unknown as { __fanthomSeedStore?: Store };

function loadStore(): Store {
  // Seed JSON is written against a fixed canonical week; move every timestamp forward by whole weeks so the
  // flagship Q4 meeting is the most recent Thursday and upcoming meetings fall in the next 7 days.
  const shifted = shiftSeed(
    seedMeetings as SeedMeetingFile[],
    seedWorkspace as SeedWorkspaceFile & { anchor?: SeedAnchor },
    Date.now(),
    structuredClone(seedParity as SeedParityFile),
  );
  const p = shifted.parity;
  const meetings = new Map<string, MeetingRecord>();
  for (const file of shifted.meetings) {
    const { decisions, ...rest } = file;
    const meeting = { ...rest.meeting, folder_id: rest.meeting.folder_id ?? null, starred: !!rest.meeting.starred, deleted_at: rest.meeting.deleted_at ?? null };
    meetings.set(file.meeting.id, { ...rest, meeting, decisions: decisions ?? null, invited_emails: p.meeting_invites[file.meeting.id] ?? [] });
  }
  const ws = shifted.workspace;
  return {
    meetings,
    calendar: ws.upcoming as StoredCalendarEvent[],
    playlists: ws.playlists,
    chat: [],
    workspaceId: ws.workspace.id,
    workspace: ws.workspace,
    user: ws.user,
    p,
    bots: [],
  };
}

function store(): Store {
  if (!g.__fanthomSeedStore) g.__fanthomSeedStore = loadStore();
  return g.__fanthomSeedStore;
}

const clone = <T>(v: T): T => structuredClone(v);
const byStart = (a: { start_ms: number }, b: { start_ms: number }) => a.start_ms - b.start_ms;
const meetingDate = (m: Meeting) => m.recording_start ?? m.scheduled_start ?? m.created_at;

function rec(id: string): MeetingRecord {
  const r = getRec(id);
  if (!r) throw new NotFoundError("Meeting");
  return r;
}

function toDetail(r: MeetingRecord): MeetingDetail {
  return clone({
    meeting: normMeeting(r.meeting),
    participants: r.participants,
    segments: [...r.segments].sort(byStart),
    summaries: [...r.summaries].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    action_items: [...r.action_items].sort((a, b) => (a.timestamp_ms ?? Infinity) - (b.timestamp_ms ?? Infinity)),
    highlights: [...r.highlights].sort(byStart),
    chapters: [...r.chapters].sort(byStart),
    decisions: r.decisions ?? undefined,
  });
}

/** ClipDetail for highlight `h` of meeting record `r`. */
function clipOf(r: MeetingRecord, h: Highlight): ClipDetail {
  const m = r.meeting;
  return clone({
    highlight: h,
    meeting: {
      id: m.id,
      title: m.title,
      media_url: m.media_url,
      media_kind: m.media_kind,
      recording_start: m.recording_start,
      duration_sec: m.duration_sec,
    },
    participants: r.participants,
    segments: r.segments.filter((s) => s.end_ms > h.start_ms && s.start_ms < h.end_ms).sort(byStart),
  });
}

/** Re-encode a user highlight's self-contained token so it always matches its current fields. */
function selfContainedToken(h: Pick<Highlight, "meeting_id" | "start_ms" | "end_ms" | "type" | "title" | "note">): string {
  return encodeClipToken({ meeting_id: h.meeting_id, start_ms: h.start_ms, end_ms: h.end_ms, type: h.type, title: h.title, note: h.note });
}

function findActionItem(id: string): { r: MeetingRecord; item: ActionItem } {
  for (const r of store().meetings.values()) {
    const item = r.action_items.find((a) => a.id === id);
    if (item) return { r, item };
  }
  throw new NotFoundError("Action item");
}

function findHighlight(id: string): { r: MeetingRecord; item: Highlight } {
  for (const r of store().meetings.values()) {
    const item = r.highlights.find((h) => h.id === id);
    if (item) return { r, item };
  }
  throw new NotFoundError("Highlight");
}

const normInstr = (s: string | null | undefined) => (s ?? "").trim() || null;

/** Meeting organisation fields are always filled (older/created rows may lack them). */
function normMeeting(m: Meeting): Meeting {
  return { ...m, folder_id: m.folder_id ?? null, starred: m.starred ?? false, deleted_at: m.deleted_at ?? null };
}

function findSegment(id: string): { r: MeetingRecord; seg: MeetingRecord["segments"][number] } {
  for (const r of store().meetings.values()) {
    const seg = r.segments.find((x) => x.id === id);
    if (seg) return { r, seg };
  }
  throw new NotFoundError("Segment");
}

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new NotFoundError(what);
  return v;
}

function folderWithCount(f: SeedParityFile["folders"][number]): FolderWithCount {
  let meeting_count = 0;
  for (const r of store().meetings.values()) if (r.meeting.folder_id === f.id && !r.meeting.deleted_at) meeting_count++;
  return clone({ ...f, meeting_count });
}

/** The demo user's team-member row (synthesised if the seed lacks one). */
function currentMember(): TeamMember {
  const s = store();
  return (
    s.p.team_members.find((m) => m.id === s.user.id) ?? {
      id: s.user.id,
      workspace_id: s.workspaceId,
      name: s.user.name,
      email: s.user.email,
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

const DEFAULT_TEMPLATE_MEETING = "m_design-review";

function templateRecord(templateMeetingId: string | null): MeetingRecord | undefined {
  const s = store();
  if (templateMeetingId) return getRec(templateMeetingId);
  return s.meetings.get(DEFAULT_TEMPLATE_MEETING) ?? [...s.meetings.values()].find((r) => r.meeting.status === "ready" && r.meeting.synthetic);
}

/**
 * Deep copy of `src` as meeting `id`. Child ids are derived from `id`, so cloning the same template under the same
 * id yields identical rows on every instance (needed for lazily materialised bot meetings).
 */
function cloneRecord(src: MeetingRecord, id: string, o: { title: string; recordedBy: string | null; startMs: number }): MeetingRecord {
  const t = clone(src);
  const k = createHash("sha256").update(id).digest("hex").slice(0, 12);
  const start = new Date(o.startMs).toISOString();
  const end = new Date(o.startMs + t.meeting.duration_sec * 1000).toISOString();
  const pid = new Map(t.participants.map((p, i) => [p.id, `p_${k}_${i}`]));
  const mapP = (x: string | null) => (x ? (pid.get(x) ?? null) : null);
  const meeting: Meeting = normMeeting({
    ...t.meeting,
    id,
    title: o.title,
    recorded_by: o.recordedBy,
    scheduled_start: start,
    scheduled_end: end,
    recording_start: start,
    recording_end: end,
    status: "ready",
    processing_stage: "ready",
    processing_error: null,
    share_token: null,
    folder_id: null,
    starred: false,
    deleted_at: null,
    created_at: start,
  });
  return {
    meeting,
    participants: t.participants.map((p) => ({ ...p, id: pid.get(p.id)!, meeting_id: id })),
    segments: t.segments.map((x, i) => ({ ...x, id: `seg_${k}_${i}`, meeting_id: id, participant_id: mapP(x.participant_id) })),
    summaries: t.summaries.map((x, i) => ({ ...x, id: `sum_${k}_${i}`, meeting_id: id, created_at: end })),
    action_items: t.action_items.map((x, i) => ({
      ...x,
      id: `ai_${k}_${i}`,
      meeting_id: id,
      assignee_participant_id: mapP(x.assignee_participant_id),
      completed: false,
      created_at: end,
    })),
    highlights: t.highlights.map((h, i) => {
      const nh: Highlight = { ...h, id: `hl_${k}_${i}`, meeting_id: id, share_token: "", created_at: end };
      nh.share_token = selfContainedToken(nh);
      return nh;
    }),
    chapters: t.chapters.map((x, i) => ({ ...x, id: `ch_${k}_${i}`, meeting_id: id })),
    decisions: t.decisions ? t.decisions.map((d) => ({ ...d, participant_id: mapP(d.participant_id) })) : null,
    invited_emails: [],
  };
}

/** Meeting record by id; `m_bot_…` ids missing from this instance are rebuilt from their bot token. */
function getRec(id: string): MeetingRecord | undefined {
  const s = store();
  const hit = s.meetings.get(id);
  if (hit) return hit;
  const botId = botIdFromMeetingId(id);
  const bot = botId ? decodeBotToken(botId) : null;
  const src = bot ? templateRecord(null) : undefined;
  if (!bot || !src) return undefined;
  const r = cloneRecord(src, id, { title: bot.title ?? "Online meeting", recordedBy: s.user.name, startMs: bot.created_at_ms });
  s.meetings.set(id, r);
  return r;
}

/** Bot session by id; self-contained ids unknown to this instance are rebuilt (state replays from created_at). */
function botOf(id: string): BotSession | null {
  const s = store();
  const hit = s.bots.find((b) => b.id === id);
  if (hit) return hit;
  const d = decodeBotToken(id);
  if (!d) return null;
  const created = new Date(d.created_at_ms).toISOString();
  const b: BotSession = {
    id,
    workspace_id: s.workspaceId,
    meeting_url: d.meeting_url,
    platform: d.platform,
    title: d.title ?? "Online meeting",
    state: "joining",
    simulated: true,
    meeting_id: null,
    error: null,
    events: [{ state: "joining", at: created, note: null }],
    created_at: created,
    joined_at: null,
    admitted_at: null,
    recording_ended_at: null,
    completed_at: null,
    updated_at: created,
  };
  s.bots.push(b);
  return b;
}

export function createSeedRepo(): Repo {
  return {
    async listMeetings(opts): Promise<MeetingListItem[]> {
      const s = store();
      const commentCounts = new Map<string, number>();
      for (const c of s.p.comments) commentCounts.set(c.meeting_id, (commentCounts.get(c.meeting_id) ?? 0) + 1);
      const companyNames = new Map(s.p.deal_overrides.filter((d) => d.name).map((d) => [d.domain, d.name as string]));
      return [...s.meetings.values()]
        .filter((r) => opts?.include_deleted || !r.meeting.deleted_at)
        .map((r) =>
          withLibraryFields(
            {
              id: r.meeting.id,
              title: r.meeting.title,
              meeting_type: r.meeting.meeting_type,
              recording_start: r.meeting.recording_start,
              scheduled_start: r.meeting.scheduled_start,
              duration_sec: r.meeting.duration_sec,
              status: r.meeting.status,
              processing_stage: r.meeting.processing_stage,
              media_kind: r.meeting.media_kind,
              synthetic: r.meeting.synthetic,
              created_at: r.meeting.created_at,
              participants: r.participants.map(({ id, name, email, is_external, color }) => ({ id, name, email, is_external, color })),
              action_item_count: r.action_items.length,
              highlight_count: r.highlights.length,
              folder_id: r.meeting.folder_id,
              starred: r.meeting.starred,
              deleted_at: r.meeting.deleted_at,
              recorded_by: r.meeting.recorded_by,
            },
            { invited: r.invited_emails, user: s.user, workspaceDomain: s.workspace.domain, commentCount: commentCounts.get(r.meeting.id) ?? 0, companyNames },
          ),
        )
        .sort((a, b) =>
          (b.recording_start ?? b.scheduled_start ?? b.created_at).localeCompare(a.recording_start ?? a.scheduled_start ?? a.created_at),
        )
        .map(clone);
    },

    async listUpcoming() {
      // The strip shows the next 7 days of the calendar (the /calendar page reads listCalendarEvents).
      const now = Date.now();
      return clone(
        store()
          .calendar.filter((u) => Date.parse(u.end) > now - 3600e3 && Date.parse(u.start) < now + 7 * 86_400_000)
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(({ id, title, start, end, attendees, meeting_type }) => ({ id, title, start, end, attendees, meeting_type })),
      );
    },

    async getMeeting(id) {
      const r = getRec(id);
      return r ? clone(normMeeting(r.meeting)) : null;
    },

    async getMeetingDetail(id) {
      const r = getRec(id);
      return r ? toDetail(r) : null;
    },

    async getMeetingDetailByShareToken(token) {
      for (const r of store().meetings.values()) if (r.meeting.share_token === token) return toDetail(r);
      return null;
    },

    async createMeeting(input) {
      const meeting: Meeting = normMeeting({ ...input, workspace_id: input.workspace_id ?? store().workspaceId, id: newId(), created_at: nowIso() });
      store().meetings.set(meeting.id, {
        meeting,
        participants: [],
        segments: [],
        summaries: [],
        action_items: [],
        highlights: [],
        chapters: [],
        decisions: null,
        invited_emails: [],
      });
      return clone(meeting);
    },

    async updateMeeting(id, patch) {
      const r = rec(id);
      r.meeting = normMeeting({ ...r.meeting, ...patch, id: r.meeting.id, workspace_id: r.meeting.workspace_id, created_at: r.meeting.created_at });
      return clone(r.meeting);
    },

    async replaceParticipants(meetingId, participants) {
      const r = rec(meetingId);
      r.participants = participants.map((p) => ({ ...p, id: p.id ?? newId(), meeting_id: meetingId }));
      return clone(r.participants);
    },

    async replaceSegments(meetingId, segments) {
      const r = rec(meetingId);
      r.segments = segments.map((s) => ({ ...s, id: newId(), meeting_id: meetingId })).sort(byStart);
      return clone(r.segments);
    },

    async updateSegment(id, patch) {
      for (const r of store().meetings.values()) {
        const s = r.segments.find((x) => x.id === id);
        if (s) {
          Object.assign(s, patch);
          return clone(s);
        }
      }
      throw new NotFoundError("Segment");
    },

    async findSummary(meetingId, template, language, customInstructions) {
      const r = getRec(meetingId);
      if (!r) return null;
      const ci = normInstr(customInstructions);
      const found = r.summaries
        .filter((s) => s.template === template && s.language === language && normInstr(s.custom_instructions) === ci)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return found ? clone(found) : null;
    },

    async saveSummary(input) {
      const r = rec(input.meeting_id);
      const ci = normInstr(input.custom_instructions);
      const summary: Summary = { ...input, custom_instructions: ci, id: newId("sum"), created_at: nowIso() };
      r.summaries = r.summaries.filter(
        (s) => !(s.template === input.template && s.language === input.language && normInstr(s.custom_instructions) === ci),
      );
      r.summaries.push(summary);
      return clone(summary);
    },

    async replaceAiActionItems(meetingId, items) {
      const r = rec(meetingId);
      const created = nowIso();
      const fresh = items.map((i) => ({ ...i, id: newId("ai"), meeting_id: meetingId, created_at: created }));
      r.action_items = [...r.action_items.filter((a) => a.user_generated), ...fresh];
      return clone(r.action_items);
    },

    async createActionItem(meetingId, input) {
      const r = rec(meetingId);
      const item: ActionItem = { ...input, id: newId("ai"), meeting_id: meetingId, created_at: nowIso() };
      r.action_items.push(item);
      return clone(item);
    },

    async updateActionItem(id, patch) {
      const { item } = findActionItem(id);
      Object.assign(item, patch);
      return clone(item);
    },

    async deleteActionItem(id) {
      const { r } = findActionItem(id);
      r.action_items = r.action_items.filter((a) => a.id !== id);
    },

    async listHighlights(meetingId) {
      return clone(rec(meetingId).highlights.sort(byStart));
    },

    async createHighlight(meetingId, input) {
      const r = rec(meetingId);
      // Self-contained token: resolvable by any server instance, even one that never saw this highlight.
      const h: Highlight = { ...input, id: newId("hl"), meeting_id: meetingId, share_token: "", created_at: nowIso() };
      h.share_token = selfContainedToken(h);
      r.highlights.push(h);
      r.highlights.sort(byStart);
      return clone(h);
    },

    async updateHighlight(id, patch) {
      const { item } = findHighlight(id);
      Object.assign(item, patch);
      if (item.share_token.startsWith(CLIP_TOKEN_PREFIX)) item.share_token = selfContainedToken(item);
      return clone(item);
    },

    async deleteHighlight(id) {
      const { r, item } = findHighlight(id);
      if (item.share_token.startsWith(CLIP_TOKEN_PREFIX)) (store().deletedClipTokens ??= new Set()).add(item.share_token);
      r.highlights = r.highlights.filter((h) => h.id !== id);
      for (const p of store().playlists) p.items = p.items.filter((i) => i.highlight_id !== id);
    },

    async getClipByToken(token): Promise<ClipDetail | null> {
      for (const r of store().meetings.values()) {
        const h = r.highlights.find((x) => x.share_token === token);
        if (h) return clipOf(r, h);
      }
      // Stateless fallback: the token carries the clip (created in another instance, or before a cold start).
      const d = decodeClipToken(token);
      if (!d || store().deletedClipTokens?.has(token)) return null;
      const r = getRec(d.meeting_id);
      if (!r || r.meeting.status !== "ready") return null;
      const lastEnd = r.segments.reduce((mx, s) => Math.max(mx, s.end_ms), 0);
      const endMs = Math.max(r.meeting.duration_sec * 1000, lastEnd) + 1000;
      if (d.end_ms > endMs || d.start_ms >= d.end_ms) return null;
      const h: Highlight = {
        id: `hl_${createHash("sha256").update(token).digest("hex").slice(0, 24)}`,
        meeting_id: d.meeting_id,
        start_ms: d.start_ms,
        end_ms: d.end_ms,
        type: d.type,
        title: d.title,
        note: d.note,
        share_token: token,
        user_generated: true,
        created_at: r.meeting.recording_start ?? r.meeting.created_at,
      };
      return clipOf(r, h);
    },

    async replaceChapters(meetingId, chapters) {
      const r = rec(meetingId);
      r.chapters = chapters.map((c) => ({ ...c, id: newId("ch"), meeting_id: meetingId })).sort(byStart);
      return clone(r.chapters);
    },

    async getDecisions(meetingId) {
      const r = getRec(meetingId);
      return r?.decisions ? clone(r.decisions) : null;
    },

    async saveDecisions(meetingId, decisions) {
      rec(meetingId).decisions = clone(decisions);
    },

    async setShare(meetingId, access, invitedEmails) {
      const r = rec(meetingId);
      r.meeting.share_token ??= newToken();
      r.meeting.share_access = access;
      if (invitedEmails) r.invited_emails = invitedEmails;
      return clone(r.meeting);
    },

    async revokeShare(meetingId) {
      rec(meetingId).meeting.share_token = null;
    },

    async search({ q, meeting_id, limit }) {
      const pq = parseQuery(q);
      if (!pq.terms.length && !pq.phrases.length) return { hits: [], total: 0 };
      const records = [...store().meetings.values()].filter(
        (r) => r.meeting.status === "ready" && (!meeting_id || r.meeting.id === meeting_id),
      );
      // Corpus-wide IDF so rare words outrank common ones.
      const corpus = new Bm25(records.flatMap((r) => r.segments.map((s) => ({ terms: words(s.text) }))));
      const idf = (t: string) => Math.max(0.2, corpus.idf(t));
      const hits: SearchHit[] = [];
      for (const r of records) {
        const people = new Map(r.participants.map((p) => [p.id, p]));
        for (const s of r.segments) {
          const rank = matchRank(s.text, pq, idf);
          if (rank <= 0) continue;
          const p = s.participant_id ? people.get(s.participant_id) : undefined;
          hits.push({
            meeting_id: r.meeting.id,
            meeting_title: r.meeting.title,
            meeting_date: r.meeting.recording_start ?? r.meeting.scheduled_start,
            meeting_type: r.meeting.meeting_type,
            segment_id: s.id,
            participant_id: s.participant_id,
            speaker_name: p?.name ?? "Unknown speaker",
            speaker_color: p?.color ?? null,
            snippet: highlightSnippet(s.text, pq),
            start_ms: s.start_ms,
            rank: Math.round(rank * 1000) / 1000,
          });
        }
      }
      const meetingTime = new Map(records.map((r) => [r.meeting.id, meetingDate(r.meeting)]));
      hits.sort(
        (a, b) =>
          b.rank - a.rank ||
          (meetingTime.get(b.meeting_id) ?? "").localeCompare(meetingTime.get(a.meeting_id) ?? "") ||
          a.start_ms - b.start_ms,
      );
      return { hits: hits.slice(0, limit), total: hits.length };
    },

    async listChatMessages(meetingId) {
      return clone(store().chat.filter((m) => m.meeting_id === meetingId));
    },

    async addChatMessage(input) {
      const msg: ChatMessage = { ...input, id: newId("msg"), created_at: nowIso() };
      store().chat.push(msg);
      return clone(msg);
    },

    async listPlaylists() {
      return clone(
        store().playlists.map(({ items, ...p }) => ({ ...p, item_count: items.length })),
      );
    },

    async createPlaylist(input) {
      const p = { id: newId("pl"), workspace_id: store().workspaceId, name: input.name, description: input.description ?? null, created_at: nowIso() };
      store().playlists.unshift({ ...p, items: [] });
      return clone(p);
    },

    async getPlaylist(id) {
      const pl = store().playlists.find((p) => p.id === id);
      return pl ? clone({ ...pl, items: [...pl.items].sort((a, b) => a.position - b.position) }) : null;
    },

    async removePlaylistItem(playlistId, itemId) {
      const pl = store().playlists.find((p) => p.id === playlistId);
      if (!pl) throw new NotFoundError("Playlist");
      if (!pl.items.some((i) => i.id === itemId)) throw new NotFoundError("Playlist item");
      pl.items = pl.items
        .filter((i) => i.id !== itemId)
        .sort((a, b) => a.position - b.position)
        .map((i, position) => ({ ...i, position }));
    },

    async addPlaylistItem(playlistId, input) {
      const pl = store().playlists.find((p) => p.id === playlistId);
      if (!pl) throw new NotFoundError("Playlist");
      if (input.meeting_id) rec(input.meeting_id);
      if (input.highlight_id) findHighlight(input.highlight_id);
      const item: PlaylistItem = {
        id: newId("pli"),
        playlist_id: playlistId,
        meeting_id: input.meeting_id ?? null,
        highlight_id: input.highlight_id ?? null,
        position: pl.items.length,
      };
      pl.items.push(item);
      return clone(item);
    },
    // =====================================================================
    // Phase 5
    // =====================================================================
    async listMeetingDetails(opts) {
      const ids = opts?.ids ? new Set(opts.ids) : null;
      return [...store().meetings.values()]
        .filter((r) => r.meeting.status === "ready" && !r.meeting.deleted_at && (!ids || ids.has(r.meeting.id)))
        .sort((a, b) => meetingDate(b.meeting).localeCompare(meetingDate(a.meeting)))
        .map(toDetail);
    },

    async updateMeetings(ids, patch) {
      if (patch.folder_id) need(store().p.folders.find((f) => f.id === patch.folder_id), "Folder");
      let n = 0;
      for (const id of new Set(ids)) {
        const r = getRec(id);
        if (!r) continue;
        r.meeting = normMeeting({ ...r.meeting, ...patch });
        n++;
      }
      return n;
    },

    // ---- folders
    async listFolders() {
      return [...store().p.folders].sort((a, b) => a.name.localeCompare(b.name)).map(folderWithCount);
    },
    async getFolder(id) {
      const f = store().p.folders.find((x) => x.id === id);
      return f ? folderWithCount(f) : null;
    },
    async createFolder(input) {
      const f = { id: newId("fld"), workspace_id: store().workspaceId, name: input.name, color: input.color ?? null, created_at: nowIso() };
      store().p.folders.push(f);
      return folderWithCount(f);
    },
    async updateFolder(id, patch) {
      const f = need(store().p.folders.find((x) => x.id === id), "Folder");
      if (patch.name !== undefined) f.name = patch.name;
      if (patch.color !== undefined) f.color = patch.color;
      return folderWithCount(f);
    },
    async deleteFolder(id) {
      const s = store();
      need(s.p.folders.find((x) => x.id === id), "Folder");
      s.p.folders = s.p.folders.filter((f) => f.id !== id);
      for (const r of s.meetings.values()) if (r.meeting.folder_id === id) r.meeting.folder_id = null;
    },

    // ---- trackers
    async listTrackers() {
      return clone([...store().p.trackers].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    },
    async getTracker(id) {
      const t = store().p.trackers.find((x) => x.id === id);
      return t ? clone(t) : null;
    },
    async createTracker(input) {
      const t = {
        id: newId("trk"),
        workspace_id: store().workspaceId,
        name: input.name,
        description: input.description ?? null,
        keywords: [...input.keywords],
        color: input.color ?? MEMBER_COLORS[store().p.trackers.length % MEMBER_COLORS.length],
        created_at: nowIso(),
      };
      store().p.trackers.push(t);
      return clone(t);
    },
    async updateTracker(id, patch) {
      const t = need(store().p.trackers.find((x) => x.id === id), "Tracker");
      Object.assign(t, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      return clone(t);
    },
    async deleteTracker(id) {
      need(store().p.trackers.find((x) => x.id === id), "Tracker");
      store().p.trackers = store().p.trackers.filter((t) => t.id !== id);
    },

    // ---- deals
    async listDealOverrides() {
      return clone(store().p.deal_overrides);
    },
    async getDealOverrides(domain) {
      const d = store().p.deal_overrides.find((x) => x.domain === domain.toLowerCase());
      return d ? clone(d) : null;
    },
    async saveDealOverrides(domain, patch) {
      const s = store();
      const key = domain.toLowerCase();
      let d = s.p.deal_overrides.find((x) => x.domain === key);
      if (!d) {
        d = { domain: key, workspace_id: s.workspaceId, updated_at: nowIso() };
        s.p.deal_overrides.push(d);
      }
      const o = d as DealOverrides & { name?: string };
      // null clears a scalar override (falls back to the derived value)
      for (const k of ["name", "stage", "amount", "close_date"] as const) {
        if (patch[k] === undefined) continue;
        if (patch[k] === null) delete o[k];
        else (o as unknown as Record<string, unknown>)[k] = patch[k];
      }
      if (patch.bant) o.bant = { ...o.bant, ...patch.bant };
      if (patch.meddpicc) o.meddpicc = { ...o.meddpicc, ...patch.meddpicc };
      o.updated_at = nowIso();
      return clone(o);
    },

    // ---- comments
    async listComments(meetingId) {
      rec(meetingId);
      return clone(store().p.comments.filter((c) => c.meeting_id === meetingId).sort(commentOrder));
    },
    async getComment(id) {
      const c = store().p.comments.find((x) => x.id === id);
      return c ? clone(c) : null;
    },
    async createComment(meetingId, input) {
      rec(meetingId);
      let timestamp = input.timestamp_ms ?? null;
      if (input.parent_id) {
        const parent = need(store().p.comments.find((c) => c.id === input.parent_id && c.meeting_id === meetingId), "Parent comment");
        if (parent.parent_id) throw new HttpError(400, "validation", "Replies are one level deep");
        timestamp = input.timestamp_ms ?? parent.timestamp_ms;
      }
      const me = currentMember();
      const c: Comment = {
        id: newId("cm"),
        meeting_id: meetingId,
        timestamp_ms: timestamp,
        body: input.body,
        mentions: input.mentions ?? [],
        author_id: me.id,
        author_name: me.name,
        author_color: me.color,
        parent_id: input.parent_id ?? null,
        created_at: nowIso(),
        updated_at: null,
      };
      store().p.comments.push(c);
      return clone(c);
    },
    async updateComment(id, patch) {
      const c = need(store().p.comments.find((x) => x.id === id), "Comment");
      Object.assign(c, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updated_at: nowIso() });
      return clone(c);
    },
    async deleteComment(id) {
      const s = store();
      need(s.p.comments.find((x) => x.id === id), "Comment");
      s.p.comments = s.p.comments.filter((c) => c.id !== id && c.parent_id !== id);
    },

    // ---- reactions
    async listReactions(meetingId) {
      rec(meetingId);
      return clone(store().p.reactions.filter((r) => r.meeting_id === meetingId).sort((a, b) => a.created_at.localeCompare(b.created_at)));
    },
    async toggleReaction(segmentId, emoji) {
      const s = store();
      const { r } = findSegment(segmentId);
      const me = s.user;
      const existing = s.p.reactions.find((x) => x.segment_id === segmentId && x.user_id === me.id && x.emoji === emoji);
      if (existing) s.p.reactions = s.p.reactions.filter((x) => x !== existing);
      else {
        const reaction: Reaction = {
          id: newId("rx"),
          meeting_id: r.meeting.id,
          segment_id: segmentId,
          emoji,
          user_id: me.id,
          user_name: me.name,
          created_at: nowIso(),
        };
        s.p.reactions.push(reaction);
      }
      return {
        added: !existing,
        meeting_id: r.meeting.id,
        reactions: clone(s.p.reactions.filter((x) => x.segment_id === segmentId).sort((a, b) => a.created_at.localeCompare(b.created_at))),
      };
    },

    // ---- webhooks
    async listWebhooks() {
      return clone([...store().p.webhooks].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
    async getWebhook(id) {
      const w = store().p.webhooks.find((x) => x.id === id);
      return w ? clone(w) : null;
    },
    async createWebhook(input) {
      const w = {
        id: newId("wh"),
        workspace_id: store().workspaceId,
        url: input.url,
        description: input.description ?? null,
        events: [...input.events],
        secret: `whsec_${randomBytes(24).toString("hex")}`,
        active: input.active ?? true,
        last_status: null,
        last_delivery_at: null,
        created_at: nowIso(),
      };
      store().p.webhooks.push(w);
      return clone(w);
    },
    async updateWebhook(id, patch) {
      const w = need(store().p.webhooks.find((x) => x.id === id), "Webhook");
      const { rotate_secret, ...rest } = patch;
      Object.assign(w, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
      if (rotate_secret) w.secret = `whsec_${randomBytes(24).toString("hex")}`;
      return clone(w);
    },
    async deleteWebhook(id) {
      const s = store();
      need(s.p.webhooks.find((x) => x.id === id), "Webhook");
      s.p.webhooks = s.p.webhooks.filter((w) => w.id !== id);
      s.p.webhook_deliveries = s.p.webhook_deliveries.filter((d) => d.webhook_id !== id);
    },
    async listWebhookDeliveries(webhookId, limit = 50) {
      need(store().p.webhooks.find((x) => x.id === webhookId), "Webhook");
      return clone(
        store()
          .p.webhook_deliveries.filter((d) => d.webhook_id === webhookId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, limit),
      );
    },
    async recordWebhookDelivery(input) {
      const w = need(store().p.webhooks.find((x) => x.id === input.webhook_id), "Webhook");
      const d = { ...input, id: input.id ?? newId("whd"), created_at: nowIso() };
      store().p.webhook_deliveries.push(d);
      w.last_status = d.status_code ?? 0;
      w.last_delivery_at = d.created_at;
      return clone(d);
    },

    // ---- slack
    async getSlackConfig() {
      const s = store();
      return clone(s.p.slack_config ?? defaultSlackConfig(s.workspaceId, nowIso()));
    },
    async saveSlackConfig(patch) {
      const s = store();
      const base = s.p.slack_config ?? defaultSlackConfig(s.workspaceId, nowIso());
      s.p.slack_config = {
        ...base,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        workspace_id: s.workspaceId,
        updated_at: nowIso(),
      };
      return clone(s.p.slack_config);
    },

    // ---- CRM
    async listCrmSyncLogs(meetingId) {
      return clone(
        store()
          .p.crm_sync_logs.filter((l) => !meetingId || l.meeting_id === meetingId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
    },
    async addCrmSyncLog(input) {
      rec(input.meeting_id);
      const l = { ...input, id: newId("crm"), created_at: nowIso() };
      store().p.crm_sync_logs.push(l);
      return clone(l);
    },

    // ---- bot sessions
    async listBotSessions(limit = 20) {
      return clone([...store().bots].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit));
    },
    async getBotSession(id) {
      const b = botOf(id);
      return b ? clone(b) : null;
    },
    async createBotSession(input) {
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      const b: BotSession = {
        // Self-contained id: other instances rebuild the session from it (see botOf).
        id: encodeBotToken({ meeting_url: input.meeting_url, platform: input.platform, created_at_ms: nowMs, title: input.title }),
        workspace_id: store().workspaceId,
        meeting_url: input.meeting_url,
        platform: input.platform,
        title: input.title,
        state: "joining",
        simulated: true,
        meeting_id: null,
        error: null,
        events: [{ state: "joining", at: now, note: null }],
        created_at: now,
        joined_at: null,
        admitted_at: null,
        recording_ended_at: null,
        completed_at: null,
        updated_at: now,
      };
      store().bots.push(b);
      return clone(b);
    },
    async updateBotSession(id, patch) {
      const b = need(botOf(id) ?? undefined, "Bot session");
      Object.assign(b, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updated_at: nowIso() });
      return clone(b);
    },

    async cloneMeetingFromTemplate(templateMeetingId, overrides) {
      const s = store();
      const src = templateRecord(templateMeetingId);
      if (!src) throw new NotFoundError("Template meeting");
      const recordedBy = overrides.recorded_by !== undefined ? overrides.recorded_by : s.user.name;
      const bot = overrides.bot_session_id ? decodeBotToken(overrides.bot_session_id) : null;
      if (bot && overrides.bot_session_id) {
        // Deterministic + idempotent: any instance can rebuild the same meeting from the bot id (see getRec).
        const id = botMeetingId(overrides.bot_session_id);
        if (getRec(id)) return id;
        s.meetings.set(id, cloneRecord(src, id, { title: overrides.title, recordedBy, startMs: bot.created_at_ms }));
        return id;
      }
      const id = newId();
      s.meetings.set(id, cloneRecord(src, id, { title: overrides.title, recordedBy, startMs: Date.now() - src.meeting.duration_sec * 1000 }));
      return id;
    },

    // ---- calendar
    async listCalendarEvents(range) {
      const rule = store().p.prefs.auto_record_rule;
      return clone(
        store()
          .calendar.filter((e) => overlaps(e, range))
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((e) => toCalendarEvent(e, rule)),
      );
    },
    async setCalendarRecord(eventId, record) {
      const e = need(store().calendar.find((x) => x.id === eventId), "Calendar event");
      e.record_override = record;
      return clone(toCalendarEvent(e, store().p.prefs.auto_record_rule));
    },

    // ---- prefs
    async getPrefs() {
      const s = store();
      s.p.prefs ??= defaultPrefs(s.user.id, nowIso());
      return clone(s.p.prefs);
    },
    async updatePrefs(patch) {
      const s = store();
      s.p.prefs = {
        ...(s.p.prefs ?? defaultPrefs(s.user.id, nowIso())),
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        user_id: s.user.id,
        updated_at: nowIso(),
      };
      return clone(s.p.prefs);
    },
    async getAutoRecordRule() {
      return store().p.prefs?.auto_record_rule ?? "all";
    },

    // ---- session & team
    async getCurrentSession() {
      const s = store();
      return clone({ user: s.user, workspace: s.workspace, member: currentMember(), auth_mode: "demo" as const });
    },
    async listTeamMembers() {
      return clone(
        [...store().p.team_members].sort(
          (a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || a.name.localeCompare(b.name),
        ),
      );
    },
    async inviteTeamMembers(emails, role) {
      const s = store();
      const known = new Set(s.p.team_members.map((m) => m.email.toLowerCase()));
      const out: TeamMember[] = [];
      for (const raw of emails) {
        const email = raw.trim().toLowerCase();
        if (!email || known.has(email)) continue;
        known.add(email);
        const m: TeamMember = {
          id: newId("tm"),
          workspace_id: s.workspaceId,
          name: nameFromEmail(email),
          email,
          role,
          title: null,
          team: null,
          color: MEMBER_COLORS[s.p.team_members.length % MEMBER_COLORS.length],
          status: "invited",
          invited_at: nowIso(),
          joined_at: null,
        };
        s.p.team_members.push(m);
        out.push(m);
      }
      return clone(out);
    },
    async updateTeamMember(id, patch) {
      const m = need(store().p.team_members.find((x) => x.id === id), "Team member");
      Object.assign(m, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      return clone(m);
    },
    async removeTeamMember(id) {
      const s = store();
      const m = need(s.p.team_members.find((x) => x.id === id), "Team member");
      if (m.id === s.user.id) throw new HttpError(409, "conflict", "You can't remove yourself");
      if (m.role === "owner") throw new HttpError(409, "conflict", "The workspace owner can't be removed");
      s.p.team_members = s.p.team_members.filter((x) => x.id !== id);
    },

    // ---- notifications
    async listNotifications(opts) {
      const s = store();
      const mine = s.p.notifications.filter((n) => n.user_id === s.user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const unread_count = mine.filter((n) => !n.read_at).length;
      const list = (opts?.unread ? mine.filter((n) => !n.read_at) : mine).slice(0, opts?.limit ?? 50);
      return clone({ notifications: list, unread_count });
    },
    async createNotification(input) {
      const s = store();
      const n: Notification = { ...input, user_id: input.user_id ?? s.user.id, id: newId("ntf"), read_at: null, created_at: nowIso() };
      s.p.notifications.push(n);
      return clone(n);
    },
    async markNotificationsRead(ids) {
      const s = store();
      const set = ids ? new Set(ids) : null;
      const now = nowIso();
      for (const n of s.p.notifications) if (n.user_id === s.user.id && !n.read_at && (!set || set.has(n.id))) n.read_at = now;
      return s.p.notifications.filter((n) => n.user_id === s.user.id && !n.read_at).length;
    },
  };
}
