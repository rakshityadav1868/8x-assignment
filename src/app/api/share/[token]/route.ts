import type { ShareAccessResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { HttpError, NotFoundError, route } from "@/lib/server/api";
import type { TokenCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/share/:token — public MeetingDetail.
 * 404 when unknown; 403 `forbidden` unless access is `anyone_with_link` (no real auth for the other modes).
 */
export const GET = route(async (_req: Request, { params }: TokenCtx) => {
  const { token } = await params;
  const detail = await getRepo().getMeetingDetailByShareToken(token);
  if (!detail) throw new NotFoundError("Shared meeting");
  if (detail.meeting.share_access !== "anyone_with_link") {
    throw new HttpError(
      403,
      "forbidden",
      detail.meeting.share_access === "same_domain"
        ? "This recording is only available to people in the owner's workspace domain."
        : "This recording is only available to people the owner invited.",
    );
  }
  return Response.json(detail satisfies ShareAccessResponse);
});
