# Fanthom

**An AI meeting notetaker in the style of Fathom. Every call becomes a synced recording, a transcript, notes you can re-cut with templates, and answers with citations.**

**Live demo:** https://fanthom.vercel.app (open it signed out; no login and no keys needed)

## What Fanthom does

- **My Calls:** calls grouped by day, with type, duration and attendees, plus an upcoming-meetings strip.
- **Call page:**
  - A player with a participant "stage" whose active-speaker tile glows, driven by the transcript.
  - A speaker-labelled transcript that auto-scrolls, highlights the active line, and seeks when you click a line.
  - An **AI summary** with 11 templates: General, Sales, BANT, MEDDPICC, SPICED, Q&A, Stand-up, 1:1, Project Update, Customer Success, Interview. It also supports language choice and custom instructions, and **every bullet jumps to its moment**.
  - **Action items** with assignee, checkbox and timestamp. You can add your own, and copy them out.
  - A **follow-up email** draft.
- **Highlights and clips:** hover "+" on any transcript line to create a Positive, Pain point, Question, Action item or Decision highlight. Each one appears as a timeline marker and gets its own public `/clip/[token]` link. Playlists include "Play all".
- **Ask Fanthom:** chat about one call or across all calls. Every answer cites transcript moments you can click.
- **Share:** a public `/share/[token]` page with the recording, transcript and summary. Access can be set to anyone with the link, same domain, or only people added.
- **Search:** keyword search across every call jumps to the exact moment. Open it with ⌘K from anywhere.
- **Meeting-type badge:** AI-detected and editable. It chooses the default summary template.

## Product judgement

**What I built first, and why.**

- **P0 is the core Fathom loop:** find a call → read the notes → jump to the moment → share it. That means:
  - a realistic seeded calls list
  - the call page with player↔transcript sync
  - summary and action items where every bullet has a timestamp
  - the public share page
  - global search that lands on the exact moment

  Without these, nothing else matters.
- **P1 covers the next most-used surfaces:** highlights and clips, per-call Ask with citations, real upload-and-transcribe, and the follow-up email.
- **P2 goes past Fathom for long, crowded calls.** See the next section.
- **P3 was built last:** playlists, cross-meeting Ask, summary language, and transcript editing (fix text, reassign a speaker).

**What I stubbed on purpose, and why.**

| Stubbed | Why |
|---|---|
| Live recording bot | A bot needs Zoom/Meet/Teams app approvals and media infrastructure. **Upload a recording** runs the same pipeline instead: real Deepgram diarization and real Claude notes. |
| Calendar OAuth | Google/Microsoft OAuth verification is out of scope. The upcoming-meetings strip is seeded. |
| CRM / Slack / Asana / Zapier | Settings shows honest "coming soon" cards, not fake toggles. |
| Billing | Adds nothing to the product being judged. |
| SSO / real auth | There is one demo workspace user and no login. Share modes `same_domain` / `invited` are stored and shown as a gated screen; only "anyone with the link" opens. Writes need a demo-session cookie, so a public share link is read-only. |

**Honest note on the seed data.** The 9 seed meetings are **synthetic**:
- AI agents wrote the scripts for a fictional company, Northwind Labs.
- macOS text-to-speech voiced them, with a different voice per speaker, and ffmpeg stitched them line by line. Each transcript timestamp matches the audio exactly.
- The summaries, action items, chapters, highlights and decisions for seeded meetings were pre-authored, so the live demo works without API keys.
- Every seed meeting is flagged `synthetic: true`.

## Better than Fathom for the 8-person, 1-hour call

Open **Q4 Roadmap Planning** (8 people, ~58 min):

- **Chapters rail:** 11 AI chapters on the timeline and in a list, so a 58-minute call reads like a table of contents.
- **Speaker timeline + talk-time %:** see who dominated and when. **Click a speaker to filter the transcript** to only their lines.
- **Participant stage:** a video-call-style tile grid where the active speaker glows, so you always know who is talking.
- **Decisions:** a dedicated list of what was actually decided, each linked to its timestamp.
- **"What did X commit to?":** pick a person and get their commitments with due dates and timestamps.
- **Catch me up from minute X:** joined late or left early? Summarize any range.
- **Keyboard shortcuts:**
  - Space/K to play or pause
  - J/L to skip ±10s, ←/→ for ±5s
  - Shift + > / < to change speed
  - ⌘K to search, ? for help
- **Virtualized transcript:** ~700 lines scroll smoothly while staying synced.

## Demo mode vs live mode

Fanthom is **keyless-first**. The same build runs on seed data with no environment variables and switches to live services when keys are present. The UI never branches on which data store is active.

| | Demo mode (no keys) | Live mode |
|---|---|---|
| **Data** | In-memory seed store (`src/data/seed/`). Edits persist per server instance and reset on cold start | Supabase Postgres + Storage |
| **AI** | Pre-authored notes for seed calls. Regenerate / Ask / catch-up / email / commitments use a deterministic extractive fallback that still cites real transcript moments, with an "AI offline – demo mode" badge | Claude (`claude-sonnet-5`) with zod-validated JSON, one retry, and map-reduce by chapter |
| **Upload** | Explains that keys are needed and previews the pipeline stages | Real signed upload → Deepgram → parallel Claude jobs → ready meeting |

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (with the service key, enables the Supabase repo) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key |
| `SUPABASE_RECORDINGS_BUCKET` | Storage bucket for uploads (default `recordings`) |
| `ANTHROPIC_API_KEY` | Live Claude features (`ANTHROPIC_MODEL` to override the model) |
| `DEEPGRAM_API_KEY` | Real diarized transcription (`DEEPGRAM_MODEL` optional) |
| `ASSEMBLYAI_API_KEY` | Optional fallback transcription |
| `NEXT_PUBLIC_APP_URL` | Base URL for share/clip links |
| `RATE_LIMIT_IP_BURST`, `RATE_LIMIT_IP_PER_MIN`, `RATE_LIMIT_MEETING_PER_HOUR` | Optional overrides for the AI rate limits |

### Setup

```bash
npm i
cp .env.example .env.local        # optional: leave empty for demo mode
# Live data only: apply supabase/migrations/0001_init.sql (Supabase SQL editor or `supabase db push`)
npm run seed                      # builds seed JSON and loads it into Supabase (or: node scripts/seed.mts --sql)
npm run dev                       # http://localhost:3000
```

Other scripts:
- `npm run seed:audio` regenerates the synthetic audio (macOS `say` + ffmpeg).
- `npm run build:seed` rebuilds `src/data/seed/` from `seed-src/`.

## Stack

Next.js 16 (App Router, TypeScript, route handlers) · Tailwind CSS v4 · shadcn/ui · lucide-react · @tanstack/react-virtual ·
Supabase (Postgres full-text search with tsvector + GIN, Storage) · Anthropic SDK · Deepgram · zod · Vercel.
Architecture, data flow, route map and contracts are in **[ARCHITECTURE.md](ARCHITECTURE.md)**. The product spec is in [docs/SPEC.md](docs/SPEC.md).

## How it was built

An orchestrator coordinated **5 Claude Code subagents**, each defined in `.claude/agents/`:
- **architect:** contracts, scaffold, docs, deploys
- **database:** schema, repositories, seed pipeline
- **backend:** API, LLM and transcription pipeline
- **frontend:** every page
- **reviewer:** acceptance checks against the live URL

They worked in parallel against one typed contract (`src/lib/types.ts` + `src/lib/contracts.ts`). Every prompt and response is logged.

## Known gaps

- Without Supabase keys (demo mode), edits live in server memory. On Vercel, pages and API routes can run on different instances. Pages re-read the API after loading, and new clip links carry their own data so they open anywhere. Even so, edits can differ between instances and reset on cold start. Configuring Supabase removes this.
- In demo mode, a share link created after revoking one may not resolve on other instances. A deleted clip's link keeps working, because the link carries its own data.
- Upload processing runs inside the request lifecycle (`after()`), not a durable job queue. Very long files can hit the function time limit.
- Rate limiting is per instance and in memory, not in a shared store.
- No real auth. Share access modes other than "anyone with the link" are stored but not enforced against identities.
- Seed media is audio-only and synthetic. The participant stage stands in for video.
- Settings preferences (default template, share defaults) are saved in the browser only and don't yet drive server behaviour.

## What I'd build next

1. A real recording bot via a meeting-bot provider, plus calendar OAuth, so calls arrive automatically.
2. Auth and workspaces (Supabase Auth), with enforced share modes and per-user action items.
3. A durable processing queue (Inngest / QStash) with resumable uploads and progress over SSE.
4. CRM sync (HubSpot/Salesforce fields from the MEDDPICC/BANT templates) and Slack recap posting.
5. Cross-meeting analytics: talk-time trends, recurring topics, and commitments tracked from call to call.

Agent prompt/response logs are captured automatically into `.agent-logs/` (see `CAPTURE-TEST.md`).
