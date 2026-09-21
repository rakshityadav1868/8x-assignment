import "server-only";
import { getRepo } from "@/lib/db";
import { autoAdvanceBot, advanceBot } from "@/lib/integrations/bot";
import { buildSlackRecap, postToSlack } from "@/lib/integrations/slack";
import { dispatchEvent } from "@/lib/integrations/webhooks";
import { ROUTES } from "@/lib/routes";
import type { BotSession, CurrentSession, WebhookEvent } from "@/lib/types";
import { NotFoundError } from "./errors";
import { pickDefaultSummary, safePrefs } from "./summaries";

/** Current session, or null while the repo can't provide it (501) — callers degrade gracefully. */
export async function safeSession(): Promise<CurrentSession | null> {
  try {
    return await getRepo().getCurrentSession();
  } catch {
    return null;
  }
}

/** Workspace e-mail domain used to tell internal from external people. */
export async function workspaceDomain(): Promise<string> {
  const s = await safeSession();
  return s?.workspace.domain ?? process.env.WORKSPACE_DOMAIN ?? "northwindlabs.io";
}

/** Fire a webhook event without ever throwing (e.g. meeting.shared, highlight.created). */
export async function fireEvent(event: WebhookEvent, meetingId: string, origin: string): Promise<void> {
  await dispatchEvent(event, meetingId, origin).catch((err) => console.error("[events] dispatch", event, err));
}

/** Slack auto-post when configured (`auto_post_on_ready`). Never throws. */
async function autoPostToSlack(meetingId: string, origin: string): Promise<void> {
  try {
    const repo = getRepo();
    const config = await repo.getSlackConfig();
    if (!config.webhook_url || !config.auto_post_on_ready) return;
    const detail = await repo.getMeetingDetail(meetingId);
    if (!detail) return;
    const summary = await pickDefaultSummary(detail);
    const msg = buildSlackRecap(detail, summary, config, { origin });
    const r = await postToSlack(config.webhook_url, msg);
    if (!r.ok) console.warn("[events] slack auto-post failed", r.error);
  } catch (err) {
    console.error("[events] slack auto-post", err);
  }
}

/**
 * Everything that happens when a meeting becomes ready (upload pipeline or a finished bot): "meeting ready"
 * notification (per prefs), `meeting.ready` webhooks, Slack auto-post. Never throws.
 */
export async function onMeetingReady(meetingId: string, origin: string): Promise<void> {
  const repo = getRepo();
  try {
    const [meeting, prefs] = await Promise.all([repo.getMeeting(meetingId), safePrefs()]);
    if (meeting && (prefs?.notify_meeting_ready ?? true)) {
      await repo.createNotification({
        kind: "meeting_ready",
        title: `“${meeting.title}” is ready`,
        body: "Transcript, summary and action items are available.",
        href: ROUTES.pages.call(meetingId),
        meeting_id: meetingId,
        actor_name: null,
      });
    }
  } catch (err) {
    console.error("[events] meeting_ready notification", err);
  }
  await Promise.allSettled([fireEvent("meeting.ready", meetingId, origin), autoPostToSlack(meetingId, origin)]);
}

// ---------------------------------------------------------------------------
// Bot sessions
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { __fanthomBotLocks?: Map<string, Promise<unknown>> };
const locks = () => (g.__fanthomBotLocks ??= new Map());

/** Serialise work per bot session inside this instance (prevents double "done" → double clone). */
function withBotLock(id: string, fn: () => Promise<BotSession>): Promise<BotSession> {
  const prev = locks().get(id) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks().set(id, next);
  void next.finally(() => {
    if (locks().get(id) === next) locks().delete(id);
  });
  return next;
}

/** Entering "done": clone a seed template into a real meeting, then notify + fire meeting.ready. */
async function finishBot(session: BotSession, origin: string): Promise<BotSession> {
  if (session.state !== "done" || session.meeting_id) return session;
  const repo = getRepo();
  try {
    const me = await safeSession();
    const meetingId = await repo.cloneMeetingFromTemplate(null, {
      title: session.title,
      recorded_by: me?.user.name ?? null,
      bot_session_id: session.id, // deterministic + idempotent meeting id (resolvable on any instance in seed mode)
    });
    const updated = await repo.updateBotSession(session.id, { meeting_id: meetingId });
    await repo
      .createNotification({
        kind: "bot_status",
        title: `Bot finished recording “${session.title}”`,
        body: "Simulated bot — the recording was created from a demo template.",
        href: ROUTES.pages.call(meetingId),
        meeting_id: meetingId,
        actor_name: "Fanthom bot",
      })
      .catch((err) => console.error("[bots] notification", err));
    await onMeetingReady(meetingId, origin);
    return updated;
  } catch (err) {
    console.error("[bots] finish failed", session.id, err);
    const message = err instanceof Error ? err.message : "Could not create the meeting";
    const fail = advanceBot({ ...session, state: "processing" }, "fail", new Date(), `Could not create the meeting: ${message}`);
    return repo.updateBotSession(session.id, fail);
  }
}

/** Apply elapsed-time auto-advance (stateless: derived from event timestamps) and finish on "done". */
export function syncBotSession(session: BotSession, origin: string, now = new Date()): Promise<BotSession> {
  if (session.state === "failed" || (session.state === "done" && session.meeting_id)) return Promise.resolve(session);
  return withBotLock(session.id, async () => {
    const repo = getRepo();
    let cur = (await repo.getBotSession(session.id)) ?? session;
    const patch = autoAdvanceBot(cur, now);
    if (patch) cur = await repo.updateBotSession(cur.id, patch);
    if (cur.state === "done" && !cur.meeting_id) cur = await finishBot(cur, origin);
    return cur;
  });
}

/** Explicit action from POST /api/bots/:id/advance (409 on illegal transitions). */
export function actOnBotSession(
  id: string,
  action: "next" | "stop" | "fail",
  note: string | undefined,
  origin: string,
): Promise<BotSession> {
  return withBotLock(id, async () => {
    const repo = getRepo();
    let cur = await repo.getBotSession(id);
    if (!cur) throw new NotFoundError("Bot session");
    // Catch up on elapsed time first so "next" moves from the state the user actually sees.
    const auto = autoAdvanceBot(cur, new Date());
    if (auto) cur = await repo.updateBotSession(id, auto);
    if (!(cur.state === "done" && action === "next" && !cur.meeting_id)) {
      cur = await repo.updateBotSession(id, advanceBot(cur, action, new Date(), note));
    }
    if (cur.state === "done" && !cur.meeting_id) cur = await finishBot(cur, origin);
    return cur;
  });
}
