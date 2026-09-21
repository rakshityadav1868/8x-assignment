import "server-only";
import { getRepo } from "@/lib/db";
import { ROUTES } from "@/lib/routes";
import type { Comment, Reaction, ReactionSummary } from "@/lib/types";
import { safePrefs } from "./summaries";

/** Aggregate raw reactions into per (segment, emoji) chips, in first-reaction order. */
export function summarizeReactions(reactions: Reaction[], myUserId: string | null): ReactionSummary[] {
  const map = new Map<string, ReactionSummary>();
  for (const r of [...reactions].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = `${r.segment_id}\u0000${r.emoji}`;
    const cur = map.get(key) ?? { segment_id: r.segment_id, emoji: r.emoji, count: 0, reacted_by_me: false, user_names: [] };
    cur.count += 1;
    if (myUserId && r.user_id === myUserId) cur.reacted_by_me = true;
    if (!cur.user_names.includes(r.user_name)) cur.user_names.push(r.user_name);
    map.set(key, cur);
  }
  return [...map.values()];
}

/** One `mention` notification per newly-mentioned team member (never for the author). Never throws. */
export async function notifyMentions(comment: Comment, mentionIds: string[], meetingTitle: string): Promise<void> {
  const ids = Array.from(new Set(mentionIds)).filter((id) => id !== comment.author_id);
  if (!ids.length) return;
  const prefs = await safePrefs();
  if (prefs && !prefs.notify_mentions) return;
  const repo = getRepo();
  const href =
    comment.timestamp_ms != null
      ? ROUTES.pages.callComment(comment.meeting_id, comment.id, comment.timestamp_ms)
      : `${ROUTES.pages.call(comment.meeting_id)}#comment-${comment.id}`;
  await Promise.allSettled(
    ids.map((user_id) =>
      repo.createNotification({
        user_id,
        kind: "mention",
        title: `${comment.author_name} mentioned you on “${meetingTitle}”`,
        body: comment.body.length > 200 ? `${comment.body.slice(0, 199)}…` : comment.body,
        href,
        meeting_id: comment.meeting_id,
        actor_name: comment.author_name,
      }),
    ),
  );
}
