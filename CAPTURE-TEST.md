# Capture Test

## Tool and model
- **Tool:** Claude Code 2.1.278 (CLI), macOS
- **Model:** `claude-opus-5` (Opus 5, 1M context). The same model plans and executes. Every log entry records the model, so a switch mid-build shows up.
- **Automatic mechanism:** yes, Claude Code hooks.

## Mechanism
- **Config file changed:** `.claude/settings.json` (project level, committed with the repo)
  - `UserPromptSubmit` → `python3 .claude/hooks/capture.py prompt`, which appends the prompt verbatim from the hook's `prompt` field
  - `Stop` → `python3 .claude/hooks/capture.py response`, which appends the final assistant message from the hook's `last_assistant_message` field and falls back to the last text message in the session transcript
- **Script:** `.claude/hooks/capture.py`
- One file per session in `.agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md`. The frontmatter (`total_exchanges`, `last_prompt_time`, `model`) is refreshed on each append. Existing entries are never changed.
- **Model name:** no hook input carries the model. The script reads it from the session transcript (`message.model`). For the first prompt of a session, before any reply exists, it falls back to the configured model (`ANTHROPIC_MODEL` or the `model` in settings, with the alias resolved).
- **Timestamps:** UTC, taken when each hook fires.

## Canary log files
Each canary ran as its own new `claude` session in this repo:
- `.agent-logs/2026-09-21_04-14-39_6cb64c01-e02f-46de-a72c-6a3642c9146e.md`
- `.agent-logs/2026-09-21_04-14-55_c5d1da91-4db9-4477-9604-5fa0991bf0f2.md`

## Canary entries (raw)

### Canary 1: `.agent-logs/2026-09-21_04-14-39_6cb64c01-e02f-46de-a72c-6a3642c9146e.md`

```
[LOG_ENTRY type=PROMPT num=1 session=6cb64c01]
timestamp: 2026-09-21T04:14:39.512Z
model: claude-opus-5

CAPTURE TEST — 8x assignment, Rakshit Yadav


[LOG_ENTRY type=RESPONSE num=1 session=6cb64c01]
timestamp: 2026-09-21T04:14:54.445Z
model: claude-opus-5

Prompt capture is working. Your message was logged to `.agent-logs/2026-09-21_04-14-39_6cb64c01-e02f-46de-a72c-6a3642c9146e.md` as `PROMPT num=1` for session `6cb64c01`, with the timestamp, model (`claude-opus-5`), author (`rakshityadav1868`) and the prompt text exactly as you typed it.

Response capture comes from the `Stop` hook (`.claude/hooks/capture.py response`), which runs after this reply finishes. That's why the log only has the prompt so far. To confirm it, check that the same file gains a `RESPONSE` entry once this turn ends.

Two things to note:
- `README.md` says to see `CAPTURE-TEST.md`, but that file doesn't exist in the repo.
- The logged author is `rakshityadav1868`, while your git user is `Rakshit Yadav`. Check that's the name you want in the logs you submit.
```

### Canary 2: `.agent-logs/2026-09-21_04-14-55_c5d1da91-4db9-4477-9604-5fa0991bf0f2.md`

```
[LOG_ENTRY type=PROMPT num=1 session=c5d1da91]
timestamp: 2026-09-21T04:14:55.307Z
model: claude-opus-5

CAPTURE TEST — 8x assignment, Rakshit Yadav


[LOG_ENTRY type=RESPONSE num=1 session=c5d1da91]
timestamp: 2026-09-21T04:15:02.956Z
model: claude-opus-5

I got your "CAPTURE TEST" message for the 8x assignment. I haven't run anything or changed any files.

The repo is on `main` with no commits yet. It has four untracked items: `.agent-logs/`, `.claude/`, `.gitignore` and `README.md`.

What should I do next? For example, I can read the README and start on the assignment, check that `.agent-logs/` is capturing this session, or make an initial commit.
```

## What I tried first that did not work
1. **A `SessionStart` hook to record the model.** I assumed the `SessionStart` input included the model name. It doesn't. I dumped the real inputs of all three events (`SessionStart`, `UserPromptSubmit`, `Stop`), and none of them has a model field. I removed the `SessionStart` hook and now read the model from the transcript and settings instead.
2. **Model logged as `unknown`.** On the first canary run (session `98e4bd2d`), both entries said `model: unknown`. The `Stop` hook can fire before the transcript has the reply written, so the model wasn't there yet. The fix is that the `Stop` hook now waits (up to 5 seconds) for this turn's assistant entries to appear in the transcript before logging. That log file, and one from a `say hi` input-dump run (session `e4b72b7c`), were deleted during setup, before the first commit. Both canaries above ran on the final script.
3. I didn't put the hooks in the user-level `~/.claude/settings.json`. That file would log every project on the machine and wouldn't ship with this repo.
