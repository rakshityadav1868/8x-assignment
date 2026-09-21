import { UpdateTeamMemberRequest, type TeamMemberResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { HttpError, NotFoundError, ok, parseBody, route } from "@/lib/server/api";
import type { IdCtx } from "@/lib/server/route-types";
import { requireTeamAdmin } from "@/lib/server/team";

export const dynamic = "force-dynamic";

async function load(id: string) {
  const members = await getRepo().listTeamMembers();
  const target = members.find((m) => m.id === id);
  if (!target) throw new NotFoundError("Team member");
  return { members, target };
}

/** PATCH /api/team/:id — change role (owner/admin only; the last owner cannot be demoted → 409). */
export const PATCH = route(async (req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const body = await parseBody(req, UpdateTeamMemberRequest);
  const me = await requireTeamAdmin();
  const { members, target } = await load(id);
  if (target.role === "owner") {
    const owners = members.filter((m) => m.role === "owner" && m.status === "active");
    if (owners.length <= 1) throw new HttpError(409, "conflict", "The workspace needs at least one owner.");
    if (me.role !== "owner") throw new HttpError(403, "forbidden", "Only an owner can change another owner's role.");
  }
  const member = await getRepo().updateTeamMember(id, { role: body.role });
  return Response.json({ member } satisfies TeamMemberResponse);
});

/** DELETE /api/team/:id — remove member / revoke invite (cannot remove yourself or the last owner). */
export const DELETE = route(async (_req: Request, { params }: IdCtx) => {
  const { id } = await params;
  const me = await requireTeamAdmin();
  if (id === me.id) throw new HttpError(409, "conflict", "You can't remove yourself from the workspace.");
  const { members, target } = await load(id);
  if (target.role === "owner") {
    if (members.filter((m) => m.role === "owner" && m.status === "active").length <= 1) {
      throw new HttpError(409, "conflict", "The workspace needs at least one owner.");
    }
    if (me.role !== "owner") throw new HttpError(403, "forbidden", "Only an owner can remove another owner.");
  }
  await getRepo().removeTeamMember(id);
  return ok();
});
