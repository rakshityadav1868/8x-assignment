import { CreateShareRequest, ROUTES, type CreateShareResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { appOrigin, ok, parseBody, requireMeeting, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** POST /api/meetings/:id/share — create (or reuse) the share token and set access. */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, CreateShareRequest);
  await requireMeeting(id);
  const meeting = await getRepo().setShare(id, body.access, body.invited_emails);
  const token = meeting.share_token!;
  return Response.json({
    share_token: token,
    share_url: `${appOrigin(req)}${ROUTES.pages.share(token)}`,
    access: meeting.share_access,
  } satisfies CreateShareResponse);
});

/** DELETE /api/meetings/:id/share — revoke the public link. */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await requireMeeting(id);
  await getRepo().revokeShare(id);
  return ok();
});
