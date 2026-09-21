import type { BotSessionResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { NotFoundError, appOrigin, route } from "@/lib/server/api";
import { syncBotSession } from "@/lib/server/events";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/bots/:id — polled by the UI; auto-advances by elapsed time (joining 3s, waiting room 5s, processing 4s). */
export const GET = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const session = await getRepo().getBotSession(id);
  if (!session) throw new NotFoundError("Bot session");
  return Response.json({ session: await syncBotSession(session, appOrigin(req)) } satisfies BotSessionResponse);
});
