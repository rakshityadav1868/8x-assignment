import { weekStartUtc } from "@/lib/analytics/insights";
import { CalendarQuery, type CalendarResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { HttpError, parseQuery, route } from "@/lib/server/api";
import { safePrefs } from "@/lib/server/summaries";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/** GET /api/calendar?from=&to= (default: current week Mon..Sun, UTC) — seeded events; calendar OAuth is stubbed. */
export const GET = route(async (req: Request) => {
  const q = parseQuery(req, CalendarQuery);
  const monday = weekStartUtc(new Date());
  const from = q.from ? new Date(q.from) : monday;
  const to = q.to ? new Date(q.to) : new Date(monday.getTime() + 7 * DAY - 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new HttpError(400, "validation", "from/to must be ISO dates");
  if (to < from) throw new HttpError(400, "validation", "to must be after from");
  // A bare "yyyy-mm-dd" `to` includes that whole day.
  const toIso = q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? new Date(to.getTime() + DAY - 1).toISOString() : to.toISOString();
  const repo = getRepo();
  const [events, rule, prefs] = await Promise.all([
    repo.listCalendarEvents({ from: from.toISOString(), to: toIso }),
    repo.getAutoRecordRule(),
    safePrefs(),
  ]);
  return Response.json({
    events,
    auto_record_rule: rule,
    calendar_connected: prefs?.calendar_connected ?? false,
  } satisfies CalendarResponse);
});
