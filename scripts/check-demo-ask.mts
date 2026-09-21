/**
 * Regression check for the keyless demo-mode Ask (src/lib/ai/demo.ts): runs real questions against the seed
 * meetings and asserts that every citation lands on a relevant transcript segment.
 *
 *   node --experimental-transform-types scripts/check-demo-ask.mts        (Node >= 22.15; exits 1 on failure)
 *
 * `--experimental-transform-types` (not just strip-types) because src/lib/search/text.ts uses TS parameter
 * properties. The resolve hook below maps the `@/` alias to src/ and adds the `.ts` extension.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as nodeModule from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Citation, MeetingDetail, SeedMeetingFile } from "../src/lib/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// `module.registerHooks` (Node >= 22.15) postdates the pinned @types/node, so type the bit we use.
type ResolveContext = { parentURL?: string };
type NextResolve = (specifier: string, context: ResolveContext) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks(hooks: { resolve(specifier: string, context: ResolveContext, nextResolve: NextResolve): unknown }): void;
};

registerHooks({
  resolve(specifier: string, context: ResolveContext, nextResolve: NextResolve) {
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

type DemoModule = typeof import("../src/lib/ai/demo");
const demoUrl = pathToFileURL(join(ROOT, "src/lib/ai/demo.ts")).href;
const { demoAsk, demoAskAcross } = (await import(demoUrl)) as DemoModule;

const dir = join(ROOT, "src/data/seed/meetings");
const details = new Map<string, MeetingDetail>();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const file = JSON.parse(readFileSync(join(dir, f), "utf8")) as SeedMeetingFile;
  details.set(file.meeting.id, { ...file, decisions: file.decisions ?? undefined } as MeetingDetail);
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

interface Case {
  name: string;
  /** Meeting id for a per-meeting Ask; omit for the cross-meeting Ask. */
  meeting?: string;
  question: string;
  /** Every cited segment must match this. */
  relevant: RegExp;
  /** At least one cited segment must match each of these. */
  mustCite: RegExp[];
  /** The answer text must not match this. */
  notInText?: RegExp;
  /** Answer text must match each of these. */
  inText?: RegExp[];
  minCitations?: number;
  /** Cross-meeting: cited meetings must include each of these ids. */
  meetings?: string[];
}

const Q4 = "m_q4-roadmap-planning";

// Questions from WALKTHROUGH.md ("Ask tab") are included verbatim; the rest are realistic judge questions.
const walkthroughAsks = [...readFileSync(join(ROOT, "WALKTHROUGH.md"), "utf8").matchAll(/Ask[^*\n]*\*"([^"]+)"\*/g)].map((m) => m[1]);

const cases: Case[] = [
  {
    name: "SSO GA + owner (reviewer repro)",
    meeting: Q4,
    question: "When does SSO go GA and who owns it?",
    relevant: /\bSSO\b.*(\bGA\b|generally available|November 2nd)|(\bGA\b|generally available|November 2nd).*\bSSO\b/i,
    mustCite: [/generally available on November 2nd/i, /SSO GA November 2nd/i],
    notInText: /\bowns\*\*|about \*\*[^*]*owns/i,
    inText: [/Priya Raman/],
  },
  {
    name: "Pricing decision (Q4)",
    meeting: Q4,
    question: "What did we decide on pricing?",
    relevant: /pric|\$|grandfather|growth plan|per month/i,
    mustCite: [/\$?599|Growth pricing|grandfather/i],
  },
  {
    name: "Pricing decision (pricing page planning)",
    meeting: "m_pricing-page-planning",
    question: "What was the pricing decision?",
    relevant: /pric|\$|plan|tier|seat|annual|discount/i,
    mustCite: [/pric|\$/i],
  },
  {
    name: "What did Arjun commit to",
    meeting: Q4,
    question: "What did Arjun commit to?",
    relevant: /./,
    mustCite: [/kafka|ingestion|design doc/i, /globex|rollup|one-pager/i],
    inText: [/Arjun Mehta/],
    minCitations: 2,
  },
  {
    name: "Hiring plan",
    meeting: Q4,
    question: "What's the hiring plan?",
    relevant: /hir|headcount|req\b|offer|candidate|engineer|CSM|contractor|recruit/i,
    mustCite: [/staff engineer|CSM|ML engineer|hire|offer/i],
  },
  {
    name: "Globex renewal risk (cross-meeting)",
    question: "What's the risk on the Globex renewal?",
    relevant: /globex|renew|churn|amplitude|risk|contract|greg/i,
    mustCite: [/globex|renew/i],
    meetings: ["m_globex-qbr"],
    minCitations: 2,
  },
  {
    name: "SCIM date (cross-meeting)",
    question: "When is SCIM shipping?",
    relevant: /SCIM/i,
    mustCite: [/SCIM.*November|November.*SCIM/i],
  },
  {
    name: "Person + topic",
    meeting: Q4,
    question: "What did James say about SSO?",
    relevant: /SSO/,
    mustCite: [/security (review|questionnaire)|hard requirement/i],
    inText: [/James Whitaker/],
  },
  {
    name: "Customer concerns (Globex QBR)",
    meeting: "m_globex-qbr",
    question: "What are Greg's concerns about the renewal?",
    relevant: /renew|concern|contract|amplitude|slow|dashboard|perform|budget|price|cost|paying|evaluat/i,
    mustCite: [/renew/i],
  },
  {
    name: "Owner of the pricing spec",
    meeting: Q4,
    question: "Who owns the pricing spec?",
    relevant: /pric|spec|grandfather/i,
    mustCite: [/pricing spec/i],
    inText: [/Sofia Alvarez/],
  },
];

if (!walkthroughAsks.length) throw new Error("No Ask questions found in WALKTHROUGH.md — update the pattern above.");
console.log(`WALKTHROUGH.md Ask questions: ${walkthroughAsks.map((q) => JSON.stringify(q)).join(", ")}\n`);
for (const q of walkthroughAsks) {
  if (!cases.some((c) => c.question === q))
    cases.push({ name: `WALKTHROUGH: ${q}`, meeting: Q4, question: q, relevant: /./, mustCite: [/./] });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const segText = new Map<string, string>();
for (const d of details.values()) for (const s of d.segments) segText.set(s.id, s.text);

let failed = 0;
for (const c of cases) {
  const errors: string[] = [];
  let text = "";
  let citations: Citation[] = [];
  if (c.meeting) {
    const d = details.get(c.meeting);
    if (!d) errors.push(`meeting ${c.meeting} not in seed`);
    else ({ text, citations } = demoAsk(d, c.question));
  } else {
    ({ text, citations } = demoAskAcross([...details.values()], c.question));
  }
  const cited = citations.map((x) => ({ ...x, full: segText.get(x.segment_id) ?? "" }));
  if (cited.length < (c.minCitations ?? 1)) errors.push(`expected >= ${c.minCitations ?? 1} citations, got ${cited.length}`);
  for (const x of cited) if (!c.relevant.test(x.full)) errors.push(`irrelevant citation [${x.index}] ${x.full.slice(0, 90)}`);
  for (const rx of c.mustCite) if (!cited.some((x) => rx.test(x.full))) errors.push(`no citation matches ${rx}`);
  if (c.notInText?.test(text)) errors.push(`answer text matches ${c.notInText}`);
  for (const rx of c.inText ?? []) if (!rx.test(text)) errors.push(`answer text lacks ${rx}`);
  for (const m of c.meetings ?? []) if (!cited.some((x) => x.meeting_id === m)) errors.push(`no citation from ${m}`);
  for (const x of cited) if (!text.includes(`[${x.index}]`)) errors.push(`citation [${x.index}] not referenced in text`);

  const ok = errors.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  (${cited.length} citations)`);
  if (!ok || process.argv.includes("--verbose")) {
    console.log(text.replace(/^/gm, "      "));
    for (const e of errors) console.log(`    ! ${e}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
