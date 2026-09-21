import { commitments } from "@/lib/ai";
import { CommitmentsRequest, type CommitmentsResponse } from "@/lib/contracts";
import { NotFoundError, parseBody, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";
import { enforceAiLimits } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/meetings/:id/commitments — "What did <person> commit to?" */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const { participant_id } = await parseBody(req, CommitmentsRequest);
  enforceAiLimits(req, id);
  const detail = await requireMeetingDetail(id);
  if (!detail.participants.some((p) => p.id === participant_id)) throw new NotFoundError("Participant");
  const r = await commitments(detail, participant_id);
  return Response.json({ participant_id, commitments: r.value, ai_mode: r.ai_mode } satisfies CommitmentsResponse);
});
