#!/usr/bin/env node
// Builds the keyless demo seed (src/data/seed/**) from the human-authored sources:
//   seed-src/meetings/<slug>.json  (script: participants + lines)
//   seed-src/timings/<slug>.json   (exact per-line ms, from scripts/generate-seed-audio.mjs)
//   seed-src/ai/<slug>.json        (pre-authored summaries, action items, chapters, highlights, decisions)
//
// Output: src/data/seed/meetings/<slug>.json (SeedMeetingFile = MeetingDetail + decisions),
//         src/data/seed/workspace.json (SeedWorkspaceFile), src/data/seed/index.ts (static imports).
// Dates are computed relative to NOW (meetings "N days ago", upcoming meetings in the next 7 days),
// so this runs as `prebuild` on every deploy. No npm dependencies.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./validate-seed-ai.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "seed-src");
const OUT = join(ROOT, "src/data/seed");
const OUT_MEETINGS = join(OUT, "meetings");

const NOW = process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : new Date();
const WORKSPACE = { id: "ws_northwind", name: "Northwind Labs", domain: "northwindlabs.io" };
const USER = { id: "u_priya", workspace_id: WORKSPACE.id, name: "Priya Raman", email: "priya@northwindlabs.io" };
// Seed start_time values are US Eastern wall-clock; stored as UTC (EDT = UTC-4).
const TZ_OFFSET_H = 4;
// Readable, stable public share tokens (demo); every meeting is shared with anyone_with_link.
const SHARE_TOKENS = { "q4-roadmap-planning": "q4-roadmap" };

// Distinct, dark-UI friendly speaker colors (assigned in participant order within a meeting).
const PALETTE = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#fb923c", "#a3e635", "#e879f9"];

const pad = (n, w = 4) => String(n).padStart(w, "0");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function loadTemplates() {
  const src = readFileSync(join(ROOT, "src/lib/templates.ts"), "utf8");
  const names = {};
  for (const m of src.matchAll(/key:\s*"([a-z_]+)",\s*name:\s*"([^"]+)"/g)) names[m[1]] = m[2];
  const defaults = {};
  const block = src.match(/DEFAULT_TEMPLATE_FOR_MEETING_TYPE[\s\S]*?\{([\s\S]*?)\}/)[1];
  for (const m of block.matchAll(/([a-z_]+):\s*"([a-z_]+)"/g)) defaults[m[1]] = m[2];
  return { names, defaults };
}
const TEMPLATES = loadTemplates();

function recordingStart(days_ago, start_time, durationMs) {
  const [h, m] = start_time.split(":").map(Number);
  const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() - days_ago, h + TZ_OFFSET_H, m));
  // A "today" meeting must have finished before NOW; otherwise pull it back to end ~20 min ago.
  if (d.getTime() + durationMs > NOW.getTime()) return new Date(NOW.getTime() - durationMs - 20 * 60_000);
  return d;
}

function buildMeeting(slug) {
  const src = readJson(join(SRC, "meetings", `${slug}.json`));
  const timings = readJson(join(SRC, "timings", `${slug}.json`));
  const ai = readJson(join(SRC, "ai", `${slug}.json`));
  if (timings.lines.length !== src.lines.length) throw new Error(`${slug}: timings out of date — rerun generate-seed-audio`);
  const errs = validate(slug);
  if (errs.length) throw new Error(errs.join("\n"));

  const meetingId = `m_${slug}`;
  const T = timings.lines;
  const startOf = (i) => T[i].start_ms;
  const endOf = (i) => T[i].end_ms;
  const durationMs = timings.duration_ms;

  const recStart = recordingStart(src.days_ago, src.start_time, durationMs);
  const recEnd = new Date(recStart.getTime() + durationMs);
  const schedStart = new Date(Math.floor(recStart.getTime() / 60_000) * 60_000 - 60_000);
  const schedMinutes = Math.max(15, Math.ceil(durationMs / 60_000 / 15) * 15);
  const schedEnd = new Date(schedStart.getTime() + schedMinutes * 60_000);
  const at = (offsetMin) => new Date(recEnd.getTime() + offsetMin * 60_000).toISOString();

  const pid = {};
  const participants = src.participants.map((p, i) => {
    pid[p.key] = `p_${slug}_${p.key}`;
    return {
      id: pid[p.key],
      meeting_id: meetingId,
      name: p.name,
      email: p.email ?? null,
      is_external: !!p.is_external,
      color: PALETTE[i % PALETTE.length],
    };
  });

  const segments = src.lines.map((l, i) => ({
    id: `seg_${slug}_${pad(i)}`,
    meeting_id: meetingId,
    participant_id: pid[l.speaker] ?? null,
    start_ms: startOf(i),
    end_ms: endOf(i),
    text: l.text,
  }));

  const defaultTemplate = TEMPLATES.defaults[src.meeting_type] ?? "general";
  // Newest first; the default template for the meeting type is the newest.
  const orderedSummaries = [...ai.summaries].sort((a, b) => (b.template === defaultTemplate) - (a.template === defaultTemplate));
  const summaries = orderedSummaries.map((s, i) => {
    const sections = s.sections.map((sec) => ({
      heading: sec.heading,
      bullets: sec.bullets.map((b) => ({ text: b.text, start_ms: startOf(b.line) })),
    }));
    const markdown =
      `# ${src.title} — ${TEMPLATES.names[s.template] ?? s.template} summary\n\n` +
      sections.map((sec) => `## ${sec.heading}\n` + sec.bullets.map((b) => `- ${b.text}`).join("\n")).join("\n\n") +
      "\n";
    return {
      id: `sum_${slug}_${s.template}_en`,
      meeting_id: meetingId,
      template: s.template,
      language: "en",
      markdown,
      sections,
      custom_instructions: null,
      created_at: at(3 - i * 0.25),
    };
  });

  const action_items = ai.action_items
    .map((a, i) => ({
      id: `ai_${slug}_${pad(i, 2)}`,
      meeting_id: meetingId,
      description: a.description,
      assignee_participant_id: a.assignee ? pid[a.assignee] : null,
      timestamp_ms: startOf(a.line),
      completed: !!a.completed,
      user_generated: false,
      created_at: at(3),
    }))
    .sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  const highlights = ai.highlights
    .map((h, i) => ({
      id: `hl_${slug}_${pad(i, 2)}`,
      meeting_id: meetingId,
      start_ms: Math.max(0, startOf(h.start_line) - 300),
      end_ms: Math.min(durationMs, endOf(h.end_line) + 300),
      type: h.type,
      title: h.title,
      note: h.note ?? null,
      share_token: `clip-${slug}-${i}`,
      user_generated: false,
      created_at: at(3),
    }))
    .sort((a, b) => a.start_ms - b.start_ms);

  const chapters = ai.chapters.map((c, i, all) => ({
    id: `ch_${slug}_${pad(i, 2)}`,
    meeting_id: meetingId,
    title: c.title,
    start_ms: i === 0 ? 0 : startOf(c.start_line),
    end_ms: i === all.length - 1 ? durationMs : startOf(all[i + 1].start_line),
    summary: c.summary ?? null,
  }));

  const decisions = (ai.decisions ?? []).map((d) => ({
    text: d.text,
    start_ms: startOf(d.line),
    participant_id: d.speaker ? pid[d.speaker] : pid[src.lines[d.line].speaker] ?? null,
  }));

  const meeting = {
    id: meetingId,
    workspace_id: WORKSPACE.id,
    title: src.title,
    meeting_type: src.meeting_type,
    scheduled_start: schedStart.toISOString(),
    scheduled_end: schedEnd.toISOString(),
    recording_start: recStart.toISOString(),
    recording_end: recEnd.toISOString(),
    duration_sec: Math.round(durationMs / 1000),
    media_url: `/media/${slug}.m4a`,
    media_kind: "audio",
    status: "ready",
    processing_stage: "ready",
    processing_error: null,
    transcript_language: "en",
    share_token: SHARE_TOKENS[slug] ?? `share-${slug}`,
    share_access: "anyone_with_link",
    recorded_by: src.recorded_by ?? null,
    synthetic: true,
    created_at: recEnd.toISOString(),
  };

  return { meeting, participants, segments, summaries, action_items, highlights, chapters, decisions };
}

// ---------------------------------------------------------------------------

const slugs = readdirSync(join(SRC, "meetings"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((s) => existsSync(join(SRC, "ai", `${s}.json`)) && existsSync(join(SRC, "timings", `${s}.json`)));
if (!slugs.length) throw new Error("No complete seed meetings (need meetings + timings + ai)");

const built = slugs.map(buildMeeting).sort((a, b) => b.meeting.recording_start.localeCompare(a.meeting.recording_start));

rmSync(OUT_MEETINGS, { recursive: true, force: true });
mkdirSync(OUT_MEETINGS, { recursive: true });
for (const m of built) {
  const slug = m.meeting.id.slice(2);
  writeFileSync(join(OUT_MEETINGS, `${slug}.json`), JSON.stringify(m) + "\n");
}

// Upcoming meetings (calendar is stubbed): next 7 days, Eastern wall-clock.
const up = (id, title, dayOffset, hhmm, minutes, meeting_type, attendees) => {
  const [h, m] = hhmm.split(":").map(Number);
  const start = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() + dayOffset, h + TZ_OFFSET_H, m));
  return { id, title, start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString(), attendees, meeting_type };
};
const nw = (first, last, ext = false, domain = "northwindlabs.io") => ({
  name: `${first} ${last}`,
  email: `${ext ? `${first}.${last}` : first}`.toLowerCase() + `@${domain}`,
  is_external: ext,
});
const upcoming = [
  up("up_acme-demo", "Acme Logistics — Technical Deep Dive", 1, "11:00", 45, "sales", [
    nw("Ethan", "Brooks"), nw("Arjun", "Mehta"), nw("Rachel", "Moreno", true, "acmelogistics.com"), nw("Tariq", "Hassan", true, "acmelogistics.com"),
  ]),
  up("up_priya-arjun-1on1", "Priya / Arjun 1:1", 1, "15:00", 30, "one_on_one", [nw("Priya", "Raman"), nw("Arjun", "Mehta")]),
  up("up_eng-standup", "Eng Weekly Standup", 2, "09:30", 15, "standup", [
    nw("Priya", "Raman"), nw("Marcus", "Chen"), nw("Nina", "Park"), nw("Kevin", "Walsh"), nw("Aman", "Gupta"),
  ]),
  up("up_globex-exec", "Globex — Reliability Plan & SSO Timeline", 3, "13:00", 30, "customer_success", [
    nw("Siobhan", "Kelly"), nw("Priya", "Raman"), nw("Greg", "Holloway", true, "globex.com"), nw("Maya", "Lindqvist", true, "globex.com"),
  ]),
  up("up_ai-insights-kickoff", "AI Insights Beta — Kickoff", 4, "10:00", 60, "planning", [
    nw("Tom", "Okafor"), nw("Hannah", "Price"), nw("Marcus", "Chen"), nw("Priya", "Raman"), nw("Siobhan", "Kelly"),
  ]),
  up("up_olivia-offer", "Olivia Grant — Offer Call", 6, "12:00", 30, "interview", [
    nw("Priya", "Raman"), nw("Olivia", "Grant", true, "gmail.com"),
  ]),
].filter((u) => new Date(u.start) > NOW);

// Playlists from highlights across meetings.
const allHl = built.flatMap((m) => m.highlights);
const playlist = (id, name, description, items, createdAgoDays) => ({
  id,
  workspace_id: WORKSPACE.id,
  name,
  description,
  created_at: new Date(NOW.getTime() - createdAgoDays * 86_400_000).toISOString(),
  items: items.map((h, i) => ({ id: `${id}_item_${pad(i, 2)}`, playlist_id: id, meeting_id: null, highlight_id: h.id, position: i })),
});
const playlists = [
  playlist("pl_customer-pain", "Customer pain points", "What prospects and customers told us hurts — for product and CS.",
    allHl.filter((h) => h.type === "pain_point").slice(0, 8), 9),
  playlist("pl_q4-decisions", "Q4 decisions", "Every decision that shapes the Q4 plan, straight from the calls.",
    allHl.filter((h) => h.type === "decision").slice(0, 10), 1),
];

writeFileSync(
  join(OUT, "workspace.json"),
  JSON.stringify({ workspace: WORKSPACE, user: USER, upcoming, playlists }, null, 2) + "\n",
);

// Barrel with static imports so the bundler includes every file.
const ident = (slug) => slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[0-9]/, "_$&");
const files = built.map((m) => m.meeting.id.slice(2));
writeFileSync(
  join(OUT, "index.ts"),
  `/**
 * Seed data barrel — GENERATED by scripts/build-seed.mjs (do not edit by hand; run \`npm run build:seed\`).
 *
 * Static JSON imports so Vercel bundles every file (no fs / glob at runtime).
 * Format: \`SeedMeetingFile\` / \`SeedWorkspaceFile\` in \`@/lib/types\`.
 */
import type { SeedMeetingFile, SeedWorkspaceFile } from "@/lib/types";

import workspace from "./workspace.json";
${files.map((s) => `import ${ident(s)} from "./meetings/${s}.json";`).join("\n")}

export const seedWorkspace = workspace as unknown as SeedWorkspaceFile;

/** Newest first. */
export const seedMeetings = [
${files.map((s) => `  ${ident(s)},`).join("\n")}
] as unknown as SeedMeetingFile[];
`,
);

for (const m of built) {
  console.log(
    `${m.meeting.id.padEnd(30)} ${m.meeting.recording_start.slice(0, 16)}  ${String(Math.round(m.meeting.duration_sec / 60)).padStart(3)} min  ` +
      `${m.segments.length} seg · ${m.summaries.length} sum · ${m.action_items.length} ai · ${m.highlights.length} hl · ${m.chapters.length} ch · ${m.decisions.length} dec`,
  );
}
console.log(`upcoming: ${upcoming.length}, playlists: ${playlists.map((p) => `${p.name} (${p.items.length})`).join(", ")}`);
