/**
 * `npm run seed` — idempotently loads the demo seed (src/data/seed/**) into Supabase.
 *
 *   npm run seed                 # rebuilds src/data/seed, shifts dates to the current week, upserts into Supabase
 *   node scripts/seed.mts --sql   # prints the same data as idempotent SQL (paste into the Supabase SQL editor / psql)
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from the env or .env.local) and the schema from
 * supabase/migrations/0001_init.sql. Seed meetings are replaced wholesale (their child rows are deleted and
 * re-inserted); meetings created by uploads are never touched. Seed media stays in public/media and is served
 * from "/media/<slug>.m4a" — nothing is uploaded to Storage. Runs on Node >= 22.18 (native type stripping).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { SeedMeetingFile, SeedWorkspaceFile } from "../src/lib/types.ts";
// @ts-expect-error -- Node runs this script directly (type stripping), which needs the explicit .ts extension.
import { shiftSeed, type SeedAnchor } from "../src/lib/db/seed-time.ts";

type Row = Record<string, unknown>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = join(ROOT, "src/data/seed");
const SQL_MODE = process.argv.includes("--sql");

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
// Same whole-week shift as SeedRepo: the Q4 meeting lands on the most recent Thursday at seed time
// (re-run `npm run seed` to refresh dates later).
const shifted = shiftSeed(
  readdirSync(join(SEED, "meetings"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<SeedMeetingFile>(join(SEED, "meetings", f))),
  readJson<SeedWorkspaceFile & { anchor?: SeedAnchor }>(join(SEED, "workspace.json")),
);
const workspaceFile = shifted.workspace;
const meetingFiles = shifted.meetings;
if (!meetingFiles.length) throw new Error("No seed meetings in src/data/seed/meetings — run `npm run build:seed` first.");

function templates(): Row[] {
  const src = readFileSync(join(ROOT, "src/lib/templates.ts"), "utf8");
  return [...src.matchAll(/key:\s*"([a-z_]+)",\s*name:\s*"([^"]+)",\s*description:\s*"([^"]*)"/g)].map((m) => ({
    key: m[1],
    name: m[2],
    prompt: m[3],
  }));
}

// ---------------------------------------------------------------------------
// Rows per table (column names = DB columns)
// ---------------------------------------------------------------------------
const { workspace, user, upcoming, playlists } = workspaceFile;
const meetingIds = meetingFiles.map((m) => m.meeting.id);

const rows = {
  workspaces: [{ ...workspace }],
  users: [{ ...user }],
  summary_templates: templates(),
  meetings: meetingFiles.map((f) => ({ ...f.meeting, decisions: f.decisions ?? null })),
  participants: meetingFiles.flatMap((f) => f.participants.map((p, i) => ({ ...p, position: i }))),
  transcript_segments: meetingFiles.flatMap((f) => f.segments),
  summaries: meetingFiles.flatMap((f) => f.summaries),
  action_items: meetingFiles.flatMap((f) => f.action_items),
  highlights: meetingFiles.flatMap((f) => f.highlights),
  chapters: meetingFiles.flatMap((f) => f.chapters),
  upcoming_meetings: upcoming.map((u) => ({ ...u, workspace_id: workspace.id })),
  playlists: playlists.map(({ items: _items, ...p }) => p), // eslint-disable-line @typescript-eslint/no-unused-vars
  playlist_items: playlists.flatMap((p) => p.items),
} as unknown as Record<"workspaces" | "users" | "summary_templates" | "meetings" | "participants" | "transcript_segments" | "summaries" | "action_items" | "highlights" | "chapters" | "upcoming_meetings" | "playlists" | "playlist_items", Row[]>;

const CHILD_TABLES = ["transcript_segments", "action_items", "highlights", "chapters", "summaries", "participants"] as const;
const INSERT_ORDER = ["participants", "transcript_segments", "summaries", "action_items", "highlights", "chapters"] as const;

// ---------------------------------------------------------------------------
// SQL mode
// ---------------------------------------------------------------------------
function lit(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}
function insertSql(table: string, list: Row[], conflict?: string): string {
  if (!list.length) return "";
  const cols = Object.keys(list[0]);
  const out: string[] = [];
  for (let i = 0; i < list.length; i += 200) {
    const values = list.slice(i, i + 200).map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n  ");
    const onConflict = conflict
      ? ` on conflict (${conflict}) do update set ${cols.filter((c) => c !== conflict).map((c) => `${c === "end" ? '"end"' : c} = excluded.${c === "end" ? '"end"' : c}`).join(", ")}`
      : "";
    out.push(`insert into ${table} (${cols.map((c) => (c === "end" ? '"end"' : c)).join(", ")}) values\n  ${values}${onConflict};`);
  }
  return out.join("\n");
}
function toSql(): string {
  const ids = meetingIds.map(lit).join(", ");
  return [
    "begin;",
    insertSql("workspaces", rows.workspaces, "id"),
    insertSql("users", rows.users, "id"),
    insertSql("summary_templates", rows.summary_templates, "key"),
    insertSql("meetings", rows.meetings, "id"),
    ...CHILD_TABLES.map((t) => `delete from ${t} where meeting_id in (${ids});`),
    ...INSERT_ORDER.map((t) => insertSql(t, rows[t])),
    `delete from upcoming_meetings where workspace_id = ${lit(workspace.id)};`,
    insertSql("upcoming_meetings", rows.upcoming_meetings),
    insertSql("playlists", rows.playlists, "id"),
    `delete from playlist_items where playlist_id in (${rows.playlists.map((p) => lit(p.id)).join(", ")});`,
    insertSql("playlist_items", rows.playlist_items),
    "commit;",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Supabase mode
// ---------------------------------------------------------------------------
async function toSupabase(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Nothing to do — the app runs on the\n" +
        "in-memory seed store without them. Tip: `node scripts/seed.mts --sql > seed.sql` produces a SQL file instead.",
    );
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };
  const upsert = async (table: string, list: Row[], onConflict = "id") => {
    for (let i = 0; i < list.length; i += 500) ok(`upsert ${table}`, (await db.from(table).upsert(list.slice(i, i + 500), { onConflict })).error);
  };
  const insert = async (table: string, list: Row[]) => {
    for (let i = 0; i < list.length; i += 500) ok(`insert ${table}`, (await db.from(table).insert(list.slice(i, i + 500))).error);
  };

  await upsert("workspaces", rows.workspaces);
  await upsert("users", rows.users);
  await upsert("summary_templates", rows.summary_templates, "key");
  await upsert("meetings", rows.meetings);
  for (const t of CHILD_TABLES) ok(`clear ${t}`, (await db.from(t).delete().in("meeting_id", meetingIds)).error);
  for (const t of INSERT_ORDER) await insert(t, rows[t]);
  ok("clear upcoming", (await db.from("upcoming_meetings").delete().eq("workspace_id", workspace.id)).error);
  await insert("upcoming_meetings", rows.upcoming_meetings);
  await upsert("playlists", rows.playlists);
  ok("clear playlist items", (await db.from("playlist_items").delete().in("playlist_id", rows.playlists.map((p) => p.id as string))).error);
  await insert("playlist_items", rows.playlist_items);

  // Make sure the private uploads bucket exists (the migration also creates it).
  const bucket = process.env.SUPABASE_RECORDINGS_BUCKET || "recordings";
  const { error: bucketErr } = await db.storage.createBucket(bucket, { public: false });
  if (bucketErr && !/exist/i.test(bucketErr.message)) console.warn(`storage bucket "${bucket}": ${bucketErr.message}`);

  const { count, error } = await db.from("meetings").select("id", { count: "exact", head: true });
  ok("verify", error);
  if (!count) throw new Error("Seed finished but the meetings table is empty");
  console.log(
    `Seeded ${meetingFiles.length} meetings (${rows.transcript_segments.length} segments, ${rows.summaries.length} summaries, ` +
      `${rows.action_items.length} action items, ${rows.highlights.length} highlights, ${rows.chapters.length} chapters), ` +
      `${rows.upcoming_meetings.length} upcoming, ${rows.playlists.length} playlists. meetings table now has ${count} rows.`,
  );
}

if (SQL_MODE) process.stdout.write(toSql() + "\n");
else await toSupabase();
