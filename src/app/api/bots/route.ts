import { CreateBotSessionRequest, type BotSessionResponse, type ListBotSessionsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { defaultBotTitle, detectPlatform } from "@/lib/integrations/bot";
import { HttpError, appOrigin, parseBody, route } from "@/lib/server/api";
import { syncBotSession } from "@/lib/server/events";
import { enforceActionLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/bots — recent sessions, newest first (each auto-advanced by elapsed time). */
export const GET = route(async (req: Request) => {
  const origin = appOrigin(req);
  const sessions = await getRepo().listBotSessions(20);
  const synced = await Promise.all(sessions.map((s) => syncBotSession(s, origin).catch(() => s)));
  return Response.json({ sessions: synced } satisfies ListBotSessionsResponse);
});

/**
 * POST /api/bots — "Send Fanthom to a live meeting". SIMULATED: the bot never joins a real call; it walks
 * joining → waiting_room → recording (until stopped) → processing → done, and "done" creates a meeting from a
 * demo template.
 */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, CreateBotSessionRequest);
  enforceActionLimit(req, "bot", { burst: 5, perMin: 3 });
  let url: URL;
  try {
    url = new URL(body.meeting_url);
  } catch {
    throw new HttpError(400, "validation", "Paste a meeting link (Zoom, Google Meet or Microsoft Teams).");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, "validation", "Meeting links must start with https://");
  const platform = detectPlatform(body.meeting_url);
  const session = await getRepo().createBotSession({
    meeting_url: body.meeting_url,
    platform,
    title: body.title?.trim() || defaultBotTitle(platform),
  });
  return Response.json({ session } satisfies BotSessionResponse, { status: 201 });
});
