import { extractDecisions } from "@/lib/ai";
import { aiAvailable, aiMode } from "@/lib/capabilities";
import type { DecisionsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { requireMeeting, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/meetings/:id/decisions — cached only ([] when never generated). */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await requireMeeting(id);
  const decisions = (await getRepo().getDecisions(id)) ?? [];
  return Response.json({ decisions, ai_mode: aiMode() } satisfies DecisionsResponse);
});

/** POST /api/meetings/:id/decisions — regenerate (demo mode keeps pre-authored decisions when present). */
export const POST = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const repo = getRepo();
  if (!aiAvailable()) {
    const cached = await repo.getDecisions(id);
    if (cached?.length) return Response.json({ decisions: cached, ai_mode: "demo" } satisfies DecisionsResponse);
  }
  const detail = await requireMeetingDetail(id);
  const r = await extractDecisions(detail);
  await repo.saveDecisions(id, r.value);
  return Response.json({ decisions: r.value, ai_mode: r.ai_mode } satisfies DecisionsResponse);
});
