import { UpdatePrefsRequest, type PrefsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/prefs — current user's server-side preferences (defaults when never saved). */
export const GET = route(async () => {
  const prefs = await getRepo().getPrefs();
  return Response.json({ prefs } satisfies PrefsResponse);
});

/** PATCH /api/prefs */
export const PATCH = route(async (req: Request) => {
  const body = await parseBody(req, UpdatePrefsRequest);
  const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const prefs = await getRepo().updatePrefs(patch);
  return Response.json({ prefs } satisfies PrefsResponse);
});
