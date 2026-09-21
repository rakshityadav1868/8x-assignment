import "server-only";
import { createHash } from "node:crypto";
import { seedMeetings, seedWorkspace } from "@/data/seed";
import { NotFoundError } from "@/lib/server/errors";
import { newId, newToken, nowIso } from "@/lib/server/ids";
import { Bm25, highlightSnippet, matchRank, parseQuery, words } from "@/lib/search/text";
import type {
  ActionItem,
  ChatMessage,
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
  UpcomingMeeting,
} from "@/lib/types";
import { CLIP_TOKEN_PREFIX, decodeClipToken, encodeClipToken } from "./clip-token";
import type { Repo } from "./repo";
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
  upcoming: UpcomingMeeting[];
  playlists: (Playlist & { items: PlaylistItem[] })[];
  chat: ChatMessage[];
  workspaceId: string;
  /** Self-contained clip tokens of highlights deleted in this instance (so they stop resolving here). */
  deletedClipTokens?: Set<string>;
}

const g = globalThis as unknown as { __fanthomSeedStore?: Store };

function loadStore(): Store {
  // Seed JSON is written against a fixed canonical week; move every timestamp forward by whole weeks so the
  // flagship Q4 meeting is the most recent Thursday and upcoming meetings fall in the next 7 days.
  const shifted = shiftSeed(seedMeetings as SeedMeetingFile[], seedWorkspace as SeedWorkspaceFile & { anchor?: SeedAnchor });
  const meetings = new Map<string, MeetingRecord>();
  for (const file of shifted.meetings) {
    const { decisions, ...rest } = file;
    meetings.set(file.meeting.id, { ...rest, decisions: decisions ?? null, invited_emails: [] });
  }
  const ws = shifted.workspace;
  return { meetings, upcoming: ws.upcoming, playlists: ws.playlists, chat: [], workspaceId: ws.workspace.id };
}

function store(): Store {
  if (!g.__fanthomSeedStore) g.__fanthomSeedStore = loadStore();
  return g.__fanthomSeedStore;
}

const clone = <T>(v: T): T => structuredClone(v);
const byStart = (a: { start_ms: number }, b: { start_ms: number }) => a.start_ms - b.start_ms;
const meetingDate = (m: Meeting) => m.recording_start ?? m.scheduled_start ?? m.created_at;

function rec(id: string): MeetingRecord {
  const r = store().meetings.get(id);
  if (!r) throw new NotFoundError("Meeting");
  return r;
}

function toDetail(r: MeetingRecord): MeetingDetail {
  return clone({
    meeting: r.meeting,
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

export function createSeedRepo(): Repo {
  return {
    async listMeetings(): Promise<MeetingListItem[]> {
      return [...store().meetings.values()]
        .map((r) => ({
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
        }))
        .sort((a, b) =>
          (b.recording_start ?? b.scheduled_start ?? b.created_at).localeCompare(a.recording_start ?? a.scheduled_start ?? a.created_at),
        )
        .map(clone);
    },

    async listUpcoming() {
      const now = Date.now();
      return clone(store().upcoming.filter((u) => new Date(u.end).getTime() > now - 3600e3).sort((a, b) => a.start.localeCompare(b.start)));
    },

    async getMeeting(id) {
      const r = store().meetings.get(id);
      return r ? clone(r.meeting) : null;
    },

    async getMeetingDetail(id) {
      const r = store().meetings.get(id);
      return r ? toDetail(r) : null;
    },

    async getMeetingDetailByShareToken(token) {
      for (const r of store().meetings.values()) if (r.meeting.share_token === token) return toDetail(r);
      return null;
    },

    async createMeeting(input) {
      const meeting: Meeting = { ...input, workspace_id: input.workspace_id ?? store().workspaceId, id: newId(), created_at: nowIso() };
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
      r.meeting = { ...r.meeting, ...patch, id: r.meeting.id, workspace_id: r.meeting.workspace_id, created_at: r.meeting.created_at };
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
      const r = store().meetings.get(meetingId);
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
      const r = store().meetings.get(d.meeting_id);
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
      const r = store().meetings.get(meetingId);
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
  };
}
