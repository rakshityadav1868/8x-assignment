import { ToggleReactionRequest, type ToggleReactionResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";
import { summarizeReactions } from "@/lib/server/collab";
import { safeSession } from "@/lib/server/events";
import type { IdCtx } from "@/lib/server/route-types";

export const dynamic = "force-dynamic";

/** POST /api/segments/:id/reactions — toggle the current user's emoji on a transcript line. */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, ToggleReactionRequest);
  const [result, session] = await Promise.all([getRepo().toggleReaction(id, body.emoji), safeSession()]);
  return Response.json({
    added: result.added,
    segment_id: id,
    reactions: summarizeReactions(result.reactions, session?.user.id ?? null),
  } satisfies ToggleReactionResponse);
});
