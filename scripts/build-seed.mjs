#!/usr/bin/env node
// Builds the keyless demo seed (src/data/seed/**) from the human-authored sources:
//   seed-src/meetings/<slug>.json  (script: participants + lines)
//   seed-src/timings/<slug>.json   (exact per-line ms, from scripts/generate-seed-audio.mjs)
//   seed-src/ai/<slug>.json        (pre-authored summaries, action items, chapters, highlights, decisions)
//
// Output: src/data/seed/meetings/<slug>.json (SeedMeetingFile = MeetingDetail + decisions),
//         src/data/seed/workspace.json (SeedWorkspaceFile), src/data/seed/index.ts (static imports).
// Output is deterministic: every date is written against a fixed canonical week (ANCHOR = the Thursday of the
// flagship Q4 planning meeting). At runtime SeedRepo / scripts/seed.mts shift all timestamps by whole weeks so
// the flagship is always the most recent Thursday (src/lib/db/seed-time.ts). No npm dependencies.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./validate-seed-ai.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "seed-src");
const OUT = join(ROOT, "src/data/seed");
const OUT_MEETINGS = join(OUT, "meetings");

// Canonical anchor day: Thursday 2025-10-02 (the Q4 Roadmap Planning meeting; days_ago counts back from it).
// Spoken dates in the scripts (e.g. "October 9th", "November 20th") are consistent with this week.
const ANCHOR_DAY = { y: 2025, m: 9, d: 2 }; // month is 0-based
const ANCHOR_SLUG = "q4-roadmap-planning";
const WORKSPACE = { id: "ws_northwind", name: "Northwind Labs", domain: "northwindlabs.io" };
const USER = { id: "u_priya", workspace_id: WORKSPACE.id, name: "Priya Raman", email: "priya@northwindlabs.io" };
// Seed start_time values are US Eastern wall-clock; the canonical weeks are in EDT (UTC-4).
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
// Phase 5 human-authored seed (folders, team, comments, trackers, ...). See seed-src/parity.json "_doc".
const PARITY = readJson(join(SRC, "parity.json"));

/** Canonical ET wall-clock time `dayOffset` days from the anchor day, as a UTC Date. */
function etDate(dayOffset, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(Date.UTC(ANCHOR_DAY.y, ANCHOR_DAY.m, ANCHOR_DAY.d + dayOffset, h + TZ_OFFSET_H, m));
  const dow = d.getUTCDay();
  if (h < 8 || h > 18 || dow === 0 || dow === 6) throw new Error(`seed event outside business hours: ${d.toISOString()}`);
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

  const recStart = etDate(-src.days_ago, src.start_time);
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
    folder_id: PARITY.meeting_meta[slug]?.folder ?? null,
    starred: !!PARITY.meeting_meta[slug]?.starred,
    deleted_at: null,
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

// Calendar events (calendar OAuth is stubbed): the two weeks after the anchor, Eastern wall-clock. They feed both the
// upcoming strip (UpcomingMeeting) and /calendar (CalendarEvent minus the computed `record`). At runtime each event
// moves to its next future occurrence of the same weekday + time, keeping its week (1st or 2nd) — seed-time.ts.
const nw = (first, last, ext = false, domain = "northwindlabs.io") => ({
  name: `${first} ${last}`,
  email: `${ext ? `${first}.${last}` : first}`.toLowerCase() + `@${domain}`,
  is_external: ext,
});
const JOIN = {
  zoom: (id) => `https://northwindlabs.zoom.us/j/${id}?pwd=${Buffer.from(String(id)).toString("base64url").slice(0, 16)}`,
  google_meet: (code) => `https://meet.google.com/${code}`,
  teams: (id) =>
    `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${id}%40thread.v2/0?context=%7b%22Tid%22%3a%22${id.slice(0, 8)}%22%7d`,
};
const ev = (id, title, dayOffset, hhmm, minutes, meeting_type, attendees, platform, joinKey, opts = {}) => {
  const start = etDate(dayOffset, hhmm);
  return {
    id,
    title,
    start: start.toISOString(),
    end: new Date(start.getTime() + minutes * 60_000).toISOString(),
    attendees,
    meeting_type,
    meeting_url: JOIN[platform](joinKey),
    platform,
    organizer_email: opts.organizer ?? attendees[0].email,
    is_external: attendees.some((a) => a.is_external),
    source: opts.source ?? "google",
    record_override: opts.record ?? null,
  };
};
const acme = (f, l) => nw(f, l, true, "acmelogistics.com");
const globex = (f, l) => nw(f, l, true, "globex.com");
const upcoming = [
  // week 1
  ev("up_priya-arjun-1on1", "Priya / Arjun 1:1", 1, "15:00", 30, "one_on_one", [nw("Priya", "Raman"), nw("Arjun", "Mehta")], "google_meet", "pqa-rjnm-kxw"),
  ev("up_globex-exec", "Globex — Reliability Plan & SSO Timeline", 1, "13:00", 30, "customer_success", [
    nw("Siobhan", "Kelly"), nw("Priya", "Raman"), globex("Greg", "Holloway"), globex("Maya", "Lindqvist"),
  ], "teams", "NGY3ZDc0YjEtOWE2Mi00ZTQ1LWJmZjQtMmQxNDQ1ZjVhNzE2", { organizer: "greg.holloway@globex.com", source: "outlook" }),
  ev("up_eng-standup", "Eng Weekly Standup", 4, "09:30", 15, "standup", [
    nw("Priya", "Raman"), nw("Marcus", "Chen"), nw("Nina", "Park"), nw("Kevin", "Walsh"), nw("Aman", "Gupta"),
  ], "google_meet", "eng-stnd-upw"),
  ev("up_code-yellow-kickoff", "Reliability Code Yellow — Kickoff", 4, "11:00", 60, "planning", [
    nw("Priya", "Raman"), nw("Arjun", "Mehta"), nw("Kevin", "Walsh"), nw("Aman", "Gupta"), nw("Marcus", "Chen"), nw("Nina", "Park"),
  ], "google_meet", "cyk-ofqr-zzt"),
  ev("up_acme-demo", "Acme Logistics — Technical Deep Dive", 5, "11:00", 45, "sales", [
    nw("Ethan", "Brooks"), nw("Arjun", "Mehta"), acme("Rachel", "Moreno"), acme("Tariq", "Hassan"),
  ], "zoom", 84512093376),
  ev("up_olivia-offer", "Olivia Grant — Offer Call", 5, "16:00", 30, "interview", [nw("Priya", "Raman"), nw("Olivia", "Grant", true, "gmail.com")],
    "zoom", 86120937745, { record: false }),
  ev("up_ai-insights-kickoff", "AI Insights Beta — Kickoff", 6, "10:00", 60, "planning", [
    nw("Tom", "Okafor"), nw("Hannah", "Price"), nw("Marcus", "Chen"), nw("Priya", "Raman"), nw("Siobhan", "Kelly"),
  ], "zoom", 81234509876),
  ev("up_globex-proposal", "Globex — Renewal Proposal Walkthrough", 6, "12:00", 45, "customer_success", [
    nw("Ethan", "Brooks"), nw("Siobhan", "Kelly"), globex("Greg", "Holloway"), globex("Maya", "Lindqvist"),
  ], "teams", "ZTc4MWQ1ZjgtYjM2Yy00ODkxLWE0OTItOTdiZWVmNjM0YjQx", { organizer: "ethan@northwindlabs.io", source: "outlook" }),
  ev("up_pricing-launch-review", "Growth Pricing — Launch Review", 7, "14:00", 45, "project_update", [
    nw("Tom", "Okafor"), nw("Sofia", "Alvarez"), nw("James", "Whitaker"), nw("Leah", "Botha"),
  ], "zoom", 89031245567),
  // week 2
  ev("up_keystone-scim", "Keystone Cloud — SCIM Follow-up", 8, "13:00", 30, "general", [
    nw("Kevin", "Walsh"), nw("Aman", "Gupta"), nw("Laura", "Stein", true, "keystonecloud.com"),
  ], "teams", "OTJmYTBiMzUtNmU0Ny00YzE4LTk1ZTEtM2Q3YjU0ZWYwYTIy", { organizer: "laura.stein@keystonecloud.com", source: "outlook" }),
  ev("up_eng-standup-2", "Eng Weekly Standup", 11, "09:30", 15, "standup", [
    nw("Priya", "Raman"), nw("Marcus", "Chen"), nw("Nina", "Park"), nw("Kevin", "Walsh"), nw("Aman", "Gupta"),
  ], "google_meet", "eng-stnd-upw"),
  ev("up_acme-security", "Acme Logistics — Security Questionnaire Review", 12, "10:00", 60, "sales", [
    nw("Ethan", "Brooks"), nw("Kevin", "Walsh"), acme("Rachel", "Moreno"), acme("Janet", "Cole"),
  ], "zoom", 87765012398),
  ev("up_priya-marcus-1on1", "Priya / Marcus 1:1", 12, "15:30", 30, "one_on_one", [nw("Priya", "Raman"), nw("Marcus", "Chen")], "google_meet", "pmc-hxqv-wre"),
  ev("up_design-crit", "Design Crit — Insights Explanations", 13, "14:00", 45, "project_update", [
    nw("Leah", "Botha"), nw("Nina", "Park"), nw("Sofia", "Alvarez"), nw("Hannah", "Price"),
  ], "google_meet", "dcr-tqpl-mno", { record: true }),
  ev("up_ai-insights-globex", "AI Insights Beta — Design Partner Sync (Globex)", 14, "11:00", 30, "customer_success", [
    nw("Hannah", "Price"), nw("Siobhan", "Kelly"), globex("Maya", "Lindqvist"),
  ], "zoom", 83340917265),
].sort((a, b) => a.start.localeCompare(b.start));

// Playlists from highlights across meetings.
const allHl = built.flatMap((m) => m.highlights);
const playlist = (id, name, description, items, createdAgoDays) => ({
  id,
  workspace_id: WORKSPACE.id,
  name,
  description,
  created_at: etDate(-createdAgoDays, "17:00").toISOString(),
  items: items.map((h, i) => ({ id: `${id}_item_${pad(i, 2)}`, playlist_id: id, meeting_id: null, highlight_id: h.id, position: i })),
});
const playlists = [
  playlist("pl_customer-pain", "Customer pain points", "What prospects and customers told us hurts — for product and CS.",
    allHl.filter((h) => h.type === "pain_point").slice(0, 8), 9),
  playlist("pl_q4-decisions", "Q4 decisions", "Every decision that shapes the Q4 plan, straight from the calls.",
    allHl.filter((h) => h.type === "decision").slice(0, 10), 1),
];

const anchorMeeting = built.find((m) => m.meeting.id === `m_${ANCHOR_SLUG}`);
if (!anchorMeeting) throw new Error(`anchor meeting ${ANCHOR_SLUG} missing`);
const anchor = {
  meeting_id: anchorMeeting.meeting.id,
  recording_start: anchorMeeting.meeting.recording_start,
  duration_ms: Math.round(anchorMeeting.meeting.duration_sec * 1000),
};
// ---------------------------------------------------------------------------
// Phase 5 parity data → src/data/seed/parity.json (SeedParityFile in src/lib/db/seed-types.ts)
// ---------------------------------------------------------------------------
const bySlug = new Map(built.map((m) => [m.meeting.id.slice(2), m]));
const mtg = (slug) => {
  const m = bySlug.get(slug);
  if (!m) throw new Error(`parity.json: unknown meeting ${slug}`);
  return m;
};
/** {meeting, after_min} | {days_ago, at} → canonical ISO. */
const when = (t) =>
  t.meeting
    ? new Date(Date.parse(mtg(t.meeting).meeting.recording_end) + t.after_min * 60_000).toISOString()
    : etDate(-t.days_ago, t.at).toISOString();
const segOf = (slug, line) => {
  const seg = mtg(slug).segments[line];
  if (!seg) throw new Error(`parity.json: ${slug} has no line ${line}`);
  return seg;
};

// Team: every internal person who appears in a seed meeting (+ pending invites).
const TEAM_PALETTE = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#fb923c", "#a3e635", "#e879f9", "#38bdf8", "#facc15", "#4ade80", "#c084fc", "#fda4af"];
const people = new Map();
for (const slug of [...bySlug.keys()].sort()) {
  for (const p of readJson(join(SRC, "meetings", `${slug}.json`)).participants) {
    if (!p.is_external && !people.has(p.key)) people.set(p.key, p);
  }
}
const memberId = (key) => (key === "priya" ? USER.id : `tm_${key}`);
const teamKeys = Object.keys(PARITY.team.roles);
for (const k of people.keys()) if (!PARITY.team.roles[k]) throw new Error(`parity.json: team.roles missing ${k}`);
const team_members = [
  ...teamKeys.map((key, i) => {
    const p = people.get(key);
    if (!p) throw new Error(`parity.json: team member ${key} is in no seed meeting`);
    const joined = etDate(-(119 + i * 21), "10:00"); // always a Thursday
    return {
      id: memberId(key),
      workspace_id: WORKSPACE.id,
      name: p.name,
      email: p.email,
      role: PARITY.team.roles[key].role,
      title: p.title ?? null,
      team: PARITY.team.roles[key].team,
      color: TEAM_PALETTE[i % TEAM_PALETTE.length],
      status: "active",
      invited_at: new Date(joined.getTime() - 86_400_000).toISOString(),
      joined_at: joined.toISOString(),
    };
  }),
  ...PARITY.team.invites.map((m, i) => ({
    id: m.id,
    workspace_id: WORKSPACE.id,
    name: m.name,
    email: m.email,
    role: m.role,
    title: m.title ?? null,
    team: m.team ?? null,
    color: TEAM_PALETTE[(teamKeys.length + i) % TEAM_PALETTE.length],
    status: "invited",
    invited_at: when(m.invited),
    joined_at: null,
  })),
];
const member = (key) => {
  const m = team_members.find((t) => t.id === memberId(key));
  if (!m) throw new Error(`parity.json: unknown person ${key}`);
  return m;
};

const folders = PARITY.folders.map((f) => ({ id: f.id, workspace_id: WORKSPACE.id, name: f.name, color: f.color ?? null, created_at: when(f.created) }));
for (const [slug, meta] of Object.entries(PARITY.meeting_meta)) {
  mtg(slug);
  if (meta.folder && !folders.some((f) => f.id === meta.folder)) throw new Error(`parity.json: ${slug} → unknown folder ${meta.folder}`);
}
const meeting_invites = Object.fromEntries(
  Object.entries(PARITY.meeting_meta).filter(([, m]) => m.invited?.length).map(([slug, m]) => [mtg(slug).meeting.id, m.invited]),
);

const commentById = new Map();
const comments = PARITY.comments.map((c) => {
  const parent = c.parent ? commentById.get(c.parent) : null;
  if (c.parent && !parent) throw new Error(`parity.json: comment ${c.id} parent ${c.parent} must come first`);
  const author = member(c.author);
  const out = {
    id: c.id,
    meeting_id: mtg(c.meeting).meeting.id,
    timestamp_ms: parent ? parent.timestamp_ms : c.line == null ? null : segOf(c.meeting, c.line).start_ms,
    body: c.body,
    mentions: c.mentions.map(memberId),
    author_id: author.id,
    author_name: author.name,
    author_color: author.color,
    parent_id: parent?.id ?? null,
    created_at: when({ meeting: c.meeting, after_min: c.after_min }),
    updated_at: null,
  };
  for (const k of c.mentions) if (!c.body.includes(`@${member(k).name}`)) throw new Error(`parity.json: ${c.id} body lacks @${member(k).name}`);
  commentById.set(c.id, out);
  return out;
});

const reactions = PARITY.reactions.flatMap((r) => {
  const seg = segOf(r.meeting, r.line);
  return r.users.map((u, i) => ({
    id: `rx_${seg.id.slice(4)}_${pad(PARITY.reactions.indexOf(r), 2)}_${i}`,
    meeting_id: seg.meeting_id,
    segment_id: seg.id,
    emoji: r.emoji,
    user_id: member(u).id,
    user_name: member(u).name,
    created_at: when({ meeting: r.meeting, after_min: 20 + i * 7 }),
  }));
});

const trackers = PARITY.trackers.map((t) => ({
  id: t.id,
  workspace_id: WORKSPACE.id,
  name: t.name,
  description: t.description ?? null,
  keywords: t.keywords,
  color: t.color,
  created_at: when(t.created),
}));
// Every tracker must hit at least one seed transcript (whole-word, case-insensitive).
for (const t of trackers) {
  const re = new RegExp(`\\b(${t.keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const hits = built.flatMap((m) => m.segments).filter((sg) => re.test(sg.text)).length;
  if (!hits) throw new Error(`tracker ${t.name} has no hits in the seed transcripts`);
  t._hits = hits;
}

const deal_overrides = PARITY.deal_overrides.map((d) => ({
  workspace_id: WORKSPACE.id,
  domain: d.domain.toLowerCase(),
  name: d.name,
  stage: d.stage,
  amount: d.amount ?? null,
  close_date: d.close_date ?? null,
  bant: d.bant ?? {},
  meddpicc: d.meddpicc ?? {},
  updated_at: when(d.updated),
}));

const notifications = PARITY.notifications.map((n) => {
  const base = { id: n.id, user_id: USER.id, kind: n.kind, read_at: null };
  let out;
  if (n.kind === "mention") {
    const c = commentById.get(n.comment);
    if (!c) throw new Error(`parity.json: notification ${n.id} → unknown comment ${n.comment}`);
    const m = built.find((b) => b.meeting.id === c.meeting_id).meeting;
    out = {
      ...base,
      title: `${c.author_name} mentioned you in "${m.title}"`,
      body: c.body,
      href: `/calls/${m.id}${c.timestamp_ms != null ? `?t=${Math.floor(c.timestamp_ms / 1000)}` : ""}`,
      meeting_id: m.id,
      actor_name: c.author_name,
      created_at: c.created_at,
    };
  } else {
    const b = mtg(n.meeting);
    const m = b.meeting;
    const actor = n.actor ? member(n.actor).name : null;
    const title =
      n.title ??
      (n.kind === "meeting_ready"
        ? `"${m.title}" is ready`
        : n.kind === "shared_with_you"
          ? `${actor} shared "${m.title}" with you`
          : m.title);
    const body =
      n.body ??
      (n.kind === "meeting_ready"
        ? `Summary, ${b.action_items.length} action items and ${b.highlights.length} highlights are ready to review.`
        : n.kind === "shared_with_you"
          ? `${Math.round(m.duration_sec / 60)} min · ${b.participants.length} participants`
          : null);
    out = { ...base, title, body, href: `/calls/${m.id}`, meeting_id: m.id, actor_name: actor, created_at: when({ meeting: n.meeting, after_min: n.after_min }) };
  }
  // Read items were read ~2h after they arrived.
  if (n.read) out.read_at = new Date(Date.parse(out.created_at) + 2 * 3_600_000).toISOString();
  return out;
});

const webhooks = [];
const webhook_deliveries = [];
for (const w of PARITY.webhooks) {
  const deliveries = w.deliveries.map((d) => {
    const b = mtg(d.meeting);
    const created_at = when(d.at);
    const payload = {
      id: d.id,
      event: d.event,
      created_at,
      test: d.test,
      data: {
        meeting: {
          id: b.meeting.id,
          title: b.meeting.title,
          meeting_type: b.meeting.meeting_type,
          recording_start: b.meeting.recording_start,
          duration_sec: b.meeting.duration_sec,
        },
        url: `https://fanthom.vercel.app/calls/${b.meeting.id}`,
        share_url: b.meeting.share_token ? `https://fanthom.vercel.app/share/${b.meeting.share_token}` : null,
        participants: b.participants.map((p) => ({ name: p.name, email: p.email, is_external: p.is_external })),
        summary_markdown: b.summaries[0]?.markdown ?? null,
        action_items: b.action_items.map((a) => ({
          description: a.description,
          assignee: b.participants.find((p) => p.id === a.assignee_participant_id)?.name ?? null,
          completed: a.completed,
        })),
      },
    };
    return {
      id: d.id,
      webhook_id: w.id,
      event: d.event,
      test: d.test,
      request_body: JSON.stringify(payload),
      status_code: d.status_code,
      ok: d.ok,
      response_body: d.response_body,
      error: d.error,
      duration_ms: d.duration_ms,
      created_at,
    };
  });
  const last = [...deliveries].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  webhooks.push({
    id: w.id,
    workspace_id: WORKSPACE.id,
    url: w.url,
    description: w.description ?? null,
    events: w.events,
    secret: w.secret,
    active: w.active,
    last_status: last ? (last.status_code ?? 0) : null,
    last_delivery_at: last?.created_at ?? null,
    created_at: when(w.created),
  });
  webhook_deliveries.push(...deliveries);
}

const crm_sync_logs = PARITY.crm_sync_logs.map((l) => ({
  id: l.id,
  meeting_id: mtg(l.meeting).meeting.id,
  provider: l.provider,
  status: l.status,
  field_count: l.fields.length,
  fields: l.fields,
  message: l.message,
  created_at: when({ meeting: l.meeting, after_min: l.after_min }),
}));

const slack_config = {
  workspace_id: WORKSPACE.id,
  webhook_url: null,
  channel_label: null,
  auto_post_on_ready: false,
  include_summary: true,
  include_action_items: true,
  include_highlights: false,
  updated_at: etDate(-20, "10:00").toISOString(),
};
const prefs = {
  user_id: USER.id,
  default_template: "general",
  default_language: "en",
  default_share_access: "anyone_with_link",
  auto_record_rule: "all",
  email_recap_enabled: true,
  notify_meeting_ready: true,
  notify_mentions: true,
  notify_shared: true,
  calendar_connected: true,
  onboarding_completed: true,
  updated_at: etDate(-20, "10:00").toISOString(),
};

const parity = {
  folders,
  meeting_invites,
  team_members,
  comments,
  reactions,
  trackers: trackers.map(({ _hits, ...t }) => t), // eslint-disable-line @typescript-eslint/no-unused-vars
  deal_overrides,
  notifications,
  webhooks,
  webhook_deliveries,
  slack_config,
  crm_sync_logs,
  prefs,
};
writeFileSync(join(OUT, "parity.json"), JSON.stringify(parity, null, 1) + "\n");

// generated_at only changes when the content does, so rebuilding an unchanged seed leaves git clean.
const wsPath = join(OUT, "workspace.json");
const wsBody = { anchor, workspace: WORKSPACE, user: USER, upcoming, playlists };
let generated_at = new Date().toISOString();
if (existsSync(wsPath)) {
  const { generated_at: prev, ...prevBody } = readJson(wsPath);
  if (prev && JSON.stringify(prevBody) === JSON.stringify(wsBody)) generated_at = prev;
}
writeFileSync(wsPath, JSON.stringify({ generated_at, ...wsBody }, null, 2) + "\n");

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
import parity from "./parity.json";
${files.map((s) => `import ${ident(s)} from "./meetings/${s}.json";`).join("\n")}

export const seedWorkspace = workspace as unknown as SeedWorkspaceFile;

/** Phase 5 data (folders, team, comments, trackers, ...) — format: \`SeedParityFile\` in src/lib/db/seed-types.ts. */
export const seedParity: unknown = parity;

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
console.log(
  `parity: ${folders.length} folders, ${team_members.length} team members, ${comments.length} comments, ${reactions.length} reactions, ` +
    `${trackers.map((t) => `${t.name} (${t._hits} hits)`).join(", ")}, ${deal_overrides.length} deal overrides, ` +
    `${notifications.length} notifications (${notifications.filter((n) => !n.read_at).length} unread), ${webhooks.length} webhook / ${webhook_deliveries.length} deliveries, ${crm_sync_logs.length} CRM logs`,
);
console.log(`calendar events: ${upcoming.length}, playlists: ${playlists.map((p) => `${p.name} (${p.items.length})`).join(", ")}`);
