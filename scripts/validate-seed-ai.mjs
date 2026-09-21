#!/usr/bin/env node
// Validates seed-src/ai/<slug>.json against seed-src/meetings/<slug>.json and the summary templates.
//   node scripts/validate-seed-ai.mjs [slug...]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Parse template section headings out of src/lib/templates.ts (keeps one source of truth).
export function loadTemplates() {
  const src = readFileSync(join(ROOT, "src/lib/templates.ts"), "utf8");
  const out = {};
  const re = /key:\s*"([a-z_]+)"[\s\S]*?sections:\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = re.exec(src))) out[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return out;
}

const HL_TYPES = ["positive", "pain_point", "question", "action_item", "decision"];

export function validate(slug) {
  const errs = [];
  const meeting = JSON.parse(readFileSync(join(ROOT, "seed-src/meetings", `${slug}.json`), "utf8"));
  const aiPath = join(ROOT, "seed-src/ai", `${slug}.json`);
  if (!existsSync(aiPath)) return [`${slug}: missing ai file`];
  const ai = JSON.parse(readFileSync(aiPath, "utf8"));
  const n = meeting.lines.length;
  const keys = new Set(meeting.participants.map((p) => p.key));
  const T = loadTemplates();
  const line = (v, where) => {
    if (!Number.isInteger(v) || v < 0 || v >= n) errs.push(`${where}: bad line ${v} (0..${n - 1})`);
  };
  if (!ai.summaries?.length) errs.push("no summaries");
  const seen = new Set();
  for (const s of ai.summaries ?? []) {
    const exp = T[s.template];
    if (!exp) { errs.push(`unknown template ${s.template}`); continue; }
    if (seen.has(s.template)) errs.push(`duplicate template ${s.template}`);
    seen.add(s.template);
    const got = s.sections.map((x) => x.heading);
    if (JSON.stringify(got) !== JSON.stringify(exp)) errs.push(`${s.template}: headings ${JSON.stringify(got)} != ${JSON.stringify(exp)}`);
    s.sections.forEach((sec) => {
      if (!sec.bullets?.length) errs.push(`${s.template}/${sec.heading}: no bullets`);
      sec.bullets?.forEach((b, i) => { if (!b.text) errs.push(`${s.template}/${sec.heading}#${i}: empty`); line(b.line, `${s.template}/${sec.heading}#${i}`); });
    });
  }
  if (!seen.has("general")) errs.push("missing general summary");
  for (const [i, a] of (ai.action_items ?? []).entries()) {
    if (!a.description) errs.push(`action ${i}: no description`);
    if (a.assignee != null && !keys.has(a.assignee)) errs.push(`action ${i}: unknown assignee ${a.assignee}`);
    line(a.line, `action ${i}`);
  }
  let prevEnd = -1;
  for (const [i, c] of (ai.chapters ?? []).entries()) {
    line(c.start_line, `chapter ${i}`); line(c.end_line, `chapter ${i}`);
    if (c.start_line !== prevEnd + 1) errs.push(`chapter ${i}: must start at line ${prevEnd + 1}`);
    if (c.end_line < c.start_line) errs.push(`chapter ${i}: end < start`);
    prevEnd = c.end_line;
  }
  if (ai.chapters?.length && prevEnd !== n - 1) errs.push(`chapters must end at last line ${n - 1}`);
  if (!ai.chapters?.length) errs.push("no chapters");
  for (const [i, h] of (ai.highlights ?? []).entries()) {
    if (!HL_TYPES.includes(h.type)) errs.push(`highlight ${i}: bad type ${h.type}`);
    if (!h.title) errs.push(`highlight ${i}: no title`);
    line(h.start_line, `highlight ${i}`); line(h.end_line, `highlight ${i}`);
    if (h.end_line < h.start_line) errs.push(`highlight ${i}: end < start`);
  }
  if ((ai.highlights ?? []).length < 4) errs.push("need >= 4 highlights");
  for (const [i, d] of (ai.decisions ?? []).entries()) {
    line(d.line, `decision ${i}`);
    if (d.speaker != null && !keys.has(d.speaker)) errs.push(`decision ${i}: unknown speaker ${d.speaker}`);
  }
  return errs.map((e) => `${slug}: ${e}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const slugs = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(join(ROOT, "seed-src/meetings")).map((f) => f.replace(/\.json$/, ""));
  let bad = 0;
  for (const s of slugs) {
    const e = validate(s);
    if (e.length) { bad++; e.forEach((x) => console.error(x)); } else console.log(`${s}: ok`);
  }
  process.exit(bad ? 1 : 0);
}
