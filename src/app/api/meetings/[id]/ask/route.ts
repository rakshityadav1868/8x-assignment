import { askMeeting } from "@/lib/ai/ask";
import { AskRequest, type AskHistoryResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, requireMeeting, requireMeetingDetail, route } from "@/lib/server/api";
import { askStreamResponse } from "@/lib/server/ndjson";
import type { IdCtx } from "@/lib/server/route-types";
import { enforceAiLimits } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/meetings/:id/ask — chat history. */
export const GET = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  await requireMeeting(id);
  const messages = await getRepo().listChatMessages(id);
  return Response.json({ messages } satisfies AskHistoryResponse);
});

/** POST /api/meetings/:id/ask — NDJSON stream of AskStreamEvent. */
export const POST = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const { question } = await parseBody(req, AskRequest);
  enforceAiLimits(req, id);
  const repo = getRepo();
  const detail = await requireMeetingDetail(id);
  const history = await repo.listChatMessages(id);
  const userMessage = await repo.addChatMessage({ meeting_id: id, role: "user", content: question, citations: [] });
  const run = askMeeting(detail, question, history);
  return askStreamResponse(userMessage, run, (content, citations) =>
    repo.addChatMessage({ meeting_id: id, role: "assistant", content, citations }),
  );
});
