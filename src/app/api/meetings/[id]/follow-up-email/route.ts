import { followUpEmail } from "@/lib/ai";
import { FollowUpEmailRequest, type FollowUpEmailResponse } from "@/lib/contracts";
import { parseBody, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/meetings/:id/follow-up-email */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, FollowUpEmailRequest);
  const detail = await requireMeetingDetail(id);
  const r = await followUpEmail(detail, body.tone, body.recipient_participant_id ?? null);
  return Response.json({ ...r.value, ai_mode: r.ai_mode } satisfies FollowUpEmailResponse);
});
