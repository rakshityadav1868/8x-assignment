import { AdvanceBotSessionRequest, type BotSessionResponse } from "@/lib/contracts";
import { appOrigin, parseBody, route } from "@/lib/server/api";
import { actOnBotSession } from "@/lib/server/events";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** POST /api/bots/:id/advance — next | stop (recording → processing) | fail. 409 on illegal transitions. */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, AdvanceBotSessionRequest);
  const session = await actOnBotSession(id, body.action, body.note, appOrigin(req));
  return Response.json({ session } satisfies BotSessionResponse);
});
