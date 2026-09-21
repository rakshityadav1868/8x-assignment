/** Companies / deals view (Phase 5 C). Pure. Owner: backend. */
import type {
  BantFields,
  CompanyDetail,
  CompanySummary,
  DealFields,
  DealOverrides,
  DealStage,
  MeddpiccFields,
  MeetingDetail,
  MeetingListItem,
  Stakeholder,
  Summary,
} from "@/lib/types";
import { meetingDate } from "./library";

/** Free-mail domains never form a company. */
export const FREE_MAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "aol.com"] as const;
const FREE_MAIL = new Set<string>(FREE_MAIL_DOMAINS);

/** Second-level labels that belong to the public suffix ("co.uk", "com.au", …). */
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "ltd", "plc"]);

type Overrides = DealOverrides & { name?: string };

/** Lowercased domain of an email, or null. */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.trim().lastIndexOf("@");
  if (at < 1) return null;
  const d = email
    .trim()
    .slice(at + 1)
    .toLowerCase()
    .replace(/\.+$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

/** "acme-logistics.co.uk" → "Acme Logistics". */
export function companyNameFromDomain(domain: string): string {
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  if (labels.length > 1) labels.pop(); // TLD
  if (labels.length > 1 && SECOND_LEVEL.has(labels[labels.length - 1]) && labels[labels.length - 1].length <= 3) labels.pop();
  const core = labels[labels.length - 1] ?? domain;
  return core
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Primary external company of a meeting = most frequent external (non-workspace, non-free-mail) participant
 * domain; ties → alphabetical by domain. Null for internal meetings. Used to fill MeetingListItem.company_domain/name.
 */
export function primaryCompany(
  participants: { email: string | null; is_external: boolean }[],
  workspaceDomain: string,
): { domain: string; name: string } | null {
  const ws = workspaceDomain.toLowerCase();
  const counts = new Map<string, number>();
  for (const p of participants) {
    const d = emailDomain(p.email);
    if (!d || d === ws || d.endsWith(`.${ws}`) || FREE_MAIL.has(d)) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? { domain: best[0], name: companyNameFromDomain(best[0]) } : null;
}

// ---------------------------------------------------------------------------
// Deal fields
// ---------------------------------------------------------------------------

const EMPTY_BANT: BantFields = { budget: null, authority: null, need: null, timeline: null };
const EMPTY_MEDDPICC: MeddpiccFields = {
  metrics: null,
  economic_buyer: null,
  decision_criteria: null,
  decision_process: null,
  paper_process: null,
  identify_pain: null,
  champion: null,
  competition: null,
};

const normHeading = (h: string) => h.toLowerCase().replace(/[^a-z]+/g, " ").trim();
const detailTime = (d: MeetingDetail) => Date.parse(meetingDate(d.meeting)) || 0;

function newestSummary(details: MeetingDetail[], templates: Summary["template"][]): Summary | null {
  for (const d of [...details].sort((a, b) => detailTime(b) - detailTime(a))) {
    for (const t of templates) {
      const s = d.summaries.find((x) => x.template === t && x.language === "en") ?? d.summaries.find((x) => x.template === t);
      if (s) return s;
    }
  }
  return null;
}

function sectionText(summary: Summary | null, match: (heading: string) => boolean): string | null {
  if (!summary) return null;
  const sec = summary.sections.find((s) => match(normHeading(s.heading)));
  if (!sec || !sec.bullets.length) return null;
  return sec.bullets.map((b) => b.text.trim()).join("; ");
}

/** "$120k", "$1.2M", "$85,000", "120k ARR" → number. First plausible money amount in the text. */
export function parseAmount(text: string | null): number | null {
  if (!text) return null;
  const re = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|mm|million|thousand)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let n = Number(m[1].replace(/,/g, ""));
    const unit = (m[2] ?? "").toLowerCase();
    if (unit === "k" || unit === "thousand") n *= 1_000;
    else if (unit === "m" || unit === "mm" || unit === "million") n *= 1_000_000;
    if (n >= 1_000) return Math.round(n);
  }
  return null;
}

function deriveStage(details: MeetingDetail[]): DealStage {
  if (!details.length) return "discovery";
  if (details.some((d) => d.meeting.meeting_type === "customer_success")) return "closed_won";
  const text = details
    .flatMap((d) => [...d.segments.map((s) => s.text), ...d.summaries.flatMap((s) => s.sections.flatMap((x) => x.bullets.map((b) => b.text)))])
    .join("\n")
    .toLowerCase();
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  if (count(/\b(closed[- ]won|signed the (contract|order form|agreement)|contract (is|was) signed|welcome aboard)\b/g)) return "closed_won";
  if (count(/\b(closed[- ]lost|went with (a competitor|another vendor)|not moving forward|decided to pass)\b/g)) return "closed_lost";
  const contract = count(/\b(contract|redlines?|msa|order form|procurement|legal review|signature)\b/g);
  const proposal = count(/\b(proposal|pricing|quote|price|discount|pilot)\b/g);
  const evaluation = count(/\b(demo|trial|evaluation|proof of concept|poc|security review|sandbox)\b/g);
  if (contract >= 3 && details.length >= 2) return "negotiation";
  if (proposal >= 3 || contract >= 3) return "proposal";
  if (evaluation >= 2 || details.length >= 2) return "evaluation";
  return "discovery";
}

/**
 * Derive deal fields from a company's meetings: stage heuristic from meeting types/count/recency
 * (and keywords like "contract", "pricing", "signed"); BANT from the latest `sales_bant` summary sections,
 * MEDDPICC from the latest `sales_meddpicc` summary (heading → field match); unknown = null.
 * Fallbacks: the plain `sales` summary fills budget ("Pricing & budget") and need ("Pain points").
 */
export function deriveDealFields(details: MeetingDetail[]): DealFields {
  const bantSum = newestSummary(details, ["sales_bant"]);
  const salesSum = newestSummary(details, ["sales"]);
  const medSum = newestSummary(details, ["sales_meddpicc"]);

  const bant: BantFields = {
    budget: sectionText(bantSum, (h) => h.startsWith("budget")) ?? sectionText(salesSum, (h) => h.includes("budget") || h.includes("pricing")),
    authority: sectionText(bantSum, (h) => h.startsWith("authority")),
    need: sectionText(bantSum, (h) => h.startsWith("need")) ?? sectionText(salesSum, (h) => h.includes("pain")),
    timeline: sectionText(bantSum, (h) => h.startsWith("timeline")),
  };
  const meddpicc: MeddpiccFields = { ...EMPTY_MEDDPICC };
  for (const key of Object.keys(EMPTY_MEDDPICC) as (keyof MeddpiccFields)[]) {
    const want = key.replace(/_/g, " ");
    meddpicc[key] = sectionText(medSum, (h) => h === want || h.startsWith(want));
  }
  if (!meddpicc.identify_pain) meddpicc.identify_pain = sectionText(salesSum, (h) => h.includes("pain"));
  if (!meddpicc.competition) meddpicc.competition = sectionText(salesSum, (h) => h.includes("current solution"));

  return {
    stage: deriveStage(details),
    amount: parseAmount(bant.budget) ?? parseAmount(sectionText(salesSum, (h) => h.includes("pricing"))),
    close_date: null,
    bant: bant ?? { ...EMPTY_BANT },
    meddpicc,
  };
}

/** Deep-merge user overrides over derived fields. */
export function applyDealOverrides(fields: DealFields, overrides: DealOverrides | null): DealFields {
  if (!overrides) return fields;
  const pick = <T extends object>(base: T, patch: Partial<T> | undefined): T => {
    const out = { ...base };
    if (patch) for (const [k, v] of Object.entries(patch)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    return out;
  };
  return {
    stage: overrides.stage ?? fields.stage,
    amount: overrides.amount !== undefined ? overrides.amount : fields.amount,
    close_date: overrides.close_date !== undefined ? overrides.close_date : fields.close_date,
    bant: pick(fields.bant, overrides.bant),
    meddpicc: pick(fields.meddpicc, overrides.meddpicc),
  };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface Group {
  domain: string;
  items: MeetingListItem[];
  details: MeetingDetail[];
}

function itemDomain(item: MeetingListItem, workspaceDomain: string): string | null {
  if (item.company_domain !== undefined) return item.company_domain ? item.company_domain.toLowerCase() : null;
  return primaryCompany(item.participants, workspaceDomain)?.domain ?? null;
}

function groupBy(items: MeetingListItem[], details: MeetingDetail[], workspaceDomain: string): Map<string, Group> {
  const byId = new Map(details.map((d) => [d.meeting.id, d]));
  const groups = new Map<string, Group>();
  for (const item of items) {
    if (item.deleted_at) continue;
    const domain = itemDomain(item, workspaceDomain);
    if (!domain) continue;
    let g = groups.get(domain);
    if (!g) groups.set(domain, (g = { domain, items: [], details: [] }));
    g.items.push(item);
    const d = byId.get(item.id);
    if (d) g.details.push(d);
  }
  for (const g of groups.values()) {
    g.items.sort((a, b) => (Date.parse(meetingDate(b)) || 0) - (Date.parse(meetingDate(a)) || 0));
    g.details.sort((a, b) => detailTime(b) - detailTime(a));
  }
  return groups;
}

function stakeholderCount(g: Group): number {
  const set = new Set<string>();
  for (const it of g.items) for (const p of it.participants) if (emailDomain(p.email) === g.domain) set.add((p.email ?? p.name).toLowerCase());
  return set.size;
}

function summarize(g: Group, override: Overrides | null): CompanySummary {
  const newest = g.items[0];
  const oldest = g.items[g.items.length - 1];
  const fields = applyDealOverrides(deriveDealFields(g.details), override);
  return {
    domain: g.domain,
    name: override?.name?.trim() || newest?.company_name || companyNameFromDomain(g.domain),
    meeting_count: g.items.length,
    first_meeting_at: oldest ? meetingDate(oldest) : null,
    last_meeting_at: newest ? meetingDate(newest) : null,
    stakeholder_count: stakeholderCount(g),
    stage: fields.stage,
    latest_meeting_id: newest?.id ?? null,
    latest_meeting_title: newest?.title ?? null,
  };
}

/** Group meetings by primary company. Most recent activity first. `overrides` carry user edits + company names by domain. */
export function groupCompanies(
  items: MeetingListItem[],
  details: MeetingDetail[],
  workspaceDomain: string,
  overrides: (DealOverrides & { name?: string })[],
): CompanySummary[] {
  const ov = new Map(overrides.map((o) => [o.domain.toLowerCase(), o]));
  return [...groupBy(items, details, workspaceDomain).values()]
    .map((g) => summarize(g, ov.get(g.domain) ?? null))
    .sort((a, b) => (Date.parse(b.last_meeting_at ?? "") || 0) - (Date.parse(a.last_meeting_at ?? "") || 0) || a.name.localeCompare(b.name));
}

const PREFERRED_TEMPLATES: Summary["template"][] = ["sales", "customer_success", "sales_bant", "sales_meddpicc", "sales_spiced", "general"];

/** Full company page; null if no meeting maps to the domain. */
export function buildCompanyDetail(
  domain: string,
  items: MeetingListItem[],
  details: MeetingDetail[],
  workspaceDomain: string,
  overrides: (DealOverrides & { name?: string }) | null,
): CompanyDetail | null {
  const key = domain.trim().toLowerCase();
  const g = groupBy(items, details, workspaceDomain).get(key);
  if (!g) return null;
  const base = summarize(g, overrides);
  const ws = workspaceDomain.toLowerCase();

  const ext = new Map<string, Stakeholder>();
  const internal = new Map<string, Stakeholder>();
  for (const d of g.details) {
    const talk = new Map<string, number>();
    for (const s of d.segments) if (s.participant_id) talk.set(s.participant_id, (talk.get(s.participant_id) ?? 0) + Math.max(0, s.end_ms - s.start_ms));
    const date = meetingDate(d.meeting);
    for (const p of d.participants) {
      const dom = emailDomain(p.email);
      const target = dom === key ? ext : dom === ws || (!dom && !p.is_external) ? internal : null;
      if (!target) continue;
      const k = (p.email ?? p.name).toLowerCase();
      const cur = target.get(k) ?? { name: p.name, email: p.email, color: p.color, meeting_count: 0, talk_ms: 0, last_seen: null };
      cur.meeting_count += 1;
      cur.talk_ms += talk.get(p.id) ?? 0;
      if (!cur.last_seen || (Date.parse(date) || 0) > (Date.parse(cur.last_seen) || 0)) cur.last_seen = date;
      target.set(k, cur);
    }
  }
  const byTalk = (a: Stakeholder, b: Stakeholder) => b.meeting_count - a.meeting_count || b.talk_ms - a.talk_ms || a.name.localeCompare(b.name);

  let latest_summary: Summary | null = null;
  const latest = g.details[0];
  if (latest) {
    for (const t of PREFERRED_TEMPLATES) {
      latest_summary = latest.summaries.find((s) => s.template === t && s.language === "en") ?? null;
      if (latest_summary) break;
    }
    latest_summary ??= latest.summaries[0] ?? null;
  }

  const next_steps = g.details.flatMap((d) =>
    [...d.action_items]
      .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.timestamp_ms ?? 0) - (b.timestamp_ms ?? 0))
      .map((a) => ({ text: a.description, meeting_id: d.meeting.id, start_ms: a.timestamp_ms, completed: a.completed })),
  );

  const detailById = new Map(g.details.map((d) => [d.meeting.id, d]));
  const timeline = g.items.map((it) => {
    const d = detailById.get(it.id);
    let headline: string | null = null;
    if (d) {
      const s = PREFERRED_TEMPLATES.map((t) => d.summaries.find((x) => x.template === t)).find(Boolean) ?? d.summaries[0];
      headline = s?.sections[0]?.bullets[0]?.text ?? d.chapters[0]?.title ?? null;
    }
    return { meeting_id: it.id, title: it.title, date: meetingDate(it), meeting_type: it.meeting_type, headline };
  });

  return {
    ...base,
    stakeholder_count: ext.size || base.stakeholder_count,
    meetings: g.items,
    stakeholders: [...ext.values()].sort(byTalk),
    internal_team: [...internal.values()].sort(byTalk),
    latest_summary,
    next_steps,
    fields: applyDealOverrides(deriveDealFields(g.details), overrides),
    timeline,
  };
}
