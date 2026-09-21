import "server-only";
import { HttpError } from "@/lib/server/errors";
import type { Repo } from "./repo";

/**
 * TEMPORARY (Phase 5 contract bootstrap). Every Phase 5 Repo method throws 501 `not_implemented` until the
 * database agent implements it in seed-repo.ts / supabase-repo.ts. Implementations spread these stubs FIRST
 * and override them, so implementing a method = adding it to the repo object. Delete this file once all
 * methods exist in both repos.
 */
export const PHASE5_REPO_METHODS = [
  "listMeetingDetails",
  "updateMeetings",
  "listFolders",
  "getFolder",
  "createFolder",
  "updateFolder",
  "deleteFolder",
  "listTrackers",
  "getTracker",
  "createTracker",
  "updateTracker",
  "deleteTracker",
  "listDealOverrides",
  "getDealOverrides",
  "saveDealOverrides",
  "listComments",
  "getComment",
  "createComment",
  "updateComment",
  "deleteComment",
  "listReactions",
  "toggleReaction",
  "listWebhooks",
  "getWebhook",
  "createWebhook",
  "updateWebhook",
  "deleteWebhook",
  "listWebhookDeliveries",
  "recordWebhookDelivery",
  "getSlackConfig",
  "saveSlackConfig",
  "listCrmSyncLogs",
  "addCrmSyncLog",
  "listBotSessions",
  "getBotSession",
  "createBotSession",
  "updateBotSession",
  "cloneMeetingFromTemplate",
  "listCalendarEvents",
  "setCalendarRecord",
  "getPrefs",
  "updatePrefs",
  "getAutoRecordRule",
  "getCurrentSession",
  "listTeamMembers",
  "inviteTeamMembers",
  "updateTeamMember",
  "removeTeamMember",
  "listNotifications",
  "createNotification",
  "markNotificationsRead",
] as const satisfies readonly (keyof Repo)[];

export type Phase5RepoMethods = Pick<Repo, (typeof PHASE5_REPO_METHODS)[number]>;

export class NotImplementedError extends HttpError {
  constructor(what: string) {
    super(501, "not_implemented", `${what} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export function phase5RepoStubs(impl: "seed" | "supabase"): Phase5RepoMethods {
  return Object.fromEntries(
    PHASE5_REPO_METHODS.map((m) => [
      m,
      async () => {
        throw new NotImplementedError(`${impl} repo: ${m}`);
      },
    ]),
  ) as unknown as Phase5RepoMethods;
}
