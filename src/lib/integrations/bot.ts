/** Simulated meeting-bot state machine (Phase 5 B). Pure. Owner: backend. The bot never really joins a call. */
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
  // recording advances only on explicit "stop" (or after 10 min)
};

/** zoom.us → zoom, meet.google.com → google_meet, teams.microsoft.com / teams.live.com → teams, else unknown. */
export function detectPlatform(meetingUrl: string): BotPlatform {
  void meetingUrl;
  throw new Error("TODO");
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
  void session;
  void action;
  void now;
  void note;
  throw new Error("TODO");
}
