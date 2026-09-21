import { ROUTES, type HighlightShareResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { appOrigin, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** POST /api/highlights/:id/share → public clip link (every highlight already has a token). */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const h = await getRepo().updateHighlight(id, {}); // 404 if missing
  return Response.json({
    share_token: h.share_token,
    share_url: `${appOrigin(req)}${ROUTES.pages.clip(h.share_token)}`,
  } satisfies HighlightShareResponse);
});
