"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Clock, CornerDownRight, Link2, Loader2, MessageSquare, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState, TimestampChip } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { usePlayer, usePlayerStore } from "@/hooks/use-player";
import { ROUTES } from "@/lib/routes";
import type { Comment } from "@/lib/types";
import { copyText } from "@/lib/ui/api";
import { formatClock } from "@/lib/ui/format";
import { timeAgo } from "@/lib/ui/time-ago";
import { cn } from "@/lib/utils";
import { useCall } from "./call-context";
import { useCallExtras } from "./call-extras";
import { MentionTextarea, extractMentions, renderWithMentions, type MentionCandidate, type MentionTextareaHandle } from "./mention-textarea";

function useMentionCandidates(): MentionCandidate[] {
  const { team } = useCallExtras();
  const { participants } = useCall();
  return useMemo(() => {
    const out: MentionCandidate[] = [];
    const seen = new Set<string>();
    for (const m of team) {
      if (m.status !== "active") continue;
      out.push({ key: `m-${m.id}`, member_id: m.id, name: m.name, email: m.email, color: m.color, subtitle: m.title });
      seen.add(m.email.toLowerCase());
      seen.add(m.name.toLowerCase());
    }
    for (const p of participants) {
      if ((p.email && seen.has(p.email.toLowerCase())) || seen.has(p.name.toLowerCase())) continue;
      out.push({ key: `p-${p.id}`, member_id: null, name: p.name, email: p.email, color: p.color, subtitle: p.is_external ? "External participant" : null });
    }
    return out;
  }, [team, participants]);
}

export function CommentsPanel({ active }: { active: boolean }) {
  const { readOnly } = useCall();
  const { comments, reloadComments, focusedCommentId, focusComment } = useCallExtras();
  const candidates = useMentionCandidates();
  const names = useMemo(() => candidates.map((c) => c.name), [candidates]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { roots, replies } = useMemo(() => {
    const list = comments.status === "ready" ? comments.data : [];
    const byParent = new Map<string, Comment[]>();
    const r: Comment[] = [];
    for (const c of list) {
      if (c.parent_id) byParent.set(c.parent_id, [...(byParent.get(c.parent_id) ?? []), c]);
      else r.push(c);
    }
    for (const [k, v] of byParent) byParent.set(k, [...v].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    return { roots: r, replies: byParent };
  }, [comments]);

  // Scroll a focused comment (deep link, timeline marker) into view once it's rendered.
  useEffect(() => {
    if (!active || !focusedCommentId || comments.status !== "ready") return;
    const t = setTimeout(() => {
      document.getElementById(`comment-${focusedCommentId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
    const clear = setTimeout(() => focusComment(null), 3200);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [active, focusedCommentId, comments.status, focusComment]);

  const total = comments.status === "ready" ? comments.data.length : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <p className="text-[13px] font-medium">
          {total} {total === 1 ? "comment" : "comments"}
        </p>
        <span className="ml-auto text-[11px] text-muted-foreground">Timestamped · @mention teammates</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3 [scrollbar-width:thin]">
        {comments.status === "loading" ? (
          <CommentsSkeleton />
        ) : comments.status === "error" ? (
          <ErrorState title="Couldn't load comments" description={comments.message} onRetry={reloadComments} />
        ) : roots.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No comments yet"
            description={
              readOnly ? "Nobody has commented on this call." : "Pause on a moment and leave a note for your team. Type @ to mention someone."
            }
          />
        ) : (
          <ul className="space-y-1">
            {roots.map((c) => (
              <li key={c.id}>
                <CommentItem comment={c} names={names} candidates={candidates} focused={focusedCommentId === c.id} />
                {(replies.get(c.id)?.length ?? 0) > 0 && (
                  <ul className="ml-9 border-l border-white/[0.06] pl-2">
                    {replies.get(c.id)!.map((r) => (
                      <li key={r.id}>
                        <CommentItem comment={r} names={names} candidates={candidates} focused={focusedCommentId === r.id} isReply />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!readOnly && <Composer candidates={candidates} onPosted={() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" })} />}
    </div>
  );
}

function CommentsSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-2.5">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

const CommentItem = memo(function CommentItem({
  comment: c,
  names,
  candidates,
  focused,
  isReply = false,
}: {
  comment: Comment;
  names: string[];
  candidates: MentionCandidate[];
  focused: boolean;
  isReply?: boolean;
}) {
  const store = usePlayerStore();
  const { meeting, readOnly, setTab } = useCall();
  const { isOwnComment, updateComment, deleteComment, createComment } = useCallExtras();
  const own = isOwnComment(c);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [saving, setSaving] = useState(false);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    if (body === c.body) return setEditing(false);
    setSaving(true);
    const ok = await updateComment(c.id, { body, mentions: extractMentions(body, candidates) });
    setSaving(false);
    if (ok) setEditing(false);
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!body) return;
    setSaving(true);
    const r = await createComment({
      body,
      parent_id: c.id,
      timestamp_ms: c.timestamp_ms,
      mentions: extractMentions(body, candidates),
    });
    setSaving(false);
    if (r) {
      setReply("");
      setReplying(false);
    }
  };

  const copyLink = async () => {
    const path =
      c.timestamp_ms != null
        ? ROUTES.pages.callComment(meeting.id, c.id, c.timestamp_ms)
        : `${ROUTES.pages.call(meeting.id)}#comment-${c.id}`;
    if (await copyText(`${window.location.origin}${path}`)) toast.success("Link to comment copied");
  };

  return (
    <div
      id={`comment-${c.id}`}
      className={cn(
        "group scroll-mt-4 rounded-xl px-2 py-2 transition-[background-color,box-shadow] duration-500",
        focused ? "bg-sky-400/[0.10] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.45)]" : "hover:bg-white/[0.03]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <ParticipantAvatar person={{ name: c.author_name, color: c.author_color }} size={isReply ? "sm" : "md"} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-medium">{c.author_name}</span>
            {c.timestamp_ms != null && !isReply && (
              <TimestampChip
                ms={c.timestamp_ms}
                onClick={() => {
                  store.seek(c.timestamp_ms!);
                }}
              />
            )}
            <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
              {timeAgo(c.created_at)}
              {c.updated_at && " · edited"}
            </span>
            {!editing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Comment actions"
                    className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={copyLink}>
                    <Link2 /> Copy link
                  </DropdownMenuItem>
                  {c.timestamp_ms != null && (
                    <DropdownMenuItem
                      onSelect={() => {
                        store.seek(c.timestamp_ms!, { play: true });
                        setTab("transcript");
                      }}
                    >
                      <Clock /> Play from {formatClock(c.timestamp_ms)}
                    </DropdownMenuItem>
                  )}
                  {own && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          setDraft(c.body);
                          setEditing(true);
                        }}
                      >
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => void deleteComment(c.id)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {editing ? (
            <div className="mt-1.5">
              <MentionTextarea
                value={draft}
                onChange={setDraft}
                candidates={candidates}
                onSubmit={save}
                onCancel={() => setEditing(false)}
                autoFocus
                ariaLabel="Edit comment"
                className="min-h-12"
              />
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <span className="mr-auto text-[10px] text-muted-foreground">⌘↵ save · Esc cancel</span>
                <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="xs" onClick={save} disabled={saving || !draft.trim()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/85">
              {renderWithMentions(c.body, names)}
            </p>
          )}
          {!readOnly && !isReply && !editing && (
            <div className="mt-1">
              {replying ? (
                <div className="mt-1.5">
                  <MentionTextarea
                    value={reply}
                    onChange={setReply}
                    candidates={candidates}
                    onSubmit={sendReply}
                    onCancel={() => setReplying(false)}
                    autoFocus
                    placeholder="Reply…"
                    ariaLabel="Reply"
                    className="min-h-10"
                  />
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <Button size="xs" variant="ghost" onClick={() => setReplying(false)}>
                      Cancel
                    </Button>
                    <Button size="xs" onClick={sendReply} disabled={saving || !reply.trim()}>
                      Reply
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setReplying(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <CornerDownRight className="size-3" /> Reply
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function Composer({ candidates, onPosted }: { candidates: MentionCandidate[]; onPosted: () => void }) {
  const { createComment } = useCallExtras();
  const store = usePlayerStore();
  const sec = usePlayer((s) => Math.floor(s.currentMs / 1000));
  const [body, setBody] = useState("");
  const [atTime, setAtTime] = useState(true);
  const [posting, setPosting] = useState(false);
  const ref = useRef<MentionTextareaHandle>(null);

  const post = async () => {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    const ms = atTime ? Math.floor(store.getState().currentMs / 1000) * 1000 : null;
    const c = await createComment({ body: text, timestamp_ms: ms, mentions: extractMentions(text, candidates) });
    setPosting(false);
    if (c) {
      setBody("");
      toast.success(ms != null ? `Comment added at ${formatClock(ms)}` : "Comment added");
      onPosted();
      ref.current?.focus();
    }
  };

  return (
    <div className="border-t border-white/[0.06] p-3">
      <MentionTextarea
        ref={ref}
        value={body}
        onChange={setBody}
        candidates={candidates}
        onSubmit={post}
        placeholder={atTime ? `Comment at ${formatClock(sec * 1000)}… (type @ to mention)` : "Add a general comment… (type @ to mention)"}
        ariaLabel="New comment"
      />
      <div className="mt-2 flex items-center gap-2">
        {atTime ? (
          <button
            type="button"
            onClick={() => setAtTime(false)}
            title="Remove timestamp"
            className="inline-flex h-7 items-center gap-1 rounded-full border border-sky-400/30 bg-primary/15 pl-2 pr-1.5 font-mono text-[11px] tabular-nums text-sky-200 hover:bg-primary/25"
          >
            <Clock className="size-3" /> {formatClock(sec * 1000)} <X className="size-3 opacity-70" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAtTime(true)}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Clock className="size-3" /> Add timestamp
          </button>
        )}
        <span className="hidden text-[10px] text-muted-foreground sm:inline">⌘↵ to post</span>
        <Button size="sm" className="ml-auto" onClick={post} disabled={!body.trim() || posting}>
          {posting && <Loader2 className="animate-spin" />}
          {atTime ? `Comment at ${formatClock(sec * 1000)}` : "Comment"}
        </Button>
      </div>
    </div>
  );
}
