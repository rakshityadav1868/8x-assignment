import { CreateCommentRequest, type CommentResponse, type ListCommentsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { HttpError, parseBody, requireMeeting, route } from "@/lib/server/api";
import { notifyMentions } from "@/lib/server/collab";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/meetings/:id/comments — timestamp_ms asc (general comments last), then created_at. */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await requireMeeting(id);
  const comments = await getRepo().listComments(id);
  return Response.json({ comments } satisfies ListCommentsResponse);
});

/** POST /api/meetings/:id/comments — author = current user; @mentions notify the mentioned members. */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, CreateCommentRequest);
  const meeting = await requireMeeting(id);
  const repo = getRepo();
  if (body.timestamp_ms != null && meeting.duration_sec && body.timestamp_ms > meeting.duration_sec * 1000 + 1000) {
    throw new HttpError(400, "validation", "timestamp_ms is past the end of the recording");
  }
  if (body.parent_id) {
    const parent = await repo.getComment(body.parent_id);
    if (!parent || parent.meeting_id !== id) throw new HttpError(400, "validation", "parent_id must be a comment on this meeting");
    if (parent.parent_id) throw new HttpError(400, "validation", "Replies can only be one level deep");
  }
  const mentions = Array.from(new Set(body.mentions ?? []));
  const comment = await repo.createComment(id, {
    body: body.body,
    timestamp_ms: body.timestamp_ms ?? null,
    mentions,
    parent_id: body.parent_id ?? null,
  });
  await notifyMentions(comment, mentions, meeting.title);
  return Response.json({ comment } satisfies CommentResponse, { status: 201 });
});
