import { z } from "zod";
import type { CrmLogsResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseQuery, route } from "@/lib/server/api";

export const dynamic = "force-dynamic";

const Query = z.object({ meeting_id: z.string().min(1).optional() });

/** GET /api/integrations/crm/logs?meeting_id= — newest first. */
export const GET = route(async (req: Request) => {
  const q = parseQuery(req, Query);
  const logs = await getRepo().listCrmSyncLogs(q.meeting_id);
  return Response.json({ logs } satisfies CrmLogsResponse);
});
