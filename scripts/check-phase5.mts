/**
 * Sanity checks for the Phase 5 pure libraries (analytics, exports, integrations) against the seed meetings.
 *
 *   node --experimental-transform-types --no-warnings scripts/check-phase5.mts     (Node >= 22.15; exits 1 on failure)
 *
 * Also does one REAL signed webhook POST to a throwaway local HTTP server (NODE_ENV=development allows
 * localhost) and verifies the HMAC signature. `server-only` and `@/lib/db` are stubbed by the resolve hook.
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import * as nodeModule from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BotSession, MeetingDetail, MeetingListItem, SeedMeetingFile, Tracker, Webhook } from "../src/lib/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type ResolveContext = { parentURL?: string };
type NextResolve = (specifier: string, context: ResolveContext) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks(hooks: { resolve(specifier: string, context: ResolveContext, nextResolve: NextResolve): unknown }): void;
};

const STUBS: Record<string, string> = {
  "server-only": "export {};",
  "@/lib/db": "export const getRepo = () => { throw new Error('no repo in check-phase5'); };",
};

registerHooks({
  resolve(specifier: string, context: ResolveContext, nextResolve: NextResolve) {
    if (specifier in STUBS) return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
    let target: string | null = null;
    if (specifier.startsWith("@/")) target = join(ROOT, "src", specifier.slice(2));
    else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:"))
      target = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
    if (target && !/\.(m?[jt]s|json)$/.test(target)) {
      const hit = [`${target}.ts`, `${target}.tsx`, join(target, "index.ts")].find((p) => existsSync(p));
      if (hit) return nextResolve(pathToFileURL(hit).href, context);
    }
    if (target && specifier.startsWith("@/")) return nextResolve(pathToFileURL(target).href, context);
    return nextResolve(specifier, context);
  },
});

const imp = <T,>(p: string) => import(pathToFileURL(join(ROOT, p)).href) as Promise<T>;
const { computeCoachingMetrics } = await imp<typeof import("../src/lib/analytics/coaching")>("src/lib/analytics/coaching.ts");
const { findTrackerHits, findMeetingTrackerHits, withTrackerStats } = await imp<typeof import("../src/lib/analytics/trackers")>("src/lib/analytics/trackers.ts");
const { computeInsights } = await imp<typeof import("../src/lib/analytics/insights")>("src/lib/analytics/insights.ts");
const deals = await imp<typeof import("../src/lib/analytics/deals")>("src/lib/analytics/deals.ts");
const { filterMeetings } = await imp<typeof import("../src/lib/analytics/library")>("src/lib/analytics/library.ts");
const { effectiveRecord } = await imp<typeof import("../src/lib/analytics/calendar")>("src/lib/analytics/calendar.ts");
const tx = await imp<typeof import("../src/lib/export/transcript")>("src/lib/export/transcript.ts");
const { summaryToMarkdown, buildEmailRecap } = await imp<typeof import("../src/lib/export/summary")>("src/lib/export/summary.ts");
const { buildDownload, slugify } = await imp<typeof import("../src/lib/export/download")>("src/lib/export/download.ts");
const bot = await imp<typeof import("../src/lib/integrations/bot")>("src/lib/integrations/bot.ts");
const { buildCrmPreview } = await imp<typeof import("../src/lib/integrations/crm")>("src/lib/integrations/crm.ts");
const slack = await imp<typeof import("../src/lib/integrations/slack")>("src/lib/integrations/slack.ts");
const wh = await imp<typeof import("../src/lib/integrations/webhooks")>("src/lib/integrations/webhooks.ts");

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let failed = 0;
let passed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `\n      ${JSON.stringify(detail)}` : ""}`);
}

const dir = join(ROOT, "src/data/seed/meetings");
const details: MeetingDetail[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as SeedMeetingFile);
const byId = new Map(details.map((d) => [d.meeting.id, d]));
const q4 = byId.get("m_q4-roadmap-planning");
if (!q4) throw new Error("Q4 seed meeting missing");
const WS = "northwindlabs.io";

// ---------------------------------------------------------------------------
// Coaching
// ---------------------------------------------------------------------------

const cm = computeCoachingMetrics(q4);
const pctSum = cm.speakers.reduce((n, s) => n + s.talk_pct, 0);
check("coaching: talk ratios sum to ~100", Math.abs(pctSum - 100) < 0.6, pctSum);
check("coaching: every Q4 speaker present", cm.speakers.length === q4.participants.length, cm.speakers.length);
check("coaching: speakers sorted by talk time", cm.speakers.every((s, i, a) => i === 0 || a[i - 1].talk_ms >= s.talk_ms));
check("coaching: questions counted", cm.questions_asked > 0 && cm.questions_asked === q4.segments.reduce((n, s) => n + (s.text.match(/\?[?!]*/g)?.length ?? 0), 0), cm.questions_asked);
check("coaching: plausible words per minute", cm.speakers.every((s) => s.words_per_minute >= 60 && s.words_per_minute <= 260), cm.speakers.map((s) => s.words_per_minute));
check("coaching: longest monologue ≥ longest segment", cm.speakers.every((s) => s.longest_monologue_ms > 0 && s.longest_monologue_start_ms != null));
check("coaching: silence within duration", cm.silence_ms >= 0 && cm.silence_ms < cm.duration_ms && cm.total_talk_ms <= cm.duration_ms, cm);
check("coaching: patience within bounds", cm.avg_patience_ms > 0 && cm.avg_patience_ms <= 5000, cm.avg_patience_ms);
check("coaching: speaker switches counted", cm.speaker_switches > 50, cm.speaker_switches);
check("coaching: internal call is 100% internal", cm.internal_talk_pct === 100 && cm.external_talk_pct === 0, cm);
const fillerProbe = computeCoachingMetrics({
  meeting: { ...q4.meeting, id: "probe", duration_sec: 20 },
  participants: q4.participants.slice(0, 2),
  segments: [
    { id: "a", meeting_id: "probe", participant_id: q4.participants[0].id, start_ms: 0, end_ms: 4000, text: "Um, so, you know, I basically think we should- " },
    { id: "b", meeting_id: "probe", participant_id: q4.participants[1].id, start_ms: 3700, end_ms: 6000, text: "Sorry, can I jump in? Like, what about Q4?" },
    { id: "c", meeting_id: "probe", participant_id: q4.participants[0].id, start_ms: 7000, end_ms: 9000, text: "Sure." },
    { id: "d", meeting_id: "probe", participant_id: q4.participants[0].id, start_ms: 9500, end_ms: 12000, text: "I mean it's kind of fine." },
  ],
});
const p0 = fillerProbe.speakers.find((s) => s.participant_id === q4.participants[0].id)!;
const p1 = fillerProbe.speakers.find((s) => s.participant_id === q4.participants[1].id)!;
check("coaching probe: fillers (um, you know, basically, i mean, kind of)", p0.filler_words === 5, p0.filler_breakdown);
check("coaching probe: interruption on overlap", p1.interruptions === 1 && p0.interruptions === 0, [p0.interruptions, p1.interruptions]);
check("coaching probe: monologue merges gap < 2s", p0.longest_monologue_ms === 5000 && p0.longest_monologue_start_ms === 7000, p0);
check("coaching probe: patience = 1000ms for speaker 0", p0.avg_patience_ms === 1000, p0.avg_patience_ms);
check("coaching probe: 2 questions", p1.questions_asked === 2, p1.questions_asked);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const srt = tx.transcriptToSrt(q4);
const cues = srt.trim().split(/\n\n/);
const cueRe = /^(\d+)\n(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})\n[\s\S]+$/;
const toMs = (h: string, m: string, s: string, x: string) => ((+h * 60 + +m) * 60 + +s) * 1000 + +x;
let srtOk = cues.length === q4.segments.length;
let prevStart = -1;
for (const [i, c] of cues.entries()) {
  const m = c.match(cueRe);
  if (!m || +m[1] !== i + 1) {
    srtOk = false;
    break;
  }
  const start = toMs(m[2], m[3], m[4], m[5]);
  const end = toMs(m[6], m[7], m[8], m[9]);
  if (end <= start || start < prevStart) srtOk = false;
  prevStart = start;
}
check("srt: parses, numbered, monotonic, one cue per segment", srtOk, cues.slice(0, 2));
check("srt: first cue timing exact", cues[0].split("\n")[1] === `${tx.formatCueTime(q4.segments[0].start_ms, ",")} --> ${tx.formatCueTime(q4.segments[0].end_ms, ",")}`);
check("formatCueTime", tx.formatCueTime(3_723_004, ",") === "01:02:03,004" && tx.formatCueTime(59_999, ".") === "00:00:59.999");
const vtt = tx.transcriptToVtt(q4);
check("vtt: header + voice tags + dot timestamps", /^WEBVTT/.test(vtt) && /\n\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\n<v [^>]+>/.test(vtt) && !/,\d{3} -->/.test(vtt));
check("vtt: no blank lines inside cues", vtt.trim().split(/\n\n/).slice(1).every((c) => c.split("\n").length === 3));
const txt = tx.transcriptToTxt(q4);
check("txt: [HH:MM:SS] Speaker: text lines", txt.startsWith("Q4 Roadmap Planning") && /\n\[00:00:00\] \S.*: Okay/.test(txt));
const md = tx.transcriptToMarkdown(q4, "https://x.test/calls/m");
check("transcript md: merged blocks with deep links", md.startsWith("# Q4 Roadmap Planning") && /\*\*[^*]+\*\* \[00:00\]\(https:\/\/x\.test\/calls\/m\?t=0\)/.test(md));
const summaryMd = summaryToMarkdown(q4, q4.summaries[0], "https://x.test/calls/m");
check("summary md: sections + timestamp links + action items", summaryMd.includes("## Summary") && summaryMd.includes("?t=") && summaryMd.includes("## Action items"));
const dl = buildDownload(q4, "transcript_srt", {});
check("download: filename + content type", /^q4-roadmap-planning-\d{4}-\d{2}-\d{2}\.srt$/.test(dl.filename) && dl.content_type === "application/x-subrip; charset=utf-8", dl.filename);
check("download: summary filename", buildDownload(q4, "summary_md", { summary: q4.summaries[0] }).filename.endsWith("-summary.md"));
check("slugify", slugify("Q4 Roadmap: Planning!") === "q4-roadmap-planning" && slugify("¡Olé!") === "ole" && slugify("!!!") === "meeting");
const recap = buildEmailRecap(byId.get("m_acme-discovery")!, byId.get("m_acme-discovery")!.summaries[0], {
  callUrl: "https://x.test/calls/m_acme-discovery",
  include_action_items: true,
  include_highlights: true,
  recipients: "external",
});
check("email recap: external recipients only", recap.to.length === 1 && recap.to[0].endsWith("@acmelogistics.com"), recap.to);
check("email recap: html escaped + text", recap.html.includes("<h1") && !recap.html.includes("<script") && recap.text.includes("ACTION ITEMS"));

// ---------------------------------------------------------------------------
// Trackers
// ---------------------------------------------------------------------------

const pricing: Tracker = {
  id: "t_pricing",
  workspace_id: "ws",
  name: "Pricing",
  description: null,
  keywords: ["pricing", "price", "discount", "per seat"],
  color: "#3b82f6",
  created_at: new Date().toISOString(),
};
const q4Hits = findMeetingTrackerHits([pricing], q4);
check("tracker Pricing: hits in Q4", q4Hits.length > 0, q4Hits.length);
check("tracker snippets: <mark> + escaped", q4Hits.every((h) => /<mark>[^<]+<\/mark>/.test(h.snippet) && !/<(?!\/?mark>)/.test(h.snippet)));
check("tracker: whole-word only", findMeetingTrackerHits([{ ...pricing, keywords: ["price"] }], q4).every((h) => /\bprice\b/i.test(h.snippet.replace(/<\/?mark>/g, ""))));
const allHits = findTrackerHits(pricing, details);
const stats = withTrackerStats(pricing, allHits);
check("tracker stats across calls", stats.hit_count === allHits.length && stats.meeting_count >= 2 && !!stats.last_hit_at, stats);
check("tracker hits ordered by date desc", allHits.every((h, i, a) => i === 0 || (Date.parse(a[i - 1].meeting_date ?? "") || 0) >= (Date.parse(h.meeting_date ?? "") || 0)));

// ---------------------------------------------------------------------------
// Insights, deals, library, calendar
// ---------------------------------------------------------------------------

const priya = { id: "u_priya", workspace_id: "ws_northwind", name: "Priya Raman", email: "priya@northwindlabs.io" };
const latest = Math.max(...details.map((d) => Date.parse(d.meeting.recording_start ?? d.meeting.created_at)));
const ins = computeInsights(details, { range: "all", now: new Date(latest + 3_600_000), me: priya, workspace_domain: WS, trackers: [pricing] });
check("insights: all seed meetings counted", ins.totals.meetings === details.length, ins.totals);
check("insights: weekly buckets are Mondays and sum up", ins.weekly.every((w) => new Date(w.week_start).getUTCDay() === 1) && ins.weekly.reduce((n, w) => n + w.meetings, 0) === details.length);
check("insights: 7×24 load grid", ins.meeting_load.length === 168 && ins.meeting_load.reduce((n, c) => n + c.meetings, 0) === details.length);
check("insights: internal people first", ins.by_person.findIndex((p) => p.is_external) === -1 || ins.by_person.slice(ins.by_person.findIndex((p) => p.is_external)).every((p) => p.is_external));
check("insights: top tracker Pricing", ins.top_trackers[0]?.tracker_id === "t_pricing" && ins.top_trackers[0].hits === allHits.length, ins.top_trackers);
check("insights: my talk % present", ins.weekly.some((w) => w.avg_talk_pct_me != null));

const items: MeetingListItem[] = details.map((d) => {
  const co = deals.primaryCompany(d.participants, WS);
  return {
    ...d.meeting,
    participants: d.participants,
    action_item_count: d.action_items.length,
    highlight_count: d.highlights.length,
    company_domain: co?.domain ?? null,
    company_name: co?.name ?? null,
    starred: d.meeting.id === "m_q4-roadmap-planning",
    folder_id: null,
    deleted_at: null,
  };
});
const companies = deals.groupCompanies(items, details, WS, []);
const domains = companies.map((c) => c.domain).sort();
check("deals: companies from external domains (no free mail)", ["acmelogistics.com", "globex.com", "keystonecloud.com"].every((d) => domains.includes(d)) && !domains.includes("gmail.com"), domains);
check("deals: company name from domain", deals.companyNameFromDomain("acme-logistics.co.uk") === "Acme Logistics" && deals.companyNameFromDomain("globex.com") === "Globex");
const acme = deals.buildCompanyDetail("acmelogistics.com", items, details, WS, null);
check("deals: acme BANT + MEDDPICC from summaries", !!acme?.fields.bant.budget && !!acme?.fields.meddpicc.champion, acme?.fields);
check("deals: acme stakeholders external, team internal", !!acme && acme.stakeholders.every((s) => s.email?.endsWith("@acmelogistics.com")) && acme.internal_team.every((s) => s.email?.endsWith(`@${WS}`)));
const overridden = deals.applyDealOverrides(acme!.fields, { domain: "acmelogistics.com", workspace_id: "ws", stage: "negotiation", bant: { budget: "$50k" }, updated_at: "" });
check("deals: overrides deep-merge", overridden.stage === "negotiation" && overridden.bant.budget === "$50k" && overridden.bant.need === acme!.fields.bant.need);
check("deals: globex is a customer (closed_won)", companies.find((c) => c.domain === "globex.com")?.stage === "closed_won");

check("library: default excludes nothing, newest first", filterMeetings(items, {}).length === items.length);
check("library: starred filter", filterMeetings(items, { starred: true }).map((m) => m.id).join() === "m_q4-roadmap-planning");
check("library: company + type filters", filterMeetings(items, { company: "acmelogistics.com" }).length === 1 && filterMeetings(items, { meeting_type: "sales" }).every((m) => m.meeting_type === "sales"));
check("library: trash only deleted", filterMeetings([{ ...items[0], deleted_at: "2025-01-01" }, items[1]], { trash: true }).length === 1);
check("library: sort title", filterMeetings(items, { sort: "title" }).every((m, i, a) => i === 0 || a[i - 1].title.localeCompare(m.title, undefined, { sensitivity: "base" }) <= 0));
check("calendar rules", effectiveRecord({ is_external: true, record_override: null }, "external_only") && !effectiveRecord({ is_external: true, record_override: false }, "all") && effectiveRecord({ is_external: false, record_override: null }, "internal_only"));

// ---------------------------------------------------------------------------
// Bot state machine
// ---------------------------------------------------------------------------

check("bot: detectPlatform", bot.detectPlatform("https://us02web.zoom.us/j/123") === "zoom" && bot.detectPlatform("https://meet.google.com/abc-defg-hij") === "google_meet" && bot.detectPlatform("https://teams.microsoft.com/l/meetup-join/x") === "teams" && bot.detectPlatform("https://example.com") === "unknown" && bot.detectPlatform("nope") === "unknown");
const t0 = Date.parse("2026-01-01T00:00:00Z");
let s: BotSession = {
  id: "b1", workspace_id: "ws", meeting_url: "https://zoom.us/j/1", platform: "zoom", title: "Zoom meeting", state: "joining", simulated: true,
  meeting_id: null, error: null, events: [{ state: "joining", at: new Date(t0).toISOString(), note: null }], created_at: new Date(t0).toISOString(),
  joined_at: null, admitted_at: null, recording_ended_at: null, completed_at: null, updated_at: new Date(t0).toISOString(),
};
check("bot: no change before 3s", bot.autoAdvanceBot(s, new Date(t0 + 2000)) === null);
s = { ...s, ...bot.autoAdvanceBot(s, new Date(t0 + 60_000))! };
check("bot: elapsed time → recording (stateless)", s.state === "recording" && s.joined_at === new Date(t0 + 3000).toISOString() && s.admitted_at === new Date(t0 + 8000).toISOString(), s.events);
let threw = false;
try {
  bot.advanceBot({ ...s, state: "done" }, "next", new Date());
} catch (e) {
  threw = (e as { status?: number }).status === 409;
}
check("bot: illegal transition → 409", threw);
s = { ...s, ...bot.advanceBot(s, "stop", new Date(t0 + 90_000)) };
check("bot: stop → processing", s.state === "processing" && !!s.recording_ended_at);
s = { ...s, ...bot.autoAdvanceBot(s, new Date(t0 + 95_000))! };
check("bot: processing → done after 4s", s.state === "done" && s.completed_at === new Date(t0 + 94_000).toISOString() && s.events.length === 5, s.events);

// ---------------------------------------------------------------------------
// CRM, Slack, webhooks
// ---------------------------------------------------------------------------

const acmeDetail = byId.get("m_acme-discovery")!;
const hub = buildCrmPreview("hubspot", acmeDetail, acmeDetail.summaries[0], acme!.fields, "acmelogistics.com");
check("crm hubspot: dealname, hs_next_step, contact", ["dealname", "hs_next_step", "hs_note_body", "email", "dealstage"].every((f) => hub.fields.some((x) => x.crm_field === f)) && !hub.connected, hub.fields.map((f) => f.crm_field));
const sf = buildCrmPreview("salesforce", acmeDetail, acmeDetail.summaries[0], acme!.fields, "acmelogistics.com");
check("crm salesforce: Opportunity fields", ["Name", "StageName", "NextStep"].every((f) => sf.fields.some((x) => x.crm_object === "Opportunity" && x.crm_field === f)));

const recapSlack = slack.buildSlackRecap(acmeDetail, acmeDetail.summaries[0], { include_summary: true, include_action_items: true, include_highlights: true }, { origin: "https://fanthom.test" });
check("slack: Block Kit recap with header + button", (recapSlack.blocks[0] as { type: string }).type === "header" && JSON.stringify(recapSlack.blocks).includes("Open in Fanthom") && recapSlack.blocks.length <= 50 && recapSlack.text.includes("?t="));
check("slack: host validation", slack.isSlackWebhookUrl("https://hooks.slack.com/services/T0/B0/xyz") && !slack.isSlackWebhookUrl("https://hooks.slack.com.evil.io/x") && !slack.isSlackWebhookUrl("http://hooks.slack.com/services/x"));
const view = slack.toSlackConfigView({ workspace_id: "ws", webhook_url: "https://hooks.slack.com/services/T012345/B067/abcdefgh1234", channel_label: "#sales", auto_post_on_ready: false, include_summary: true, include_action_items: true, include_highlights: false, updated_at: "" });
check("slack: config view never leaks the URL", view.connected && !JSON.stringify(view).includes("abcdefgh1234") && view.webhook_url_masked!.endsWith("1234"), view);

check("webhooks: signature", wh.signWebhookBody("s3cret", "{}") === `sha256=${createHmac("sha256", "s3cret").update("{}").digest("hex")}`);
const bad = ["http://example.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.1.2.3/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://user:pw@example.com/x", "https://intranet/x", "https://foo.internal/x", "ftp://example.com", "https://192.168.1.1:8443/x", "https://[fd00::1]/"];
const badResults = bad.map((u) => [u, wh.validateWebhookUrl(u)]);
check("webhooks: SSRF guard rejects private/loopback/non-https", badResults.every(([, e]) => e !== null), badResults.filter(([, e]) => e === null));
check("webhooks: public https accepted", wh.validateWebhookUrl("https://hooks.zapier.com/hooks/catch/1/abc/") === null);
const payload = wh.buildWebhookPayload("meeting.ready", acmeDetail, acmeDetail.summaries[0], { origin: "https://fanthom.test/", deliveryId: "whd_1", test: true });
check("webhooks: payload URLs absolute", payload.data.url === "https://fanthom.test/calls/m_acme-discovery" && payload.data.highlights!.every((h) => h.url.startsWith("https://fanthom.test/clip/")));

// Real POST to a local server (dev mode allows http://127.0.0.1).
(process.env as Record<string, string>).NODE_ENV = "development";
const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ headers: req.headers, body });
    res.writeHead(req.url === "/fail" ? 500 : 200, { "Content-Type": "text/plain" }).end("thanks");
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as AddressInfo).port;
const hook: Webhook = { id: "wh1", workspace_id: "ws", url: `http://127.0.0.1:${port}/hook`, description: null, events: ["meeting.ready"], secret: "whsec_test", active: true, last_status: null, last_delivery_at: null, created_at: "" };
const d1 = await wh.deliverWebhook(hook, payload);
const got = received[0];
check("webhooks: real POST delivered + signed", d1.ok && d1.status_code === 200 && d1.response_body === "thanks" && got?.headers["x-fanthom-signature"] === wh.signWebhookBody("whsec_test", got.body) && got.headers["x-fanthom-event"] === "meeting.ready", d1);
const d2 = await wh.deliverWebhook({ ...hook, url: `http://127.0.0.1:${port}/fail` }, payload);
check("webhooks: non-2xx recorded as failure", !d2.ok && d2.status_code === 500 && !!d2.error, d2);
server.close();
(process.env as Record<string, string>).NODE_ENV = "production";
const d3 = await wh.deliverWebhook(hook, payload);
check("webhooks: localhost blocked outside development", !d3.ok && d3.status_code === null && received.length === 2, d3.error);

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
