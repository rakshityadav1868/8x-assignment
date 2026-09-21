import { InviteTeamRequest, type InviteTeamResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { parseBody, route } from "@/lib/server/api";
import { enforceActionLimit } from "@/lib/server/rate-limit";
import { requireTeamAdmin } from "@/lib/server/team";

export const dynamic = "force-dynamic";

/** POST /api/team/invite — stub: creates `invited` members; no email is sent. Existing emails are skipped. */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, InviteTeamRequest);
  enforceActionLimit(req, "invite", { burst: 10, perMin: 10 });
  await requireTeamAdmin();
  const emails = Array.from(new Set(body.emails.map((e) => e.trim().toLowerCase())));
  const members = await getRepo().inviteTeamMembers(emails, body.role);
  return Response.json({ members } satisfies InviteTeamResponse, { status: 201 });
});
