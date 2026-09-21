import type { ClipResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { NotFoundError, route } from "@/lib/server/api";
import type { TokenCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/clip/:token — public clip payload. */
export const GET = route(async (_req: Request, { params }: TokenCtx) => {
  const { token } = await params;
  const clip = await getRepo().getClipByToken(token);
  if (!clip) throw new NotFoundError("Clip");
  return Response.json(clip satisfies ClipResponse);
});
