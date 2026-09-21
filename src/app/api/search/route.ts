import { SearchQuery, type SearchResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseQuery, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** GET /api/search?q=&meeting_id=&limit= → hits with `<mark>` snippets (HTML-escaped otherwise). */
export const GET = route(async (req: Request) => {
  const q = parseQuery(req, SearchQuery);
  const { hits, total } = await getRepo().search({ q: q.q, meeting_id: q.meeting_id, limit: q.limit });
  return Response.json({ query: q.q, hits, total } satisfies SearchResponse);
});
