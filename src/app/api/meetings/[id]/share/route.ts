import { after } from "next/server";
import { CreateShareRequest, ROUTES, ShareAccessSchema, type CreateShareResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { appOrigin, ok, parseBody, requireMeeting, route } from "@/lib/server/api";
import { fireEvent } from "@/lib/server/events";
import type { IdCtx } from "@/lib/server/route-types";
import { safePrefs } from "@/lib/server/summaries";

/** Same as CreateShareRequest but without the default, so an omitted `access` can follow prefs.default_share_access. */
const ShareBody = CreateShareRequest.extend({ access: ShareAccessSchema.optional() });

export const dynamic = "force-dynamic";

/**
 * POST /api/meetings/:id/share — create (or reuse) the share token and set access.
 * Omitted `access` → prefs.default_share_access (else "anyone_with_link"). Fires `meeting.shared` webhooks.
 */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, ShareBody);
  await requireMeeting(id);
  const access = body.access ?? (await safePrefs())?.default_share_access ?? "anyone_with_link";
  const meeting = await getRepo().setShare(id, access, body.invited_emails);
  const origin = appOrigin(req);
  after(() => fireEvent("meeting.shared", id, origin));
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
