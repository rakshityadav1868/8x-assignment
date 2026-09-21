/** Simulated meeting-bot state machine (Phase 5 B). Pure. Owner: backend. The bot never really joins a call. */
import { HttpError } from "@/lib/server/errors";
import type { BotPlatform, BotSession, BotState } from "@/lib/types";

/** Legal transitions for action "next". done/failed are terminal. */
export const BOT_NEXT: Record<BotState, BotState | null> = {
  joining: "waiting_room",
  waiting_room: "recording",
  recording: "processing",
  processing: "done",
  done: null,
  failed: null,
};

/** Auto-advance timing (ms spent in a state before GET /api/bots/:id advances it). */
export const BOT_AUTO_ADVANCE_MS: Partial<Record<BotState, number>> = {
  joining: 3000,
  waiting_room: 5000,
  processing: 4000,
  // recording advances only on explicit "stop" (or after BOT_MAX_RECORDING_MS)
};
/** A simulated recording nobody stops ends on its own after this long. */
export const BOT_MAX_RECORDING_MS = 10 * 60 * 1000;

const AUTO_NOTES: Partial<Record<BotState, string>> = {
  waiting_room: "Bot is in the waiting room — waiting for the host to admit it",
  recording: "Admitted by the host — recording (simulated)",
  processing: "Meeting ended — processing the recording",
  done: "Recording ready",
};

/** zoom.us → zoom, meet.google.com → google_meet, teams.microsoft.com / teams.live.com → teams, else unknown. */
export function detectPlatform(meetingUrl: string): BotPlatform {
  let host: string;
  try {
    host = new URL(meetingUrl.trim()).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  const is = (d: string) => host === d || host.endsWith(`.${d}`);
  if (is("zoom.us") || is("zoom.com") || is("zoomgov.com")) return "zoom";
  if (is("meet.google.com")) return "google_meet";
  if (is("teams.microsoft.com") || is("teams.live.com") || is("teams.cloud.microsoft")) return "teams";
  return "unknown";
}

/** Default title for a bot session when the user didn't give one. */
export function defaultBotTitle(platform: BotPlatform): string {
  const name = { zoom: "Zoom", google_meet: "Google Meet", teams: "Microsoft Teams", unknown: "Online" }[platform];
  return `${name} meeting`;
}

/**
 * Compute the patch for an action. Throws HttpError 409 "conflict" on illegal transitions.
 * Sets joined_at / admitted_at / recording_ended_at / completed_at and appends to `events`.
 * The caller creates the meeting (repo.cloneMeetingFromTemplate or real pipeline) when entering "done".
 */
export function advanceBot(
  session: BotSession,
  action: "next" | "stop" | "fail",
  now: Date,
  note?: string,
): Partial<BotSession> & { state: BotState } {
  const from = session.state;
  let to: BotState | null;
  if (action === "fail") to = BOT_NEXT[from] === null ? null : "failed";
  else if (action === "stop") to = from === "recording" ? "processing" : null;
  else to = BOT_NEXT[from];
  if (!to) {
    throw new HttpError(409, "conflict", `Can't ${action} a bot that is ${from.replace("_", " ")}.`);
  }
  const at = now.toISOString();
  const patch: Partial<BotSession> & { state: BotState } = {
    state: to,
    events: [...session.events, { state: to, at, note: note ?? (action === "fail" ? "Bot failed" : AUTO_NOTES[to] ?? null) }],
  };
  if (to === "waiting_room") patch.joined_at = at;
  if (to === "recording") patch.admitted_at = at;
  if (to === "processing") patch.recording_ended_at = at;
  if (to === "done" || to === "failed") patch.completed_at = at;
  if (to === "failed") patch.error = note ?? "The bot could not record this meeting.";
  return patch;
}

/** When the session entered its current state (last matching event, else created_at). */
export function stateEnteredAt(session: BotSession): number {
  for (let i = session.events.length - 1; i >= 0; i--) {
    if (session.events[i].state === session.state) {
      const t = Date.parse(session.events[i].at);
      if (!Number.isNaN(t)) return t;
    }
  }
  return Date.parse(session.created_at) || 0;
}

/**
 * Stateless auto-advance: replays elapsed time since the state was entered (derived from `events` /
 * `created_at`, never from in-process timers) so any server instance computes the same state. Each synthetic
 * transition is stamped at the moment it *would* have happened. Returns null when nothing changes.
 */
export function autoAdvanceBot(session: BotSession, now: Date): (Partial<BotSession> & { state: BotState }) | null {
  let cur: BotSession = session;
  let patch: (Partial<BotSession> & { state: BotState }) | null = null;
  for (let guard = 0; guard < 6; guard++) {
    const wait = cur.state === "recording" ? BOT_MAX_RECORDING_MS : BOT_AUTO_ADVANCE_MS[cur.state];
    if (wait == null || BOT_NEXT[cur.state] == null) break;
    const due = stateEnteredAt(cur) + wait;
    if (now.getTime() < due) break;
    const step = advanceBot(cur, "next", new Date(due), cur.state === "recording" ? "Recording limit reached (10 min) — stopped automatically" : undefined);
    patch = { ...(patch ?? {}), ...step };
    cur = { ...cur, ...step };
  }
  return patch;
}
