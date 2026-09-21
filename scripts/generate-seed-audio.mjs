#!/usr/bin/env node
// Generates real multi-voice meeting audio for the seed meetings using macOS `say` + ffmpeg.
//
//   node scripts/generate-seed-audio.mjs            # all meetings in seed-src/meetings
//   node scripts/generate-seed-audio.mjs acme-discovery weekly-standup
//
// For each seed-src/meetings/<slug>.json it synthesises every line with the speaker's voice,
// converts it to 24 kHz mono PCM, stitches the lines together with natural gaps of silence and
// encodes public/media/<slug>.m4a (AAC mono, 24 kHz, ~40 kbps). Because the stitching is done at
// the sample level, the per-line timings written to seed-src/timings/<slug>.json are exact.
// Per-line audio is cached in .cache/tts/ keyed by hash(voice + rate + text), so reruns are fast.
// No npm dependencies. Requires macOS `say`, `ffmpeg` and `ffprobe` on PATH.

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MEETINGS_DIR = join(ROOT, "seed-src/meetings");
const TIMINGS_DIR = join(ROOT, "seed-src/timings");
const MEDIA_DIR = join(ROOT, "public/media");
const CACHE_DIR = join(ROOT, ".cache/tts");
const SAMPLE_RATE = 24000;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000; // s16le mono
const BITRATE = "40k";
const CONCURRENCY = Number(process.env.TTS_CONCURRENCY) || Math.min(8, Math.max(2, cpus().length));
const LEAD_IN_MS = 600;
const TAIL_MS = 800;

for (const d of [TIMINGS_DIR, MEDIA_DIR, CACHE_DIR]) mkdirSync(d, { recursive: true });

const sha = (s) => createHash("sha1").update(s).digest("hex");

// Deterministic PRNG (mulberry32) seeded per meeting, so gaps are stable across reruns.
function prng(seedStr) {
  let a = parseInt(sha(seedStr).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Speaking rate per participant: explicit `rate`, else a stable value in 175–195 wpm.
function rateFor(p) {
  if (p.rate) return p.rate;
  return 175 + (parseInt(sha(p.name || p.key).slice(0, 4), 16) % 21);
}

// Clean text for TTS: `say` reads some punctuation literally or pauses oddly on it.
function ttsText(text) {
  return text
    .replace(/\s*--\s*$/, ",") // cut-off line: trail off instead of reading dashes
    .replace(/\s+--\s+/g, ", ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...");
}

// Synthesise one line → cached raw PCM (s16le, 24 kHz, mono). Returns the PCM path.
async function synth(voice, rate, text) {
  const key = sha(`${voice}|${rate}|${text}`);
  const pcm = join(CACHE_DIR, `${key}.pcm`);
  if (existsSync(pcm) && statSync(pcm).size > 0) return pcm;
  const aiff = join(CACHE_DIR, `${key}.${process.pid}.aiff`);
  const tmpPcm = `${pcm}.${process.pid}.tmp`;
  // `say` occasionally hangs under concurrency (speech server stall): time out and retry.
  for (let attempt = 1; ; attempt++) {
    try {
      await run("say", ["-v", voice, "-r", String(rate), "-o", aiff, "--", text], { timeout: 20_000 + text.length * 100 });
      break;
    } catch (err) {
      rmSync(aiff, { force: true });
      if (attempt >= 4) throw new Error(`say failed for "${text.slice(0, 40)}": ${err.message}`);
    }
  }
  await run("ffmpeg", ["-v", "error", "-y", "-i", aiff, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", tmpPcm]);
  renameSync(tmpPcm, pcm);
  rmSync(aiff, { force: true });
  return pcm;
}

// Simple promise pool shared by all meetings.
function makePool(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || !queue.length) return;
    active++;
    const { fn, res, rej } = queue.shift();
    fn().then(res, rej).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((res, rej) => { queue.push({ fn, res, rej }); next(); });
}
const pool = makePool(CONCURRENCY);

async function encode(pcmBuffer, outPath) {
  const tmp = outPath.replace(/\.m4a$/, ".tmp.m4a");
  await new Promise((res, rej) => {
    const ff = spawn("ffmpeg", [
      "-v", "error", "-y",
      "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
      "-c:a", "aac", "-b:a", BITRATE, "-ar", String(SAMPLE_RATE), "-ac", "1",
      "-movflags", "+faststart", tmp,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    ff.on("error", rej);
    ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`))));
    ff.stdin.end(pcmBuffer);
  });
  renameSync(tmp, outPath);
}

async function probeMs(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Math.round(parseFloat(stdout.trim()) * 1000);
}

async function processMeeting(file) {
  const m = JSON.parse(readFileSync(join(MEETINGS_DIR, file), "utf8"));
  const people = Object.fromEntries(m.participants.map((p) => [p.key, p]));
  for (const l of m.lines) if (!people[l.speaker]) throw new Error(`${m.slug}: unknown speaker "${l.speaker}"`);

  const t0 = Date.now();
  const pcms = await Promise.all(
    m.lines.map((l) => {
      const p = people[l.speaker];
      return pool(() => synth(p.voice, rateFor(p), ttsText(l.text)));
    }),
  );

  const rand = prng(m.slug);
  const chunks = [Buffer.alloc(Math.round(LEAD_IN_MS * BYTES_PER_MS / 2) * 2)];
  let cursor = LEAD_IN_MS * BYTES_PER_MS;
  const lines = [];
  m.lines.forEach((l, i) => {
    if (i > 0) {
      const prev = m.lines[i - 1];
      let gap;
      if (/--\s*$/.test(prev.text)) gap = 60 + rand() * 90; // interrupted: next speaker jumps in
      else if (prev.speaker === l.speaker) gap = 150 + rand() * 200; // same speaker continuing
      else if (rand() < 0.08) gap = 1000 + rand() * 500; // occasional thinking pause
      else gap = 250 + rand() * 450;
      const bytes = Math.round((gap * BYTES_PER_MS) / 2) * 2;
      chunks.push(Buffer.alloc(bytes));
      cursor += bytes;
    }
    const buf = readFileSync(pcms[i]);
    const start = cursor;
    chunks.push(buf);
    cursor += buf.length;
    lines.push({ index: i, speaker: l.speaker, start_ms: Math.round(start / BYTES_PER_MS), end_ms: Math.round(cursor / BYTES_PER_MS) });
  });
  const tail = Math.round((TAIL_MS * BYTES_PER_MS) / 2) * 2;
  chunks.push(Buffer.alloc(tail));
  cursor += tail;

  const out = join(MEDIA_DIR, `${m.slug}.m4a`);
  await encode(Buffer.concat(chunks), out);
  const duration_ms = Math.round(cursor / BYTES_PER_MS);
  const probed = await probeMs(out);

  writeFileSync(
    join(TIMINGS_DIR, `${m.slug}.json`),
    JSON.stringify({ slug: m.slug, media: `/media/${m.slug}.m4a`, duration_ms, sample_rate: SAMPLE_RATE, lines }, null, 2) + "\n",
  );
  const words = m.lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0);
  const size = statSync(out).size;
  console.log(
    `${m.slug.padEnd(26)} ${String(m.participants.length).padStart(2)} ppl  ${String(m.lines.length).padStart(4)} lines  ${String(words).padStart(5)} words  ` +
      `${(duration_ms / 60000).toFixed(1).padStart(5)} min (probe ${(probed / 60000).toFixed(1)})  ${(size / 1e6).toFixed(2)} MB  ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
  return size;
}

const only = process.argv.slice(2);
const files = readdirSync(MEETINGS_DIR)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => !only.length || only.includes(f.replace(/\.json$/, "")));
if (!files.length) {
  console.error("No seed meetings found.");
  process.exit(1);
}
console.log(`Generating ${files.length} meeting(s) with concurrency ${CONCURRENCY}...`);
await Promise.all(files.map(processMeeting));

const total = readdirSync(MEDIA_DIR).filter((f) => f.endsWith(".m4a")).reduce((n, f) => n + statSync(join(MEDIA_DIR, f)).size, 0);
console.log(`public/media total: ${(total / 1e6).toFixed(1)} MB`);
if (total > 60e6) {
  console.error("public/media exceeds 60 MB budget");
  process.exit(1);
}
