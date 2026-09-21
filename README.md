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

**Phase 5: Fathom feature parity**
- **Library:** tabs (My calls / Shared with me / Team), filters (type, participant, company, date, has action items, starred), sort, star/rename/move/trash with undo, multi-select bulk actions, and folders in the sidebar with their own pages.
- **Capture:** `/record` is a real in-browser recorder (mic picker, optional screen/tab capture with preview, level meter, pause/resume, review, then upload or download). **Send Fanthom to a live meeting** runs a simulated bot (joining → waiting room → recording → processing → done) that ends in a new call. `/calendar` is a week view with a per-event Record toggle and auto-record rules (all / external only / internal only / none).
- **Coaching and insights:** a per-call Coaching tab (talk ratio per speaker, longest monologue, questions, filler words, interruptions, words per minute, patience). `/insights` is a team dashboard with KPIs, weekly trend, meeting mix, per-person coaching table, top trackers and a meeting-load heatmap.
- **Trackers:** keyword/phrase trackers with hits across calls and markers on the call timeline.
- **Deals:** external calls grouped by company email domain. Each deal shows a call timeline, latest summary, next steps, stakeholders, and editable stage, amount, close date and BANT/MEDDPICC fields.
- **Collaboration:** timestamped comments with @mentions, replies and timeline markers. Emoji reactions on transcript lines. A notification bell (meeting ready, mentions, bot status).
- **Export and integrations:** downloads (transcript TXT/SRT/VTT/Markdown, summary Markdown, recording), a clip trim editor, **real** signed outgoing webhooks (test, delivery log, secret rotation), **real** Slack posting via an incoming-webhook URL, a CRM field-mapping preview with a sync log, and an email recap preview.
- **Account:** `/team` (members, roles, invite, remove), `/welcome` onboarding, and server-backed settings (general, recording, notifications, integrations). The default summary template setting now drives the call page, share page, downloads and recaps.
- **Marketing:** `/pricing` (4 tiers, billing toggle, comparison table, FAQ), `/features`, `/integrations`.

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
- **P3 came next:** playlists, cross-meeting Ask, summary language, and transcript editing (fix text, reassign a speaker).
- **Phase 5 was parity, built only after P0–P3 were solid.** The rule was: make it real when it needs nothing but a URL the user pastes (webhooks, Slack), compute it for real when it can come from the transcript (coaching, insights, trackers, deals, exports), and simulate it with a clear label when it needs third-party approvals or infrastructure (meeting bot, calendar/CRM OAuth, email sending).

## Fathom feature parity

| Feature | Status | Notes |
|---|---|---|
| Recording bot (Zoom/Meet/Teams) | **Simulated in demo** | A real state machine (joining → waiting room → recording → processing → done, with 409 on illegal steps) that auto-advances by elapsed time and ends by creating a call from a demo template. The UI labels it "simulated". A real bot needs meeting-platform app approval and media infrastructure. |
| In-browser recorder | **Real capture; transcription needs keys** | MediaRecorder + getDisplayMedia run for real. With Supabase + Deepgram the recording goes through the upload pipeline. Without keys you can review and download it. |
| Upload → transcript → notes | **Real with keys** | Deepgram diarization + Claude. Demo mode previews the stages. |
| Calendar | **Seeded; OAuth stubbed** | Two weeks of seeded events. The Record toggle and auto-record rules are real and stored. Google/Microsoft OAuth verification is out of scope. |
| Library, folders, tabs, trash | **Real** | Soft delete with undo; bulk move/star/trash. |
| Comments, @mentions, reactions | **Real** | Mentions create notifications. |
| Coaching metrics | **Real** | Computed from transcript segments (`src/lib/analytics/coaching.ts`). |
| Insights dashboard | **Real** | Computed across calls for the chosen range. |
| Trackers | **Real** | Keyword/phrase matching over segments, with timestamps. |
| Deals | **Real** | Derived from external attendees' email domains. Edits are stored as overrides. |
| Downloads | **Real** | TXT / SRT / VTT / Markdown transcript, Markdown summary, recording file. |
| Clip trim | **Real** | Drag start/end handles with preview. |
| Outgoing webhooks | **Real** | HMAC-signed POSTs for `meeting.ready`, `meeting.shared`, `highlight.created`, `action_item.completed`; "Send test", delivery log, secret rotation. |
| Slack | **Real** | Posts to a Slack incoming-webhook URL you paste. Can auto-post when a meeting is ready. |
| CRM (HubSpot / Salesforce) | **Preview / stub** | Shows the real field mapping from the summary. "Sync" writes a log entry only, because CRM OAuth apps are out of scope. |
| Email recap | **Preview** | Renders the recap. No email is sent (no mail provider). |
| Team and invites | **Real list; no email sent** | Members, roles, invite and remove are stored. Invite emails are not sent. |
| Auth | **Single demo user** | Everyone is "Priya Raman" in the Demo workspace, even with Supabase keys. Supabase Auth (magic link) is the next step and is not wired yet. |
| Billing | **None** | `/pricing` is marketing only. |
| Marketing pages | **Real** | `/`, `/pricing`, `/features`, `/integrations`. |

**What I stubbed on purpose, and why.**

| Stubbed | Why |
|---|---|
| Live recording bot | A bot needs Zoom/Meet/Teams app approvals and media infrastructure. The simulated bot shows the whole flow. **Record** and **Upload** run the real pipeline: Deepgram diarization and Claude notes. |
| Calendar and CRM OAuth | Google/Microsoft/HubSpot/Salesforce app verification is out of scope. Calendar is seeded; CRM is a preview with a log. |
| Email sending (recaps, invites) | Needs a mail provider and domain verification. Both are shown as previews. |
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
| `WORKSPACE_DOMAIN` | Optional. Email domain treated as internal for deals, coaching and auto-record rules (default `northwindlabs.io`) |
| `RATE_LIMIT_IP_BURST`, `RATE_LIMIT_IP_PER_MIN`, `RATE_LIMIT_MEETING_PER_HOUR` | Optional overrides for the AI rate limits |

### Setup

```bash
npm i
cp .env.example .env.local        # optional: leave empty for demo mode
# Live data only: apply supabase/migrations/0001_init.sql and 0002_parity.sql (SQL editor or `supabase db push`)
npm run seed                      # builds seed JSON and loads it into Supabase (or: node scripts/seed.mts --sql)
npm run dev                       # http://localhost:3000
```

Other scripts:
- `npm run seed:audio` regenerates the synthetic audio (macOS `say` + ffmpeg).
- `npm run build:seed` rebuilds `src/data/seed/` from `seed-src/`.
- `npm run check:phase5` runs sanity checks for coaching, SRT/VTT, trackers, insights, deals, the bot, CRM, Slack, and a real signed webhook POST.
- `npm run check:ask` checks the demo-mode Ask fallback.

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

- Without Supabase keys (demo mode), edits live in server memory. On Vercel, pages and API routes can run on different instances. Pages re-read the API after loading, and new clip links and bot session ids carry their own data so they resolve anywhere. Even so, edits (folders, comments, stars, trackers, webhooks and so on) can differ between instances and reset on cold start. A call created by the bot may briefly be missing from the library list on another instance, although its page opens. Configuring Supabase removes all of this.
- In demo mode, a share link created after revoking one may not resolve on other instances. A deleted clip's link keeps working, because the link carries its own data.
- Library filters and sort are not stored in the URL, so a filtered view can't be bookmarked or shared.
- The calendar renders in the viewer's time zone, but seeded events are scheduled in US Eastern business hours, so viewers outside the US see them at odd local times (for example, late evening or early morning).
- The `<video>` player path (`media_kind: "video"`) is built but untested with real video, because seed media is audio-only. The participant stage stands in for video.
- Upload processing runs inside the request lifecycle (`after()`), not a durable job queue. Very long files can hit the function time limit.
- Rate limiting is per instance and in memory, not in a shared store.
- No real auth. Share access modes other than "anyone with the link" are stored but not enforced against identities.

## What I'd build next

1. A real recording bot through a meeting-bot provider, plus Google/Microsoft calendar OAuth, so auto-record rules act on real events.
2. Supabase Auth (magic link) and real workspaces, with enforced share modes, per-user notifications and invite emails.
3. A durable processing queue (Inngest / QStash) with resumable uploads and progress over SSE.
4. Real HubSpot/Salesforce OAuth sync of the deal and MEDDPICC/BANT fields, and email recaps through a mail provider.
5. Library filters in the URL, saved views, and trackers that alert in Slack when a keyword shows up.

Agent prompt/response logs are captured automatically into `.agent-logs/` (see `CAPTURE-TEST.md`).
