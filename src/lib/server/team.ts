import "server-only";
import { getRepo } from "@/lib/db";
import type { TeamMember } from "@/lib/types";
import { HttpError } from "./errors";

/** Only owners/admins manage the team. Returns the acting member. */
export async function requireTeamAdmin(): Promise<TeamMember> {
  const session = await getRepo().getCurrentSession();
  if (session.member.role !== "owner" && session.member.role !== "admin") {
    throw new HttpError(403, "forbidden", "Only workspace owners and admins can manage the team.");
  }
  return session.member;
}
