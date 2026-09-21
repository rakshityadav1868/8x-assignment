import type { ListReactionsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { requireMeeting, route } from "@/lib/server/api";
import { summarizeReactions } from "@/lib/server/collab";
import { safeSession } from "@/lib/server/events";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** GET /api/meetings/:id/reactions — per (segment, emoji) chips. */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await requireMeeting(id);
  const [reactions, session] = await Promise.all([getRepo().listReactions(id), safeSession()]);
  return Response.json({ reactions: summarizeReactions(reactions, session?.user.id ?? null) } satisfies ListReactionsResponse);
});
