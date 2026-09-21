# Fanthom: 5-minute walkthrough

Live URL: https://fanthom.vercel.app. Before starting, open the URL once in a normal window and keep an incognito window ready.

| Time | Segment |
|---|---|
| 0:00 | Priorities |
| 0:30 | Core loop on the 8-person call |
| 3:15 | Search |
| 3:45 | Better than Fathom (recap) |
| 4:15 | What was stubbed |
| 4:40 | Next steps |

---

### 0:00 to 0:30: Priorities
- Start on the landing page `/`, then click **Open the demo workspace**.
- Say: "Fanthom is a Fathom-style AI notetaker. I built the core loop first: find a call, read notes where every bullet has a timestamp, jump to the moment, share it, search it. After that came clips, Ask and upload, and then features for the hard case, a 60-minute call with 8 people."
- Point out that it runs with no keys (demo mode). With keys, the same build uses Supabase, Claude and Deepgram.

### 0:30 to 3:15: Core loop on "Q4 Roadmap Planning" (8 people, ~58 min)
1. **0:30. Open the call** from `/calls` (it's the top card, and the meeting-type badge reads *Planning*).
2. **0:40. Play** (Space). The participant stage lights up whoever is speaking. The transcript auto-scrolls and highlights the active line. Click a transcript line: the player seeks there.
3. **1:00. Summary tab.**
   - Click a bullet under *Decisions made* and the player jumps to that moment.
   - Switch the template to **Sales – MEDDPICC** or **General** to show that the notes re-cut. Switch back.
4. **1:20. Chapters rail.** Click **"Platform reliability & code yellow"** (~27:00). The timeline shows 11 chapters.
5. **1:35. Speaker timeline.** Show talk-time %, then click **Arjun Mehta**. The transcript filters to his lines. Clear the filter.
6. **1:50. Decisions.** Open the Decisions list (AI Insights beta, the 75% eval gate, code yellow Oct 6–24, SSO GA / SCIM dates, Growth pricing). Each one links to its timestamp.
7. **2:05. "What did X commit to?"** Pick **Arjun Mehta** and you get his commitments with due dates and timestamps.
8. **2:15. Catch me up.** Choose "from minute 30" to get a recap of the second half.
9. **2:30. Ask tab.** Ask *"When does SSO go GA and who owns it?"*. The answer streams with `[n]` citations. Click one to seek.
10. **2:45. Highlight → clip.**
    - Hover a transcript line and click **+**.
    - Choose type *Decision* and add a title. A marker appears on the timeline.
    - Copy the clip link.
11. **2:55. Share.**
    - Click **Share** and choose *Anyone with the link*, then copy.
    - Paste both the share link and the clip link into the **incognito** window. Both open signed out and read-only.

### 3:15 to 3:45: Search
- Press ⌘K (or go to `/search`) and search **"SCIM"**.
- The hits are grouped by call with highlighted snippets: the Q4 planning call plus the vendor security review.
- Click a hit and the call opens at that exact second.

### 3:45 to 4:15: Better than Fathom (recap)
- Chapters rail, speaker timeline with talk-time and filter, the participant stage, a Decisions list, per-person commitments, catch-me-up from any minute, and cross-meeting **Ask** at `/ask`.
- Shortcuts: press **?** to show the sheet (J/L ±10s, Shift+>/< for speed).
- The ~700-line transcript is virtualized and stays smooth.

### 4:15 to 4:40: What was stubbed, and why
- **Recording bot and calendar OAuth:** replaced by **Upload** (show `/upload`). With keys it runs real Deepgram diarization and Claude notes; without keys it explains that honestly.
- **CRM, Slack and Zapier:** "coming soon" cards on `/settings`, next to live system status.
- **Auth, SSO and billing:** there is one demo workspace. Share links are read-only.
- **Seed calls are synthetic:** AI-written scripts, voiced by macOS TTS with exact timings, flagged `synthetic`.

### 4:40 to 5:00: Next steps
- A real meeting bot and calendar sync.
- Auth with enforced share modes.
- A durable processing queue.
- CRM field sync from the sales templates.
- Cross-meeting analytics: talk-time trends and commitments tracked across calls.
