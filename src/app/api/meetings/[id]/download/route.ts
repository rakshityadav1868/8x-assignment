import { buildDownload, contentDisposition } from "@/lib/export/download";
import { DownloadQuery, ROUTES } from "@/lib/contracts";
import { HttpError, appOrigin, parseQuery, requireMeetingDetail, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";
import { pickDefaultSummary } from "@/lib/server/summaries";

export const dynamic = "force-dynamic";

/**
 * GET /api/meetings/:id/download?format=transcript_txt|transcript_srt|transcript_vtt|transcript_md|summary_md|recording
 * &template=&language= — a file attachment (not JSON). `recording` → 302 to the media URL.
 * summary_md without `template` uses the default summary (prefs.default_template → meeting-type default → newest).
 */
export const GET = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const q = parseQuery(req, DownloadQuery);
  const detail = await requireMeetingDetail(id);
  const origin = appOrigin(req);

  if (q.format === "recording") {
    const url = detail.meeting.media_url;
    if (!url) throw new HttpError(404, "not_found", "This meeting has no recording to download.");
    return Response.redirect(url.startsWith("/") ? `${origin}${url}` : url, 302);
  }

  let summary = null;
  if (q.format === "summary_md") {
    summary = await pickDefaultSummary(detail, { template: q.template ?? null, language: q.language ?? null });
    if (q.template && summary?.template !== q.template) {
      throw new HttpError(404, "not_found", "No cached summary for that template — generate it on the call page first.");
    }
  }
  const file = buildDownload(detail, q.format, { summary, callUrl: `${origin}${ROUTES.pages.call(id)}` });
  return new Response(file.body, {
    headers: {
      "Content-Type": file.content_type,
      "Content-Disposition": contentDisposition(file.filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
