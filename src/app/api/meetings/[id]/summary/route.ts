import { generateSummary, sectionsToMarkdown } from "@/lib/ai";
import { aiAvailable, aiMode } from "@/lib/capabilities";
import {
  GetSummaryQuery,
  RegenerateSummaryRequest,
  type GetSummaryResponse,
  type RegenerateSummaryResponse,
} from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, parseQuery, requireMeeting, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";
import { enforceAiLimits } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/meetings/:id/summary?template=&language= — cached lookup only (never generates). */
export const GET = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const q = parseQuery(req, GetSummaryQuery);
  await requireMeeting(id);
  const summary = await getRepo().findSummary(id, q.template, q.language, null);
  return Response.json({ summary } satisfies GetSummaryResponse);
});

/**
 * POST /api/meetings/:id/summary — (re)generate for template × language × custom instructions.
 * Returns the cached row when one exists (unless `force`). In demo mode a pre-authored seeded summary for the
 * template is always preferred over an extractive one (when there are no custom instructions).
 */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, RegenerateSummaryRequest);
  const repo = getRepo();
  const custom = body.custom_instructions?.trim() || null;

  if (!body.force || (!aiAvailable() && !custom)) {
    const cached =
      (await repo.findSummary(id, body.template, body.language, custom)) ??
      // Demo mode can't translate — fall back to the English cached summary for that template.
      (!aiAvailable() && body.language !== "en" ? await repo.findSummary(id, body.template, "en", custom) : null);
    if (cached) return Response.json({ summary: cached, ai_mode: aiMode() } satisfies RegenerateSummaryResponse);
  }

  enforceAiLimits(req, id);
  const detail = await requireMeetingDetail(id);
  const r = await generateSummary(detail, body.template, body.language, custom);
  const summary = await repo.saveSummary({
    meeting_id: id,
    template: body.template,
    language: r.value.language,
    sections: r.value.sections,
    markdown: sectionsToMarkdown(r.value.sections),
    custom_instructions: custom,
  });
  return Response.json({ summary, ai_mode: r.ai_mode } satisfies RegenerateSummaryResponse);
});
