# Fanthom

Fanthom is an AI meeting notetaker modelled on Fathom: every call gets a synced player and speaker-labelled transcript, an AI summary you can re-cut with templates (General, Sales, BANT, MEDDPICC, SPICED, Stand-up, 1:1, …) where every bullet jumps to its moment, action items, highlights you can share as clips, "Ask Fanthom" chat with citations, public share links and search across every call. It is tuned for the hard case — an 8-person, 60-minute planning call — with chapters, speaker talk-time, decisions and "catch me up from minute X".

**Stack:** Next.js (App Router, TypeScript) · Tailwind CSS v4 · shadcn/ui · lucide-react · Supabase (Postgres FTS + Storage) · Anthropic SDK (`claude-sonnet-5`) · Deepgram (nova, diarization) · zod · Vercel.

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the system diagram, data flow, route map, API contracts and ownership. Product spec: [docs/SPEC.md](docs/SPEC.md).

## Dev setup

```bash
npm install
cp .env.example .env.local   # optional — every key is optional (see below)
npm run dev                  # http://localhost:3000
npm run build && npm run lint && npx tsc --noEmit
```

## Keyless demo mode

Fanthom runs fully with **no environment variables**:

- **Data:** without Supabase keys, data comes from the in-memory seed store (`src/data/seed/`). Edits (action items, highlights, share settings) persist only for the life of a server instance — this is "demo mode".
- **AI:** seeded meetings ship with pre-authored summaries, action items, chapters, highlights and decisions. Without `ANTHROPIC_API_KEY`, regenerate / Ask / catch-me-up / follow-up email use a deterministic extractive fallback and show an "AI offline – demo mode" badge.
- **Upload:** without `DEEPGRAM_API_KEY`, the upload page explains that transcription needs a key.

## Scope & what's stubbed

- **Built (target):** P0 calls list, call page with player↔transcript sync, templated AI summaries with timestamped bullets, action items, public share pages, global search; P1 highlights/clips, Ask with citations, upload-and-transcribe, follow-up email; P2 chapters, speaker timeline, decisions, catch-me-up, shortcuts. See ARCHITECTURE.md §5 for live status.
- **Stubbed on purpose:** live recording bot and calendar OAuth (replaced by upload + seeded upcoming meetings), real auth/SSO (single demo user; `same_domain` / `invited` share modes are stored but gated), CRM/Slack/Asana/Zapier integrations (honest "coming soon" in Settings), billing.
- **Seed media is synthetic:** meeting audio is generated locally with macOS `say` voices + ffmpeg so transcript timestamps are exact; seed meetings are flagged `synthetic: true`.

Agent prompt/response logs are captured automatically into `.agent-logs/` (see `CAPTURE-TEST.md`).
