import { catchUp } from "@/lib/ai";
import { meetingEndMs } from "@/lib/ai/transcript";
import { CatchUpRequest, type CatchUpResponse } from "@/lib/contracts";
import { HttpError, parseBody, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";
import { enforceAiLimits } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/meetings/:id/catch-up — summarise [from_ms, to_ms ?? end]. */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, CatchUpRequest);
  enforceAiLimits(req, id);
  const detail = await requireMeetingDetail(id);
  const end = meetingEndMs(detail);
  const to = Math.min(body.to_ms ?? end, end);
  if (body.from_ms >= to) throw new HttpError(400, "validation", "from_ms must be before the end of the meeting (and before to_ms)");
  const r = await catchUp(detail, body.from_ms, to);
  return Response.json({ from_ms: body.from_ms, to_ms: to, bullets: r.value, ai_mode: r.ai_mode } satisfies CatchUpResponse);
});
