"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ROUTES } from "@/lib/routes";
import type {
  CommentResponse,
  CreateCommentRequest,
  ListCommentsResponse,
  ListReactionsResponse,
  ListTeamResponse,
  MeResponse,
  MeetingTrackerHitsResponse,
  ToggleReactionResponse,
  UpdateCommentRequest,
} from "@/lib/contracts";
import type { Comment, ReactionEmoji, ReactionSummary, TeamMember, Tracker, TrackerHit } from "@/lib/types";
import { api } from "@/lib/ui/api";
import { apiErrorMessage } from "@/hooks/use-api";
import { useCall } from "./call-context";

/**
 * Phase 5 collaboration data for the call page, loaded client-side after hydration so the page shell
 * never waits on (or breaks because of) these endpoints. Kept separate from CallContext so comment /
 * reaction updates don't re-render the whole call page.
 */
type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

export interface CallExtrasValue {
  me: MeResponse | null;
  team: TeamMember[];
  comments: Load<Comment[]>;
  reloadComments: () => void;
  createComment: (req: CreateCommentRequest) => Promise<Comment | null>;
  updateComment: (id: string, req: UpdateCommentRequest) => Promise<boolean>;
  deleteComment: (id: string) => Promise<boolean>;
  isOwnComment: (c: Comment) => boolean;
  focusedCommentId: string | null;
  focusComment: (id: string | null) => void;
  reactionsBySegment: Map<string, ReactionSummary[]>;
  reactionsReady: boolean;
  toggleReaction: (segmentId: string, emoji: ReactionEmoji) => void;
  trackers: Load<{ trackers: Tracker[]; hits: TrackerHit[] }>;
}

const Ctx = createContext<CallExtrasValue | null>(null);

export function useCallExtras(): CallExtrasValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCallExtras must be used within <CallExtrasProvider>");
  return v;
}

function sortComments(list: Comment[]): Comment[] {
  return [...list].sort((a, b) => {
    const at = a.timestamp_ms ?? Number.MAX_SAFE_INTEGER;
    const bt = b.timestamp_ms ?? Number.MAX_SAFE_INTEGER;
    return at - bt || a.created_at.localeCompare(b.created_at);
  });
}

export function CallExtrasProvider({ children }: { children: React.ReactNode }) {
  const { meeting, readOnly, setTab } = useCall();
  const meetingId = meeting.id;
  const [me, setMe] = useState<MeResponse | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [comments, setComments] = useState<Load<Comment[]>>({ status: "loading" });
  const [commentsNonce, setCommentsNonce] = useState(0);
  const [reactions, setReactions] = useState<ReactionSummary[]>([]);
  const [reactionsReady, setReactionsReady] = useState(false);
  const [trackers, setTrackers] = useState<Load<{ trackers: Tracker[]; hits: TrackerHit[] }>>({ status: "loading" });
  // Deep link: /calls/:id?t=…#comment-<id> → focus that comment (and open the Comments tab, below).
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const m = /^#comment-(.+)$/.exec(window.location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  });
  const ownIds = useRef(new Set<string>());

  useEffect(() => {
    if (readOnly) return;
    const ctrl = new AbortController();
    api<MeResponse>(ROUTES.api.me, { signal: ctrl.signal })
      .then(setMe)
      .catch(() => {});
    api<ListTeamResponse>(ROUTES.api.team, { signal: ctrl.signal })
      .then((r) => setTeam(r.members))
      .catch(() => {});
    return () => ctrl.abort();
  }, [readOnly]);

  useEffect(() => {
    const ctrl = new AbortController();
    api<ListCommentsResponse>(ROUTES.api.comments(meetingId), { signal: ctrl.signal, cache: "no-store" })
      .then((r) => setComments({ status: "ready", data: sortComments(r.comments) }))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setComments({ status: "error", message: apiErrorMessage(e) });
      });
    return () => ctrl.abort();
  }, [meetingId, commentsNonce]);

  useEffect(() => {
    const ctrl = new AbortController();
    api<ListReactionsResponse>(ROUTES.api.reactions(meetingId), { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        setReactions(r.reactions);
        setReactionsReady(true);
      })
      .catch(() => {});
    api<MeetingTrackerHitsResponse>(ROUTES.api.meetingTrackers(meetingId), { signal: ctrl.signal, cache: "no-store" })
      .then((r) => setTrackers({ status: "ready", data: { trackers: r.trackers, hits: r.hits } }))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setTrackers({ status: "error", message: apiErrorMessage(e) });
      });
    return () => ctrl.abort();
  }, [meetingId]);

  useEffect(() => {
    if (/^#comment-/.test(window.location.hash)) setTab("comments");
  }, [setTab]);

  const reloadComments = useCallback(() => {
    setComments({ status: "loading" });
    setCommentsNonce((n) => n + 1);
  }, []);

  const createComment = useCallback(
    async (req: CreateCommentRequest) => {
      try {
        const r = await api<CommentResponse>(ROUTES.api.comments(meetingId), { method: "POST", json: req });
        ownIds.current.add(r.comment.id);
        setComments((prev) => ({
          status: "ready",
          data: sortComments([...(prev.status === "ready" ? prev.data : []), r.comment]),
        }));
        return r.comment;
      } catch (e) {
        toast.error("Couldn't post comment", { description: apiErrorMessage(e) });
        return null;
      }
    },
    [meetingId],
  );

  const updateComment = useCallback(async (id: string, req: UpdateCommentRequest) => {
    try {
      const r = await api<CommentResponse>(ROUTES.api.comment(id), { method: "PATCH", json: req });
      setComments((prev) =>
        prev.status === "ready"
          ? { status: "ready", data: sortComments(prev.data.map((c) => (c.id === id ? r.comment : c))) }
          : prev,
      );
      return true;
    } catch (e) {
      toast.error("Couldn't save comment", { description: apiErrorMessage(e) });
      return false;
    }
  }, []);

  const commentsRef = useRef(comments);
  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);
  const deleteComment = useCallback(async (id: string) => {
    const snapshot = commentsRef.current;
    if (snapshot.status === "ready") {
      setComments({ status: "ready", data: snapshot.data.filter((c) => c.id !== id && c.parent_id !== id) });
    }
    try {
      await api(ROUTES.api.comment(id), { method: "DELETE" });
      toast.success("Comment deleted");
      return true;
    } catch (e) {
      setComments(snapshot);
      toast.error("Couldn't delete comment", { description: apiErrorMessage(e) });
      return false;
    }
  }, []);

  const isOwnComment = useCallback(
    (c: Comment) => {
      if (readOnly) return false;
      if (ownIds.current.has(c.id)) return true;
      if (!me) return false;
      return c.author_id === me.user.id || c.author_id === me.member.id;
    },
    [me, readOnly],
  );

  const reactionsBySegment = useMemo(() => {
    const m = new Map<string, ReactionSummary[]>();
    for (const r of reactions) {
      const list = m.get(r.segment_id);
      if (list) list.push(r);
      else m.set(r.segment_id, [r]);
    }
    return m;
  }, [reactions]);

  const myName = me?.user.name ?? "You";
  const reactionsRef = useRef(reactions);
  useEffect(() => {
    reactionsRef.current = reactions;
  }, [reactions]);
  const toggleReaction = useCallback(
    (segmentId: string, emoji: ReactionEmoji) => {
      const all = reactionsRef.current;
      const before = all.filter((r) => r.segment_id === segmentId);
      const cur = before.find((r) => r.emoji === emoji);
      let nextSeg: ReactionSummary[];
      if (cur?.reacted_by_me) {
        nextSeg =
          cur.count <= 1
            ? before.filter((r) => r !== cur)
            : before.map((r) =>
                r === cur
                  ? { ...r, count: r.count - 1, reacted_by_me: false, user_names: r.user_names.filter((n) => n !== myName) }
                  : r,
              );
      } else if (cur) {
        nextSeg = before.map((r) =>
          r === cur ? { ...r, count: r.count + 1, reacted_by_me: true, user_names: [...r.user_names, myName] } : r,
        );
      } else {
        nextSeg = [...before, { segment_id: segmentId, emoji, count: 1, reacted_by_me: true, user_names: [myName] }];
      }
      const replace = (list: ReactionSummary[]) => (prev: ReactionSummary[]) => {
        const next = [...prev.filter((x) => x.segment_id !== segmentId), ...list];
        reactionsRef.current = next;
        return next;
      };
      setReactions(replace(nextSeg));
      api<ToggleReactionResponse>(ROUTES.api.segmentReactions(segmentId), { method: "POST", json: { emoji } })
        .then((r) => setReactions(replace(r.reactions)))
        .catch((e: unknown) => {
          setReactions(replace(before));
          toast.error("Couldn't react", { description: apiErrorMessage(e) });
        });
    },
    [myName],
  );

  const value = useMemo<CallExtrasValue>(
    () => ({
      me,
      team,
      comments,
      reloadComments,
      createComment,
      updateComment,
      deleteComment,
      isOwnComment,
      focusedCommentId,
      focusComment: setFocusedCommentId,
      reactionsBySegment,
      reactionsReady,
      toggleReaction,
      trackers,
    }),
    [
      me,
      team,
      comments,
      reloadComments,
      createComment,
      updateComment,
      deleteComment,
      isOwnComment,
      focusedCommentId,
      reactionsBySegment,
      reactionsReady,
      toggleReaction,
      trackers,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
