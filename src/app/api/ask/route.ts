import { askAcross } from "@/lib/ai/ask";
import { AskRequest, type AskHistoryResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";
import { askStreamResponse } from "@/lib/server/ndjson";
import type { MeetingDetail } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/ask — cross-meeting chat history. */
export const GET = route(async () => {
  const messages = await getRepo().listChatMessages(null);
  return Response.json({ messages } satisfies AskHistoryResponse);
});

/** POST /api/ask — cross-meeting Ask (P3), same NDJSON stream as per-meeting Ask. */
export const POST = route(async (req: Request) => {
  const { question } = await parseBody(req, AskRequest);
  const repo = getRepo();
  const list = (await repo.listMeetings()).filter((m) => m.status === "ready");
  const details = (await Promise.all(list.map((m) => repo.getMeetingDetail(m.id)))).filter((d): d is MeetingDetail => !!d);
  const history = await repo.listChatMessages(null);
  const userMessage = await repo.addChatMessage({ meeting_id: null, role: "user", content: question, citations: [] });
  const run = askAcross(details, question, history);
  return askStreamResponse(userMessage, run, (content, citations) =>
    repo.addChatMessage({ meeting_id: null, role: "assistant", content, citations }),
  );
});
