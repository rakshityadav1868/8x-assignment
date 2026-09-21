import { UpdateCommentRequest, type CommentResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { HttpError, NotFoundError, ok, parseBody, route } from "@/lib/server/api";
import { notifyMentions } from "@/lib/server/collab";
import { safeSession } from "@/lib/server/events";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

async function requireOwnComment(id: string) {
  const repo = getRepo();
  const comment = await repo.getComment(id);
  if (!comment) throw new NotFoundError("Comment");
  const session = await safeSession();
  if (session && comment.author_id !== session.user.id && comment.author_id !== session.member.id) {
    throw new HttpError(403, "forbidden", "You can only change your own comments.");
  }
  return comment;
}

/** PATCH /api/comments/:id (author only) — new @mentions notify. */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateCommentRequest);
  const before = await requireOwnComment(id);
  const repo = getRepo();
  const comment = await repo.updateComment(id, body);
  if (body.mentions) {
    const added = body.mentions.filter((m) => !before.mentions.includes(m));
    if (added.length) {
      const meeting = await repo.getMeeting(comment.meeting_id);
      await notifyMentions(comment, added, meeting?.title ?? "a call");
    }
  }
  return Response.json({ comment } satisfies CommentResponse);
});

/** DELETE /api/comments/:id (author only; also deletes replies). */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await requireOwnComment(id);
  await getRepo().deleteComment(id);
  return ok();
});
