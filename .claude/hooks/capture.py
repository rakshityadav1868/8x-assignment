#!/usr/bin/env python3
"""Append each prompt and final response to .agent-logs/<session>.md.

Wired to Claude Code hooks in .claude/settings.json:
  UserPromptSubmit -> capture.py prompt    (logs the prompt verbatim)
  Stop             -> capture.py response  (logs the final assistant message)

Never blocks the session: any failure is written to stderr and exits 0.
"""
import datetime
import fcntl
import json
import os
import re
import sys
import time

AUTHOR = "rakshityadav1868"
TOOL = "claude-code"

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
LOG_DIR = os.path.join(ROOT, ".agent-logs")
STATE_DIR = os.path.join(ROOT, ".claude", "hooks", ".state")  # gitignored
PROJECT = os.path.basename(ROOT.rstrip("/"))


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def load_state(sid):
    try:
        with open(os.path.join(STATE_DIR, sid + ".json")) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(sid, st):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(os.path.join(STATE_DIR, sid + ".json"), "w") as f:
        json.dump(st, f)


def read_transcript(path):
    entries = []
    try:
        with open(path) as f:
            for line in f:
                try:
                    entries.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        pass
    return entries


def last_model(entries):
    for e in reversed(entries):
        m = (e.get("message") or {}).get("model")
        if e.get("type") == "assistant" and m and m != "<synthetic>":
            return m
    return None


def final_text(entries):
    """Text of the last assistant message that contains text (all its text blocks)."""
    target = None
    for e in reversed(entries):
        if e.get("type") != "assistant":
            continue
        msg = e.get("message") or {}
        content = msg.get("content")
        if isinstance(content, list) and any(b.get("type") == "text" for b in content):
            target = msg.get("id")
            break
    if not target:
        return None, None
    parts = []
    for e in entries:
        msg = e.get("message") or {}
        if e.get("type") == "assistant" and msg.get("id") == target:
            for b in msg.get("content") or []:
                if b.get("type") == "text":
                    parts.append(b["text"])
    return target, "\n\n".join(parts)


ALIASES = {"opus": "claude-opus-5", "sonnet": "claude-sonnet-5",
           "haiku": "claude-haiku-4-5", "fable": "claude-fable-5-1"}


def configured_model():
    """Model from settings (hook input carries none); used until the transcript shows the real one."""
    m = os.environ.get("ANTHROPIC_MODEL")
    for path in (os.path.join(ROOT, ".claude", "settings.local.json"),
                 os.path.join(ROOT, ".claude", "settings.json"),
                 os.path.expanduser("~/.claude/settings.json")):
        if m:
            break
        try:
            with open(path) as f:
                m = json.load(f).get("model")
        except (OSError, ValueError):
            pass
    if not m:
        return None
    m = re.sub(r"\[.*\]$", "", m)
    return ALIASES.get(m, m)


def assistant_count(entries):
    return sum(1 for e in entries if e.get("type") == "assistant")


def header(sid, st):
    return (
        "---\n"
        f"session_id: {sid}\n"
        f"date: {st['date']}\n"
        f"author: {AUTHOR}\n"
        f"model: {st.get('model') or 'unknown'}\n"
        f"tool: {TOOL}\n"
        f"project: {PROJECT}\n"
        f"total_exchanges: {st.get('n', 0)}\n"
        f"first_prompt_time: {st.get('first') or ''}\n"
        f"last_prompt_time: {st.get('last') or ''}\n"
        "---\n\n"
        f"# Session Log - {st['date']}\n\n"
        f"Session: `{sid[:8]}` | Project: `{PROJECT}` | Author: `{AUTHOR}`\n\n"
        "---\n"
    )


def append(sid, st, kind, num, ts, model, body):
    path = os.path.join(LOG_DIR, st["file"])
    try:
        with open(path) as f:
            existing = f.read()
        body_start = existing.index("\n---\n", existing.index("# Session Log")) + 5
        rest = existing[body_start:]
    except (OSError, ValueError):
        rest = ""
    rest += (
        f"\n[LOG_ENTRY type={kind} num={num} session={sid[:8]}]\n"
        f"timestamp: {ts}\n"
        f"model: {model or 'unknown'}\n\n"
        f"{body}\n\n"
    )
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(header(sid, st) + rest)
    os.replace(tmp, path)


def main():
    mode = sys.argv[1]
    data = json.load(sys.stdin)
    sid = data.get("session_id") or "unknown"
    os.makedirs(LOG_DIR, exist_ok=True)
    os.makedirs(STATE_DIR, exist_ok=True)

    with open(os.path.join(STATE_DIR, ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        st = load_state(sid)

        entries = read_transcript(data.get("transcript_path", ""))
        st["model"] = last_model(entries) or st.get("model") or configured_model()

        if mode == "prompt":
            st["seen"] = assistant_count(entries)
            ts = now()
            if "file" not in st:
                stamp = ts[:19].replace("T", "_").replace(":", "-")
                st["file"] = f"{stamp}_{sid}.md"
                st["date"] = ts[:10]
                st["first"] = ts
            st["n"] = st.get("n", 0) + 1
            st["last"] = ts
            append(sid, st, "PROMPT", st["n"], ts, st.get("model"), data.get("prompt", ""))
            save_state(sid, st)

        elif mode == "response":
            if "file" not in st:
                return  # session started before the hook existed
            # The transcript can lag the Stop event; wait until this turn's replies are in it
            # so the real model is known.
            for _ in range(20):
                if assistant_count(entries) > st.get("seen", 0):
                    break
                time.sleep(0.25)
                entries = read_transcript(data.get("transcript_path", ""))
            st["model"] = last_model(entries) or st.get("model")
            text = data.get("last_assistant_message") or final_text(entries)[1]
            if st.get("responded") == st["n"]:
                return  # already logged a response for this prompt
            st["responded"] = st["n"]
            append(sid, st, "RESPONSE", st["n"], now(), st.get("model"), text or "(no text response)")
            save_state(sid, st)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # never break the session
        print(f"capture hook error: {exc}", file=sys.stderr)
    sys.exit(0)
