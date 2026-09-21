import { after } from "next/server";
import { ProcessRequest, type ProcessResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { deepgramAvailable } from "@/lib/deepgram";
import { HttpError, appOrigin, parseBody, requireMeeting, route } from "@/lib/server/api";
import { isRunning, runPipeline, statusOf } from "@/lib/server/pipeline";
import type { IdCtx } from "@/lib/server/route-types";
import { enforceAiLimits } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/meetings/:id/process — kicks off Deepgram + parallel LLM jobs and returns immediately
 * (work continues in `after()`); poll GET /api/meetings/:id/status.
 */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, ProcessRequest);
  if (!deepgramAvailable()) {
    throw new HttpError(503, "transcription_unavailable", "Transcription needs a DEEPGRAM_API_KEY. This demo runs on seeded meetings until it's configured.");
  }
  const meeting = await requireMeeting(id);
  if (isRunning(meeting)) return Response.json(statusOf(meeting) satisfies ProcessResponse);
  if (!meeting.media_url) throw new HttpError(400, "validation", "Upload the recording before processing it.");

  enforceAiLimits(req, id, { paid: true });
  const queued = await getRepo().updateMeeting(id, { status: "processing", processing_stage: "queued", processing_error: null });
  const origin = appOrigin(req);
  after(() => runPipeline(id, { language: body.language, origin }));
  return Response.json(statusOf(queued) satisfies ProcessResponse, { status: 202 });
});
