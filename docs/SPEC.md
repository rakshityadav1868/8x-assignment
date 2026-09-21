# Fanthom — product & build spec (source of truth for all agents)

Build a deployed, working clone of fathom.video (AI meeting notetaker). Product name **Fanthom**, own simple logo. Match Fathom's layout, flows and UX — never its logo, illustrations or brand assets.

Judged on: **speed** (amount of working product), **product judgement** (what was built first / left out), **UX & UI quality**.

## Hard rules
- Never edit/delete anything in `.agent-logs/` or `.claude/hooks/`; never change `.claude/settings.json` hooks.
- Commit small and often, clear messages, `git push` each time; `.agent-logs/` committed along with work.
- Live Vercel URL must open for a signed-out visitor. Redeploy after every phase.
- No secrets in commits or client bundles.

## Product (what Fathom is)
**Call page:** video player + chat-style transcript (speaker, avatar, timestamp); clicking transcript seeks, active line highlights. Transcript editing (P3). AI Summary with template dropdown (General, Sales, Sales–BANT, Sales–MEDDPICC, Sales–SPICED, Q&A, Stand-up, 1:1, Project Update, Customer Success, Interview); regenerate on change; structured markdown (Topics discussed / Key takeaways / Next steps); every bullet links to its timestamp; gear → custom instructions → Regenerate; language dropdown. Action items (assignee, completed checkbox, timestamp, user_generated, Copy). Follow-up email draft. Highlights from transcript (hover "+", type: Positive, Pain point, Question, Action item, Decision) shown as timeline markers; each highlight is a clip with own share link. Share: public link (video, transcript, summary), access: anyone with link / same domain / only people added. Ask Fanthom: meeting chat with citations to transcript moments. Meeting-type badge (AI-detected, editable) picks the default template.

**Across meetings:** Home "My Calls" grouped by date (title, duration, attendees, type), upcoming meetings strip (seeded). Global search (keyword → exact moment); cross-meeting Ask (P3). Playlists / folders (P3). Settings with honest stubbed integrations (Slack, HubSpot, Salesforce, Asana, Zapier).

**Data shape (Fathom API):** meeting {title, url, share_url, scheduled/recording start & end, meeting_type, transcript_language, calendar_invitees[name,email,is_external], recorded_by}; transcript items {speaker.display_name, matched_calendar_invitee_email, text, timestamp}; default_summary {template_name, markdown_formatted}; action_items {description, user_generated, completed, recording_timestamp, assignee}; highlights {type, summary, timestamp}.

## Scope
**Stubbed on purpose:** live recording bot, calendar OAuth, CRM integrations, billing, SSO, real auth. Replaced by an **Upload a recording** flow running REAL diarized transcription + real AI summary/action items, and a single demo workspace user (no login). Upcoming meetings = seeded.

**P0 (in order):** 1) calls list with realistic seed; 2) call page with player↔transcript sync (auto-scroll, active line, click-to-seek); 3) AI summary w/ template switcher + timestamp bullets, action items; 4) public `/share/[token]`; 5) global search → jumps to moment.
**P1:** highlights → clips `/clip/[token]`; per-meeting Ask with citations; upload-and-transcribe; follow-up email.
**P2 (better than Fathom for the 8-person, 60-min call):** auto chapters + chapter rail; speaker timeline + talk-time %, click speaker to filter transcript; Decisions section + "What did <person> commit to?"; "Catch me up" from minute X; keyboard shortcuts (Space, J/L ±10s, ⌘K, 1–2× speed); virtualized transcript.
**P3:** playlists, cross-meeting Ask, transcript edit/reassign speaker, summary language.

## Stack (fixed)
Next.js App Router + TS (server actions + route handlers), Tailwind, shadcn/ui, lucide-react. Supabase Postgres + Storage; migrations in `supabase/migrations/`. Search: Postgres FTS (tsvector + GIN) on transcript segments. LLM: `@anthropic-ai/sdk`, model `claude-sonnet-5`, zod-validated JSON. Transcription: Deepgram nova (diarize, utterances); fallback AssemblyAI. Deploy: Vercel. Env vars in `.env.example`.

## Schema
workspaces, users, meetings (title, meeting_type, scheduled/recording start/end, duration_sec, media_url, media_kind video|audio, status processing|ready|failed, share_token, share_access, synthetic), participants (meeting_id, name, email, is_external, color), transcript_segments (meeting_id, participant_id, start_ms, end_ms, text, tsv), summaries (meeting_id, template, language, markdown, sections jsonb w/ timestamp refs, custom_instructions, created_at), action_items (description, assignee_participant_id, timestamp_ms, completed, user_generated), highlights (meeting_id, start_ms, end_ms, type, title, note, share_token), chapters (title, start_ms, end_ms, summary), playlists, playlist_items, summary_templates (key, name, prompt), chat_messages (meeting_id nullable, role, content, citations jsonb). Indexes: GIN on tsv, (meeting_id, start_ms).

Seed: 8–10 meetings over past 2 weeks — sales discovery (2), weekly standup (5), 1:1, CS QBR (4, external), interview, product planning, and one **8-person 60-min "Q4 Roadmap Planning"**. Full transcripts, ≥2 summaries, action items, highlights, chapters. Real media from `seed-media/` if provided, else synthetic (flag `synthetic: true`, be honest in README). Idempotent `npm run seed`.

## API (backend)
- `POST /api/upload` (signed upload URL) → `POST /api/meetings/:id/process`: Deepgram → segments → parallel LLM jobs (summary, action items, chapters, highlight suggestions, meeting-type) → `ready`, with progress states.
- `POST /api/meetings/:id/summary {template, language, customInstructions}`
- `POST /api/meetings/:id/ask` streaming, grounded in transcript, citations `[{segment_id, start_ms}]`
- `GET /api/search?q=` hits {meeting, speaker, snippet w/ highlighted terms, start_ms}
- highlights CRUD, action item toggle/edit, share token create/access, follow-up email, catch-me-up (range summary).
- Prompts in `src/lib/prompts/`; transcript lines `[mm:ss] Speaker: text`; every bullet has a timestamp; zod-validated, retry once. Map-reduce by chapter for 60-min calls. Cache LLM output in DB; never generate on page load.

## Frontend
Pages: `/`, `/calls/[id]`, `/share/[token]`, `/clip/[token]`, `/search`, `/upload`, `/playlists` (P3), `/settings`. Light UI, neutral grays, one accent, Inter, subtle borders. Call page: left player + timeline (highlight markers, chapter rail, speaker bars); right tabs Summary | Transcript | Action items | Ask; header title/date/duration/attendees/type dropdown/Share/…. Skeleton/empty/error states everywhere; 375px mobile; toasts.

## Phases
0 architect: contracts, types, ARCHITECTURE.md, scaffold, shadcn, Vercel deploy of shell → reviewer.
1 database ‖ backend ‖ frontend: schema+seed; pipeline+summary/action items; home + call page sync. Acceptance: seeded list on live URL; call page plays/syncs/seeks; summary + action items with working timestamps.
2 template switching, share page, search, highlights/clips, upload. Acceptance: share link logged-out; search jumps to moment; upload becomes ready meeting.
3 chapters, speaker timeline/filter, decisions, catch-me-up, Ask with citations, follow-up email, shortcuts.
4 polish 8-person meeting, README, WALKTHROUGH.md (<5 min), final deploy + reviewer hand-in checklist.

## OVERRIDES from the user (take precedence over anything above)
1. **Visual style = `reference/style-ref-*.png`** (a dark "Vexel" landing page — use as *style* reference only, never copy its name, logo or imagery). Dark UI: near-black / deep navy background (#05070d → #0a1020), electric-blue accent (~#3b82f6 / #60a5fa) with soft blue glow, white pill primary buttons with a small dark circular arrow icon, dark pill secondary buttons, a floating centered pill nav, glassy dark cards with 1px subtle borders (white/8%), large tight-tracked headings, generous spacing. App screens (call page etc.) use the same dark palette, like the dashboard mock inside the reference (dark sidebar, "MAIN"/"HELP" small caps section labels, dark stat cards). Keep contrast accessible. This replaces "clean light UI".
2. **Routes:** `/` = Fanthom marketing landing page in the reference style (animated particle/glow canvas hero drawn by us, headline, "Open the demo workspace" primary CTA → `/calls`, an app preview panel, feature cards, closing CTA). The app's "My Calls" home lives at **`/calls`**; call page `/calls/[id]`. Every other route as listed.
3. **Keyless-first.** The user provides API keys only at the very end. Everything must work on the live URL with NO env vars:
   - Data layer `src/lib/db/` behind one repository interface with two implementations: **Supabase** (used when `SUPABASE_SERVICE_ROLE_KEY` + URL exist) and **local seed store** (static seed JSON in `src/data/seed/` loaded in memory; mutations kept in memory per server instance, clearly labelled "demo mode" in README). The UI must not know which is active.
   - LLM features without `ANTHROPIC_API_KEY`: seeded meetings already carry pre-authored summaries (all key templates), action items, chapters, highlights, decisions. Regenerate / Ask / catch-me-up / follow-up email fall back to a deterministic local implementation (extractive: keyword retrieval over segments with citations, template-shaped extractive summaries) and show a subtle "AI offline – demo mode" badge. With a key, they use Claude.
   - Upload without `DEEPGRAM_API_KEY`: the UI works and explains that transcription needs the key (honest stub); with keys it runs the real pipeline.
4. **Seed media:** real multi-voice audio generated locally with macOS `say` (different voices per speaker) + ffmpeg, stitched per utterance so transcript timestamps are EXACT. Output AAC/m4a (~32–48 kbps mono) in `public/media/<meeting-slug>.m4a`. The player shows a meeting-style "video" surface: participant tiles grid with the active speaker glowing (driven by the transcript), so it looks like a call recording. Mark seed meetings `synthetic: true`.
