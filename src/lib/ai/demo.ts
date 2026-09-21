/**
 * Deterministic "demo mode" AI (no ANTHROPIC_API_KEY). Everything here is extractive: it selects and lightly
 * rewrites real transcript lines, so every bullet is grounded and carries a real timestamp.
 * Callers always report `ai_mode: "demo"` for these results.
 */
import { TEMPLATE_BY_KEY } from "@/lib/templates";
import { Bm25, sentences, terms, words } from "@/lib/search/text";
import type {
  CatchUpBullet,
  Citation,
  Commitment,
  Decision,
  FollowUpEmail,
  HighlightType,
  MeetingDetail,
  MeetingType,
  Participant,
  SummarySection,
  SummaryTemplateKey,
  TranscriptSegment,
} from "@/lib/types";
import { fmtTs, meetingEndMs, speakerMap } from "./transcript";

// ---------------------------------------------------------------------------
// Per-meeting analysis context
// ---------------------------------------------------------------------------

interface SegInfo {
  seg: TranscriptSegment;
  idx: number;
  terms: string[];
  salience: number;
}

interface Ctx {
  detail: MeetingDetail;
  people: Map<string, Participant>;
  infos: SegInfo[];
  bm25: Bm25<{ terms: string[] }>;
  endMs: number;
}

const FILLER =
  /^(thanks|thank you|great|perfect|cool|nice|sure|yes|yeah|okay|ok|sounds good|got it|awesome|right|morning|hi|hello|hey|bye)\b[\s\S]{0,40}$/i;

const ctxCache = new WeakMap<MeetingDetail, Ctx>();

function context(detail: MeetingDetail): Ctx {
  const cached = ctxCache.get(detail);
  if (cached) return cached;
  const segs = [...detail.segments].sort((a, b) => a.start_ms - b.start_ms);
  const docs = segs.map((s) => ({ terms: terms(s.text) }));
  const bm25 = new Bm25(docs);
  const infos: SegInfo[] = segs.map((seg, idx) => {
    const t = docs[idx].terms;
    const uniq = new Set(t);
    let tfidf = 0;
    for (const u of uniq) tfidf += Math.min(bm25.idf(u), 4);
    const n = words(seg.text).length;
    let salience = tfidf / Math.sqrt(Math.max(4, uniq.size));
    if (n < 7) salience *= 0.35;
    else if (n < 12) salience *= 0.75;
    if (FILLER.test(seg.text.trim())) salience *= 0.3;
    if (/\d|\$|%|percent/.test(seg.text)) salience *= 1.2;
    return { seg, idx, terms: t, salience };
  });
  const ctx: Ctx = { detail: { ...detail, segments: segs }, people: speakerMap(detail.participants), infos, bm25, endMs: meetingEndMs(detail) };
  ctxCache.set(detail, ctx);
  return ctx;
}

const nameOf = (ctx: Ctx, pid: string | null) => (pid && ctx.people.get(pid)?.name) || "Someone";
const firstName = (name: string) => name.split(/\s+/)[0];

function clip(text: string, max = 220): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[,;:\s]+$/, "") + "…";
}

/** The sentence of a segment that best matches `cue` (else the most content-dense one). */
function bestSentence(text: string, cue?: RegExp, boostTerms: string[] = []): string {
  const ss = sentences(text).filter((s) => words(s).length >= 3);
  if (!ss.length) return clip(text);
  const scored = ss.map((s, i) => {
    let score = terms(s).length + (cue && cue.test(s) ? 12 : 0) - i * 0.3;
    const st = terms(s);
    for (const b of boostTerms) if (st.includes(b)) score += 8;
    if (FILLER.test(s)) score -= 8;
    return { s, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return clip(scored[0].s);
}

function segBullet(ctx: Ctx, info: SegInfo, cue?: RegExp, boost: string[] = []): { text: string; start_ms: number } {
  const who = nameOf(ctx, info.seg.participant_id);
  return { text: `${who}: ${bestSentence(info.seg.text, cue, boost)}`, start_ms: info.seg.start_ms };
}

/** Nearest segment at/after `ms` (for citing action items / decisions). */
function segmentAt(ctx: Ctx, ms: number | null): SegInfo | null {
  if (ms == null || !ctx.infos.length) return null;
  let best = ctx.infos[0];
  for (const i of ctx.infos) {
    if (i.seg.start_ms <= ms) best = i;
    else break;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Cue lexicon (heading → text cues)
// ---------------------------------------------------------------------------

const RX = {
  purpose: /\b(goal|agenda|today|purpose|want to (cover|understand|walk|talk|go)|context|kick ?off|the point of|this call|this meeting)\b/i,
  pain: /\b(problem|issue|pain|struggl|frustrat|manual|slow|hard to|difficult|broken|wast|fall(s|ing)? through|miss(ed|ing)?|los(e|ing)|challeng|annoy|painful|headache|nightmare|takes? (us|me) (hours|days|forever)|error|mistake|churn)/i,
  current: /\b(currently|today we|right now|we use|we're using|using|spreadsheet|google doc|excel|notion|manually|process|workflow|tool)\b/i,
  concern: /\b(concern|worr|risk|block|hesita|not sure|skeptic|security|compliance|adoption|the catch|downside|problem is|issue is|what if)/i,
  pricing: /(\$|\bprice|\bpricing|\bcost|\bbudget|\bseats?\b|\bdiscount|\bcontract|\bspend|per (month|year|seat|user)|annual|licen[cs]e|quote)/i,
  authority: /\b(sign[- ]?off|approv|decision[- ]maker|decide|budget owner|own(s)? the budget|cfo|ceo|cto|vp|director|legal|procurement|security team|stakeholder|my boss|leadership|board)/i,
  timeline: /\b(by (monday|tuesday|wednesday|thursday|friday|the end|next|q[1-4]|eod|eow)|deadline|end of (the )?(month|quarter|year|week)|next (week|month|quarter)|q[1-4]\b|launch|go[- ]live|renewal|timeline|kick ?off|start(ing)? (on|next))/i,
  metrics: /(\d+\s?(%|percent|hours?|days?|weeks?|x\b|k\b|m\b)|\$\d|revenue|save|saving|increase|reduce|faster|conversion|retention)/i,
  criteria: /\b(need(s)? to|must|require|important|criteria|integrat|support|has to|non-negotiable|deal[- ]?breaker)/i,
  paper: /\b(legal|security review|procurement|contract|dpa|soc ?2|msa|redline|vendor|questionnaire|gdpr|compliance)/i,
  competition: /\b(competitor|alternative|also (looking|evaluating)|evaluat|compar|versus|\bvs\b|instead|gong|otter|fireflies|chorus|in-house|build it ourselves)/i,
  question: /\?\s*$/,
  completed: /\b(finished|shipped|done|completed|launched|merged|closed|fixed|wrapped up|delivered|released|got .* working|landed)\b/i,
  today: /\b(today|working on|picking up|this week|i'm on|continuing|starting on|next up|focus(ing)? on|in review)\b/i,
  feedback: /\b(feedback|great job|well done|should|could improve|suggest|nice work|proud|impressed|appreciate)\b/i,
  growth: /\b(career|growth|promotion|learn|develop|mentor|lead|stretch|skill|ownership|next level)\b/i,
  status: /\b(on track|at risk|behind|ahead|slipp|status|overall|green|yellow|red|on schedule|delayed)\b/i,
  health: /\b(happy|love|adoption|usage|using it|satisf|renew|value|rolled out|working well|nps|engag)\b/i,
  goals: /\b(goal|want to|hoping|objective|plan(ning)? to|aim|priority|priorities|this year|next quarter|okr)\b/i,
  expansion: /\b(expand|more seats|other teams?|additional|upgrade|roll ?out|add(ing)? (more|another)|enterprise plan|new (team|department|region))\b/i,
  risk: /\b(risk|churn|cancel|unhappy|escalat|frustrat|competitor|budget cut|reconsider|downgrade|not renew)/i,
  strengths: /\b(led|built|designed|scaled|shipped|owned|launched|years|experience|mentored|migrat|architect)/i,
  interviewConcern: /\b(haven't|not much|limited|never|gap|struggle|less experience|not sure|weaker|didn't)\b/i,
  decision: /\b(decided|decision is|let's go with|we'll go with|going with|we agreed|agreed|let's do (that|it)|final answer|we're going to|we will|approved|signed off|settled on|lock(ed)? in)\b/i,
  commit: /\b(i'll|i will|i can|let me|i'm going to|i'm gonna|i'll make sure|i'll have|i will have|i can have|on it|i'll take|i'll own)\b/i,
  positive: /\b(great|love|excited|awesome|amazing|perfect|fantastic|impressive|huge win|really helpful|game[- ]changer|nailed)\b/i,
};

interface SectionPlan {
  kind: "cue" | "purpose" | "topics" | "takeaways" | "next" | "decisions" | "qa" | "open_questions";
  cue?: RegExp;
  max?: number;
  perPerson?: boolean;
  externalOnly?: boolean;
}

function planFor(heading: string, template: SummaryTemplateKey): SectionPlan {
  const h = heading.toLowerCase();
  const perPerson = template === "standup";
  if (/next steps|recommendation/.test(h)) return { kind: "next" };
  if (/decisions made|^decision$/.test(h)) return h === "decision" ? { kind: "cue", cue: RX.authority } : { kind: "decisions" };
  if (/topics discussed/.test(h)) return { kind: "topics" };
  if (/key takeaways/.test(h)) return { kind: "takeaways" };
  if (/meeting purpose/.test(h)) return { kind: "purpose" };
  if (/questions & answers/.test(h)) return { kind: "qa" };
  if (/open questions/.test(h)) return { kind: "open_questions" };
  if (/questions asked by candidate/.test(h)) return { kind: "cue", cue: RX.question, externalOnly: true };
  const table: [RegExp, RegExp][] = [
    [/prospect background|situation|candidate background/, RX.current],
    [/pain|need|challenges/, RX.pain],
    [/current solution/, RX.current],
    [/objections|concerns/, template === "interview" ? RX.interviewConcern : RX.concern],
    [/pricing|budget/, RX.pricing],
    [/authority|economic buyer|decision process|champion/, RX.authority],
    [/timeline|critical event/, RX.timeline],
    [/metrics|impact/, RX.metrics],
    [/decision criteria/, RX.criteria],
    [/paper process/, RX.paper],
    [/competition/, RX.competition],
    [/completed|progress since|updates & wins/, RX.completed],
    [/in progress/, RX.today],
    [/blockers|risks & blockers/, RX.concern],
    [/feedback/, template === "customer_success" ? RX.pain : RX.feedback],
    [/career/, RX.growth],
    [/status overview/, RX.status],
    [/account health/, RX.health],
    [/customer goals/, RX.goals],
    [/expansion/, RX.expansion],
    [/^risks$/, RX.risk],
    [/strengths/, RX.strengths],
  ];
  for (const [hx, cue] of table) if (hx.test(h)) return { kind: "cue", cue, perPerson };
  return { kind: "takeaways" };
}

// ---------------------------------------------------------------------------
// Extractive template summary
// ---------------------------------------------------------------------------

const NOT_COVERED = (heading: string) => `Not covered in this call — no discussion of ${heading.toLowerCase()} was found.`;

export function demoSummary(
  detail: MeetingDetail,
  template: SummaryTemplateKey,
  customInstructions?: string | null,
): SummarySection[] {
  const ctx = context(detail);
  const boost = customInstructions ? terms(customInstructions).filter((t) => t.length > 2) : [];
  const boostScore = (i: SegInfo) => (boost.length ? boost.filter((b) => i.terms.includes(b)).length * 1.5 : 0);
  const used = new Set<number>();
  const external = new Set(detail.participants.filter((p) => p.is_external).map((p) => p.id));

  const pickByCue = (cue: RegExp | undefined, max: number, filter?: (i: SegInfo) => boolean) => {
    const cands = ctx.infos
      .filter((i) => !used.has(i.idx) && (!filter || filter(i)) && (!cue || cue.test(i.seg.text)))
      .map((i) => ({ i, score: i.salience + boostScore(i) + (cue ? 1 : 0) }))
      .filter((c) => c.score > 0.8)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((c) => c.i)
      .sort((a, b) => a.idx - b.idx);
    cands.forEach((c) => used.add(c.idx));
    return cands;
  };

  const sections: SummarySection[] = TEMPLATE_BY_KEY[template].sections.map((heading) => {
    const plan = planFor(heading, template);
    let bullets: { text: string; start_ms: number }[] = [];
    switch (plan.kind) {
      case "purpose": {
        const early = ctx.infos.filter((i) => i.seg.start_ms < Math.max(180_000, ctx.endMs * 0.15));
        const hit = early.find((i) => RX.purpose.test(i.seg.text) && i.terms.length >= 5) ?? early.find((i) => i.terms.length >= 6);
        if (hit) {
          used.add(hit.idx);
          bullets.push(segBullet(ctx, hit, RX.purpose));
        }
        break;
      }
      case "topics": {
        if (detail.chapters.length) {
          bullets = detail.chapters.map((c) => ({ text: c.summary ? `${c.title} — ${c.summary}` : c.title, start_ms: c.start_ms }));
        } else {
          bullets = demoChapters(detail).map((c) => ({ text: `${c.title} — ${c.summary}`, start_ms: c.start_ms }));
        }
        break;
      }
      case "takeaways":
        bullets = pickByCue(undefined, 4).map((i) => segBullet(ctx, i, undefined, boost));
        break;
      case "next": {
        const items = detail.action_items.length ? detail.action_items : demoActionItems(detail);
        bullets = items.slice(0, 8).map((a) => ({
          text: `${a.description}${a.assignee_participant_id ? ` (${nameOf(ctx, a.assignee_participant_id)})` : ""}`,
          start_ms: a.timestamp_ms ?? 0,
        }));
        break;
      }
      case "decisions": {
        const ds = detail.decisions?.length ? detail.decisions : demoDecisions(detail);
        bullets = ds.map((d) => ({ text: d.participant_id ? `${d.text} (${nameOf(ctx, d.participant_id)})` : d.text, start_ms: d.start_ms }));
        break;
      }
      case "qa":
      case "open_questions": {
        const qs = ctx.infos.filter((i) => !used.has(i.idx) && /\?/.test(i.seg.text) && i.terms.length >= 3);
        for (const q of qs) {
          const next = ctx.infos[q.idx + 1];
          const answered = next && next.seg.participant_id !== q.seg.participant_id && next.terms.length >= 4;
          if ((plan.kind === "qa") !== !!answered) continue;
          used.add(q.idx);
          const question = sentences(q.seg.text).filter((s) => s.includes("?")).pop() ?? q.seg.text;
          bullets.push({
            text:
              plan.kind === "qa" && next
                ? `Q (${firstName(nameOf(ctx, q.seg.participant_id))}): ${clip(question, 160)} — A (${firstName(nameOf(ctx, next.seg.participant_id))}): ${bestSentence(next.seg.text)}`
                : `${nameOf(ctx, q.seg.participant_id)}: ${clip(question, 180)}`,
            start_ms: q.seg.start_ms,
          });
          if (bullets.length >= 6) break;
        }
        if (!bullets.length && plan.kind === "open_questions") bullets.push({ text: "No open questions — everything raised was answered.", start_ms: 0 });
        break;
      }
      case "cue": {
        const filter = plan.externalOnly ? (i: SegInfo) => !!i.seg.participant_id && external.has(i.seg.participant_id) : undefined;
        const picked = pickByCue(plan.cue, plan.perPerson ? 6 : 3, filter);
        if (plan.perPerson) {
          // one bullet per person where possible
          const seen = new Set<string | null>();
          bullets = picked
            .filter((i) => (seen.has(i.seg.participant_id) ? false : (seen.add(i.seg.participant_id), true)))
            .map((i) => ({ text: `${firstName(nameOf(ctx, i.seg.participant_id))}: ${bestSentence(i.seg.text, plan.cue)}`, start_ms: i.seg.start_ms }));
        } else {
          bullets = picked.map((i) => segBullet(ctx, i, plan.cue, boost));
        }
        break;
      }
    }
    if (!bullets.length) bullets.push({ text: NOT_COVERED(heading), start_ms: 0 });
    return { heading, bullets };
  });

  if (boost.length) {
    const focus = ctx.infos
      .filter((i) => boostScore(i) > 0)
      .sort((a, b) => boostScore(b) + b.salience - (boostScore(a) + a.salience))
      .slice(0, 4)
      .sort((a, b) => a.idx - b.idx)
      .map((i) => segBullet(ctx, i, undefined, boost));
    if (focus.length) sections.unshift({ heading: "Focus: your instructions", bullets: focus });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Ask (retrieval + composed answer with [n] citations)
// ---------------------------------------------------------------------------

export interface DemoAnswer {
  text: string;
  citations: Citation[];
}

function cite(list: Citation[], seg: TranscriptSegment): string {
  const existing = list.find((c) => c.segment_id === seg.id);
  if (existing) return `[${existing.index}]`;
  const index = list.length + 1;
  list.push({ index, segment_id: seg.id, meeting_id: seg.meeting_id, start_ms: seg.start_ms, quote: clip(seg.text, 160) });
  return `[${index}]`;
}

function personInQuestion(q: string, participants: Participant[]): Participant | null {
  const lq = q.toLowerCase();
  for (const p of participants) {
    const full = p.name.toLowerCase();
    const first = full.split(/\s+/)[0];
    if (lq.includes(full) || new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lq)) return p;
  }
  return null;
}

export function demoAsk(detail: MeetingDetail, question: string): DemoAnswer {
  const ctx = context(detail);
  const q = question.toLowerCase();
  const citations: Citation[] = [];
  const person = personInQuestion(question, detail.participants);

  // Intent: commitments of a person
  if (person && /\b(commit|promis|agree|own|take on|responsible|to do|todo|action|will do|signed up)/.test(q)) {
    const cs = demoCommitments(detail, person.id);
    if (!cs.length) return { text: `I couldn't find any explicit commitments from **${person.name}** in this meeting.`, citations };
    const lines = cs.slice(0, 6).map((c) => {
      const s = segmentAt(ctx, c.start_ms);
      const due = c.due && !c.text.toLowerCase().includes(c.due.toLowerCase()) ? ` (${c.due})` : "";
      return `- ${c.text}${due} ${s ? cite(citations, s.seg) : ""}`.trimEnd();
    });
    return { text: `**${person.name}** committed to:\n\n${lines.join("\n")}`, citations };
  }

  // Intent: action items / next steps
  if (/\b(action items?|next steps?|to-?dos?|follow[- ]?ups?|tasks?|who is doing|who's doing|owners?)\b/.test(q)) {
    const items = (detail.action_items.length ? detail.action_items : demoActionItems(detail)).filter(
      (a) => !person || a.assignee_participant_id === person.id,
    );
    if (items.length) {
      const lines = items.slice(0, 8).map((a) => {
        const s = segmentAt(ctx, a.timestamp_ms);
        const owner = a.assignee_participant_id ? `**${nameOf(ctx, a.assignee_participant_id)}**: ` : "";
        return `- ${owner}${a.description} ${s ? cite(citations, s.seg) : ""}`.trimEnd();
      });
      return { text: `Here are the next steps from this meeting:\n\n${lines.join("\n")}`, citations };
    }
  }

  // Intent: decisions
  if (/\b(decid|decision|agree|conclu|settle|land(ed)? on|choose|chose)/.test(q)) {
    const ds = detail.decisions?.length ? detail.decisions : demoDecisions(detail);
    if (ds.length) {
      const lines = ds.slice(0, 6).map((d) => {
        const s = segmentAt(ctx, d.start_ms);
        return `- ${d.text}${d.participant_id ? ` — ${nameOf(ctx, d.participant_id)}` : ""} ${s ? cite(citations, s.seg) : ""}`.trimEnd();
      });
      return { text: `The group made ${ds.length === 1 ? "one decision" : `${ds.length} decisions`}:\n\n${lines.join("\n")}`, citations };
    }
  }

  // Intent: overview
  if (/\b(summar\w*|recap|tl;?dr|overview|what (was|is) (this|the) (meeting|call) about|what happened|key points|main points|highlights)\b/.test(q)) {
    const chapters = detail.chapters.length ? detail.chapters : demoChapters(detail);
    const lines = chapters.slice(0, 7).map((c) => {
      const s = segmentAt(ctx, c.start_ms);
      return `- **${c.title}** — ${c.summary ?? ""} ${s ? cite(citations, s.seg) : ""}`.replace(/\s+—\s+(\[|$)/, " $1").trimEnd();
    });
    return { text: `**${detail.meeting.title}** covered:\n\n${lines.join("\n")}`, citations };
  }

  // Retrieval
  const topicWords = words(question).filter(
    (w) => !STOP_Q.has(w) && !(person && person.name.toLowerCase().split(/\s+/).includes(w)) && w.length > 2,
  );
  const queryTerms = expand(terms(topicWords.join(" ")));
  const genericAsk = /\b(say|said|think|thought|mention|talk|feel|opinion|view|position|take)\b/.test(q);
  let hits: SegInfo[] = [];
  if (queryTerms.length) {
    const scored = ctx.infos
      .map((i) => {
        let s = ctx.bm25.score(i.idx, queryTerms);
        // neighbour context helps short answers ("Yes, next Monday")
        const prev = ctx.infos[i.idx - 1];
        if (prev) s += 0.3 * ctx.bm25.score(prev.idx, queryTerms);
        if (person && i.seg.participant_id !== person.id) s *= 0.35;
        return { i, s: s * (0.6 + Math.min(i.salience, 3) / 5) };
      })
      .filter((x) => x.s > 0.5)
      .sort((a, b) => b.s - a.s);
    const top = scored[0]?.s ?? 0;
    hits = scored.filter((x) => x.s >= top * 0.3).slice(0, 4).map((x) => x.i);
    // A question on its own isn't an answer: pull in the reply that follows it.
    for (const h of [...hits]) {
      const next = ctx.infos[h.idx + 1];
      if (/\?\s*$/.test(h.seg.text) && next && next.seg.participant_id !== h.seg.participant_id && !hits.includes(next)) hits.push(next);
    }
    hits = hits.slice(0, 5);
  }
  if (!hits.length && person && genericAsk) {
    hits = ctx.infos
      .filter((i) => i.seg.participant_id === person.id)
      .sort((a, b) => b.salience - a.salience)
      .slice(0, 4);
  }
  hits.sort((a, b) => a.idx - b.idx);

  if (!hits.length) {
    const chapters = (detail.chapters.length ? detail.chapters : demoChapters(detail)).slice(0, 5).map((c) => c.title);
    return {
      text:
        `I couldn't find anything about ${topicWords.length ? `**${topicWords.slice(0, 4).join(" ")}**` : "that"} in this meeting.` +
        (chapters.length ? ` The call covered **${chapters.join("**, **")}** — try asking about one of those, or about action items and decisions.` : ""),
      citations,
    };
  }

  const topic = topicWords.length ? `**${topicWords.slice(0, 4).join(" ")}**` : "that";
  const intro = person
    ? `Here's what **${person.name}** said${topicWords.length ? ` about ${topic}` : ""}:`
    : `Here's what came up about ${topic}:`;
  const lines = hits.map((i) => {
    const who = nameOf(ctx, i.seg.participant_id);
    return `- **${who}** (${fmtTs(i.seg.start_ms)}): ${bestSentence(i.seg.text, undefined, queryTerms)} ${cite(citations, i.seg)}`;
  });
  return { text: `${intro}\n\n${lines.join("\n")}`, citations };
}

/** Question words that aren't the topic ("what did they say about pricing" → "pricing"). */
const STOP_Q = new Set(
  "what who whom whose when where why how did does do was were is are the a an about say said says tell me us talk talked talking discuss discussed mention mentioned think thought feel felt anything something any there their they them this that call meeting on of in for to and or with regarding re any".split(
    " ",
  ),
);

/** Tiny synonym expansion so demo retrieval finds "$19 per seat" for "pricing". */
const SYNONYMS: Record<string, string[]> = {
  pric: ["cost", "dollar", "seat", "budget", "discount", "plan"],
  cost: ["pric", "dollar", "budget", "spend"],
  budget: ["pric", "cost", "dollar", "spend"],
  security: ["soc", "dpa", "complianc", "retention", "privacy"],
  timelin: ["date", "deadline", "week", "month", "quarter", "monday", "friday"],
  deadlin: ["date", "week", "month", "friday", "monday"],
  risk: ["concern", "worri", "block"],
  concern: ["worri", "risk", "hesitat"],
  blocker: ["block", "stuck", "wait"],
  competitor: ["competit", "alternativ", "vendor"],
  hir: ["candidat", "interview", "role", "offer"],
};

function expand(ts: string[]): string[] {
  const out = new Set(ts);
  for (const t of ts) for (const syn of SYNONYMS[t] ?? []) out.add(syn);
  return [...out];
}

/** Cross-meeting Ask: retrieve across meetings, group by meeting. */
export function demoAskAcross(details: MeetingDetail[], question: string): DemoAnswer {
  const citations: Citation[] = [];
  const queryTerms = terms(question);
  if (!queryTerms.length) return { text: "Ask me about something discussed in your meetings — a topic, a customer, or a person.", citations };
  const all = details.flatMap((d) => context(d).infos.map((i) => ({ d, i, ctx: context(d) })));
  const bm = new Bm25(all.map((x) => ({ terms: x.i.terms })));
  const scored = all
    .map((x, k) => ({ ...x, s: bm.score(k, queryTerms) * (0.6 + Math.min(x.i.salience, 3) / 5) }))
    .filter((x) => x.s > 0.5)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
  if (!scored.length) return { text: "I couldn't find that in any of your meetings. Try different keywords, or search for an exact phrase.", citations };
  const byMeeting = new Map<string, typeof scored>();
  for (const x of scored) byMeeting.set(x.d.meeting.id, [...(byMeeting.get(x.d.meeting.id) ?? []), x]);
  const blocks = [...byMeeting.values()].map((xs) => {
    const d = xs[0].d;
    const lines = xs
      .sort((a, b) => a.i.idx - b.i.idx)
      .map((x) => `- **${nameOf(x.ctx, x.i.seg.participant_id)}** (${fmtTs(x.i.seg.start_ms)}): ${bestSentence(x.i.seg.text, undefined, queryTerms)} ${cite(citations, x.i.seg)}`);
    return `**${d.meeting.title}**\n${lines.join("\n")}`;
  });
  return { text: `Here's what I found across your meetings:\n\n${blocks.join("\n\n")}`, citations };
}

// ---------------------------------------------------------------------------
// Catch me up
// ---------------------------------------------------------------------------

export function demoCatchUp(detail: MeetingDetail, fromMs: number, toMs: number): CatchUpBullet[] {
  const ctx = context(detail);
  const inRange = (ms: number) => ms >= fromMs && ms < toMs;
  const segsIn = ctx.infos.filter((i) => i.seg.end_ms > fromMs && i.seg.start_ms < toMs);
  if (!segsIn.length) return [];
  const firstStart = segsIn[0].seg.start_ms;
  const out: CatchUpBullet[] = [];
  const used = new Set<number>();

  const chapters = (detail.chapters.length ? detail.chapters : demoChapters(detail)).filter((c) => c.end_ms > fromMs && c.start_ms < toMs);
  for (const c of chapters) {
    const start = Math.max(c.start_ms, firstStart);
    out.push({ text: c.summary ? `${c.title}: ${c.summary}` : c.title, start_ms: start });
    const lo = Math.max(c.start_ms, fromMs);
    const hi = Math.min(c.end_ms, toMs);
    const key = segsIn
      .filter((i) => i.seg.start_ms >= lo && i.seg.start_ms < hi && !used.has(i.idx) && i.salience > 0.8)
      .sort((a, b) => b.salience - a.salience)
      .slice(0, chapters.length > 3 ? 1 : 2);
    for (const k of key) {
      used.add(k.idx);
      out.push(segBullet(ctx, k));
    }
  }
  if (!chapters.length) {
    for (const k of [...segsIn].sort((a, b) => b.salience - a.salience).slice(0, 5)) out.push(segBullet(ctx, k));
  }
  for (const d of detail.decisions ?? []) if (inRange(d.start_ms)) out.push({ text: `Decision: ${d.text}`, start_ms: d.start_ms });
  for (const a of detail.action_items) {
    if (a.timestamp_ms != null && inRange(a.timestamp_ms)) {
      const who = a.assignee_participant_id ? `${nameOf(ctx, a.assignee_participant_id)} — ` : "";
      out.push({ text: `Action item: ${who}${a.description}`, start_ms: a.timestamp_ms });
    }
  }
  return out.sort((a, b) => a.start_ms - b.start_ms).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Follow-up email
// ---------------------------------------------------------------------------

export function demoFollowUpEmail(
  detail: MeetingDetail,
  tone: "friendly" | "formal" | "concise",
  recipientId?: string | null,
): FollowUpEmail {
  const ctx = context(detail);
  const m = detail.meeting;
  const sender = m.recorded_by ?? detail.participants.find((p) => !p.is_external)?.name ?? "Me";
  const recipient = recipientId ? detail.participants.find((p) => p.id === recipientId) : null;
  const externals = detail.participants.filter((p) => p.is_external);
  const greetNames = recipient ? [recipient] : externals.length && externals.length <= 3 ? externals : [];
  const greeting = greetNames.length
    ? `${tone === "formal" ? "Dear" : "Hi"} ${greetNames.map((p) => firstName(p.name)).join(" and ")},`
    : tone === "formal"
      ? "Dear all,"
      : "Hi all,";

  // Recap bullets: prefer a cached summary, take its non-"next steps" bullets.
  const summary = detail.summaries.find((s) => s.language === "en" && !s.custom_instructions) ?? detail.summaries[0];
  let recap = (summary?.sections ?? [])
    .filter((s) => !/next steps|recommendation/i.test(s.heading))
    .flatMap((s) => s.bullets.map((b) => b.text))
    .filter((t) => !/^not covered/i.test(t));
  if (!recap.length) recap = demoSummary(detail, "general").flatMap((s) => (/next steps/i.test(s.heading) ? [] : s.bullets.map((b) => b.text)));
  recap = recap.slice(0, tone === "concise" ? 3 : 5);

  const items = detail.action_items.length ? detail.action_items : demoActionItems(detail);
  const steps = items.slice(0, 8).map((a) => `- ${a.assignee_participant_id ? `**${nameOf(ctx, a.assignee_participant_id)}**: ` : ""}${a.description}`);

  const opener =
    tone === "formal"
      ? `Thank you for your time today. Please find below a summary of our discussion in "${m.title}".`
      : tone === "concise"
        ? `Quick recap of "${m.title}":`
        : `Thanks for the great conversation today! Here's a quick recap of "${m.title}" so we're all on the same page.`;
  const closing =
    tone === "formal"
      ? "Please let me know if I have missed anything.\n\nKind regards,"
      : tone === "concise"
        ? "Shout if I missed anything."
        : "Let me know if I missed anything — looking forward to the next steps!\n\nBest,";

  const body = [
    greeting,
    "",
    opener,
    "",
    "**Key points**",
    ...recap.map((r) => `- ${r}`),
    ...(steps.length ? ["", "**Next steps**", ...steps] : []),
    "",
    closing,
    firstName(sender),
  ].join("\n");

  const subjectPrefix = tone === "formal" ? "Summary and next steps" : tone === "concise" ? "Recap" : "Recap & next steps";
  return { subject: `${subjectPrefix}: ${m.title}`.slice(0, 120), body_markdown: body };
}

// ---------------------------------------------------------------------------
// Decisions, commitments, action items
// ---------------------------------------------------------------------------

export function demoDecisions(detail: MeetingDetail): Decision[] {
  const ctx = context(detail);
  const out: Decision[] = [];
  for (const i of ctx.infos) {
    if (!RX.decision.test(i.seg.text) || i.terms.length < 4) continue;
    const s = sentences(i.seg.text).find((x) => RX.decision.test(x)) ?? i.seg.text;
    out.push({ text: clip(s.replace(/^(so|okay|ok|alright|great|yeah|yes),?\s+/i, ""), 200), start_ms: i.seg.start_ms, participant_id: i.seg.participant_id });
  }
  return out.slice(0, 8);
}

const DUE_RX =
  /\b(by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|eod|eow|end of (?:the )?(?:day|week|month|quarter)|next \w+|the \w+ of \w+|\w+ \d{1,2}(?:st|nd|rd|th)?)|tomorrow|today|this afternoon|tonight|next (?:week|monday|tuesday|wednesday|thursday|friday|month|quarter)|end of (?:the )?(?:day|week|month|quarter)|this week|before (?:the )?\w+)\b/i;

/** "I'll send the deck" → "Send the deck". */
function toTask(sentence: string): string | null {
  const m = sentence.match(/\b(?:i'll|i will|i can|let me|i'm going to|i'm gonna|i'll make sure(?: to| that)?|i'll have|i will have|i can have)\s+(.+)/i);
  if (!m) return null;
  let task = m[1].replace(/[.!?]+$/, "").trim();
  task = task.replace(/^(also|just|definitely|probably|go ahead and|quickly)\s+/i, "");
  if (words(task).length < 2) return null;
  if (/^(be|do that|do it|check|think|try)\b\s*$/i.test(task)) return null;
  return clip(task.charAt(0).toUpperCase() + task.slice(1), 160);
}

export function demoCommitments(detail: MeetingDetail, participantId: string): Commitment[] {
  const ctx = context(detail);
  const out: Commitment[] = [];
  for (const a of detail.action_items) {
    if (a.assignee_participant_id !== participantId) continue;
    const due = a.description.match(DUE_RX)?.[0] ?? null;
    out.push({ text: a.description, start_ms: a.timestamp_ms ?? 0, participant_id: participantId, due });
  }
  for (const i of ctx.infos) {
    if (i.seg.participant_id !== participantId || !RX.commit.test(i.seg.text)) continue;
    if (out.some((c) => Math.abs(c.start_ms - i.seg.start_ms) < 20_000)) continue;
    for (const s of sentences(i.seg.text)) {
      const task = toTask(s);
      if (!task) continue;
      out.push({ text: task, start_ms: i.seg.start_ms, participant_id: participantId, due: s.match(DUE_RX)?.[0] ?? null });
      break;
    }
  }
  return out.sort((a, b) => a.start_ms - b.start_ms);
}

export function demoActionItems(
  detail: MeetingDetail,
): { description: string; assignee_participant_id: string | null; timestamp_ms: number | null; completed: boolean; user_generated: boolean }[] {
  const ctx = context(detail);
  const out: { description: string; assignee_participant_id: string | null; timestamp_ms: number | null; completed: boolean; user_generated: boolean }[] = [];
  for (const i of ctx.infos) {
    if (!RX.commit.test(i.seg.text)) continue;
    for (const s of sentences(i.seg.text)) {
      const task = toTask(s);
      if (!task || /\b(i think|i guess|i mean)\b/i.test(s)) continue;
      out.push({ description: task, assignee_participant_id: i.seg.participant_id, timestamp_ms: i.seg.start_ms, completed: false, user_generated: false });
      break;
    }
    if (out.length >= 12) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pipeline fallbacks: chapters, highlights, meeting type
// ---------------------------------------------------------------------------

function titleCase(w: string) {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function demoChapters(detail: MeetingDetail): { title: string; start_ms: number; end_ms: number; summary: string }[] {
  const ctx = context(detail);
  if (!ctx.infos.length) return [];
  const end = ctx.endMs;
  const target = Math.min(8, Math.max(3, Math.round(end / (6 * 60_000))));
  const span = end / target;
  const bounds: number[] = [0];
  for (let k = 1; k < target; k++) {
    const want = k * span;
    // cut at the segment start closest to the ideal boundary, preferring speaker changes
    let best = ctx.infos[0];
    let bestD = Infinity;
    for (const i of ctx.infos) {
      const prev = ctx.infos[i.idx - 1];
      const d = Math.abs(i.seg.start_ms - want) - (prev && prev.seg.participant_id !== i.seg.participant_id ? 5000 : 0);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best.seg.start_ms > bounds[bounds.length - 1] + 30_000) bounds.push(best.seg.start_ms);
  }
  const chapters = bounds.map((start, k) => {
    const stop = bounds[k + 1] ?? end;
    const infos = ctx.infos.filter((i) => i.seg.start_ms >= start && i.seg.start_ms < stop);
    // Title from the most distinctive surface words in the window
    const counts = new Map<string, { n: number; surface: string }>();
    for (const i of infos) {
      for (const w of words(i.seg.text)) {
        const t = terms(w)[0];
        if (!t || t.length < 4) continue;
        const e = counts.get(t) ?? { n: 0, surface: w };
        e.n++;
        counts.set(t, e);
      }
    }
    const top = [...counts.entries()]
      .map(([t, e]) => ({ surface: e.surface.replace(/'s$/, ""), score: e.n * Math.min(ctx.bm25.idf(t), 3) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((x) => titleCase(x.surface));
    const title = k === 0 && start === 0 && !top.length ? "Introductions" : top.length ? top.join(" & ") : `Part ${k + 1}`;
    const best = [...infos].sort((a, b) => b.salience - a.salience)[0];
    const summary = best ? `${nameOf(ctx, best.seg.participant_id)}: ${bestSentence(best.seg.text)}` : "";
    return { title, start_ms: start, end_ms: stop, summary };
  });
  return chapters;
}

export function demoHighlights(detail: MeetingDetail): { type: HighlightType; title: string; start_ms: number; end_ms: number }[] {
  const ctx = context(detail);
  const pick: [HighlightType, RegExp, number][] = [
    ["pain_point", RX.pain, 2],
    ["decision", RX.decision, 2],
    ["question", /\?/, 2],
    ["action_item", RX.commit, 1],
    ["positive", RX.positive, 1],
  ];
  const used = new Set<number>();
  const out: { type: HighlightType; title: string; start_ms: number; end_ms: number }[] = [];
  for (const [type, rx, n] of pick) {
    const cands = ctx.infos
      .filter((i) => !used.has(i.idx) && rx.test(i.seg.text) && i.terms.length >= 5)
      .sort((a, b) => b.salience - a.salience)
      .slice(0, n);
    for (const c of cands) {
      used.add(c.idx);
      const s = bestSentence(c.seg.text, rx);
      const ws = s.split(/\s+/);
      const title = ws.length > 9 ? `${ws.slice(0, 9).join(" ").replace(/[,;:]$/, "")}…` : s;
      const endSeg = ctx.infos[c.idx + 1] && ctx.infos[c.idx + 1].seg.end_ms - c.seg.start_ms < 45_000 ? ctx.infos[c.idx + 1] : c;
      out.push({ type, title, start_ms: c.seg.start_ms, end_ms: endSeg.seg.end_ms });
    }
  }
  return out.sort((a, b) => a.start_ms - b.start_ms);
}

export function demoMeetingType(detail: MeetingDetail): MeetingType {
  const text = detail.segments.map((s) => s.text).join(" ").toLowerCase();
  const n = detail.participants.length;
  const hasExternal = detail.participants.some((p) => p.is_external);
  const score = (rx: RegExp) => (text.match(rx) ?? []).length;
  const scores: [MeetingType, number][] = [
    ["interview", score(/\b(interview|candidate|resume|your experience|tell me about a time|role|hiring|offer)\b/g) * 2],
    ["standup", score(/\b(yesterday|today i|blocker|blocked|stand-?up|in review|picking up)\b/g) * 2 + (n >= 3 ? 1 : 0)],
    ["sales", score(/\b(pricing|budget|demo|pilot|contract|seats?|procurement|trial|discount|proposal)\b/g) + (hasExternal ? 2 : 0)],
    ["customer_success", score(/\b(renewal|adoption|qbr|onboarding|support ticket|churn|health|usage|expansion)\b/g) * 1.5 + (hasExternal ? 1 : 0)],
    ["one_on_one", (n === 2 && !hasExternal ? 4 : 0) + score(/\b(career|feedback|growth|promotion|how are you feeling)\b/g) * 2],
    ["planning", score(/\b(roadmap|q[1-4]|priorit|planning|scope|okr|headcount|milestone)\b/g) * 1.5],
    ["project_update", score(/\b(status|on track|at risk|milestone|progress|update|shipped)\b/g)],
    ["qa", score(/\?/g) > detail.segments.length * 0.4 ? 6 : 0],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] >= 3 ? scores[0][0] : "general";
}

/** Word-by-word chunks for simulated streaming. */
export function chunkForStreaming(text: string): string[] {
  const parts = text.split(/(\s+)/);
  const out: string[] = [];
  for (let k = 0; k < parts.length; k += 4) out.push(parts.slice(k, k + 4).join(""));
  return out.filter(Boolean);
}
