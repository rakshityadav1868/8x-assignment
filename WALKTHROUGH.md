# Fanthom: 5-minute walkthrough

Live URL: https://fanthom.vercel.app. Before starting, open the URL once in a normal window and keep an incognito window ready.

| Time | Segment |
|---|---|
| 0:00 | Priorities |
| 0:25 | Core loop on the 8-person call |
| 2:15 | Coaching and a comment with @mention |
| 2:40 | Search |
| 3:00 | Parity tour: bot → new call, deals, insights |
| 3:55 | Better than Fathom (recap) |
| 4:15 | What was simulated or stubbed |
| 4:40 | Next steps |

---

### 0:00 to 0:25: Priorities
- Start on the landing page `/`, then click **Open the demo workspace**.
- Say: "Fanthom is a Fathom-style AI notetaker. I built the core loop first: find a call, read notes where every bullet has a timestamp, jump to the moment, share it, search it. Then clips, Ask and upload, then features for the hard case, a 60-minute call with 8 people. Last came Fathom feature parity."
- Point out that it runs with no keys (demo mode). With keys, the same build uses Supabase, Claude and Deepgram.

### 0:25 to 2:15: Core loop on "Q4 Roadmap Planning" (8 people, ~58 min)
1. **0:25. Open the call** from `/calls` (the top card, with the meeting-type badge *Planning*).
2. **0:35. Play** (Space). The participant stage lights up whoever is speaking. The transcript auto-scrolls and highlights the active line. Click a line and the player seeks there.
3. **0:50. Summary tab.** Click a bullet under *Decisions made* and the player jumps to that moment. Switch the template to **Sales – MEDDPICC** to show the notes re-cut, then switch back.
4. **1:05. Chapters and speakers.** Click the chapter **"Platform reliability & code yellow"** (~27:00). On the speaker timeline, click **Arjun Mehta** to filter the transcript to his lines, then clear the filter.
5. **1:20. Decisions and commitments.** Open the Decisions list; each item links to its timestamp. In "What did X commit to?", pick **Arjun Mehta** to see his commitments with due dates.
6. **1:35. Ask tab.** Ask *"When does SSO go GA and who owns it?"*. The answer streams with `[n]` citations. Click one to seek.
7. **1:50. Highlight, clip and share.**
   - Hover a transcript line, click **+**, choose *Decision* and copy the clip link.
   - Click **Share**, choose *Anyone with the link*, and copy it.
   - Paste both links into the **incognito** window. Both open signed out and read-only.

### 2:15 to 2:40: Coaching and a comment with @mention (same call)
- Open the **Coaching** tab (in the **More** menu on a narrow window). Show talk ratio per speaker, the longest monologue, questions asked, filler words and interruptions. All of it is computed from the transcript.
- Open **Comments** and post *"@Arjun can you confirm the SSO date?"* at the current moment. A marker appears on the timeline, and the mention creates a notification.

### 2:40 to 3:00: Search
- Press ⌘K and search **"SCIM"**. The hits are grouped by call (Q4 planning and the vendor security review). Click one and the call opens at that exact second.

### 3:00 to 3:55: Parity tour
1. **3:00. Bot → new call.** On `/calls`, click **Send to meeting**, paste a Google Meet URL, and click **Send Fanthom**. The panel moves through joining → waiting room → recording. Click **Stop recording**; it processes, then **Open the call** shows a new call in the library. Say that the bot is simulated and labelled as such, because a real one needs platform approvals. `/record` has a real in-browser recorder, and `/calendar` has per-meeting Record toggles and auto-record rules.
2. **3:25. Deals.** Open `/deals`, then **Globex**. Show the call timeline, latest summary, next steps and stakeholders, and edit a MEDDPICC field.
3. **3:40. Insights.** Open `/insights`. Show the KPIs, weekly trend, per-person coaching table and meeting-load heatmap.

### 3:55 to 4:15: Better than Fathom (recap)
- Chapters rail, speaker timeline with filter, participant stage, Decisions, per-person commitments, catch-me-up from any minute, and cross-meeting Ask at `/ask`.
- Press **?** for the shortcut sheet. The ~700-line transcript is virtualized and stays smooth.

### 4:15 to 4:40: What was simulated or stubbed, and why
- **Real:** outgoing webhooks and Slack (both need only a URL you paste; see `/settings` → Integrations), plus downloads and clip trim.
- **Simulated or previewed:** the meeting bot, calendar OAuth (seeded events), CRM sync (field-mapping preview and log), and email recaps and invites (no email is sent).
- **Auth and billing:** one demo user, no billing. Seed calls are synthetic: AI-written scripts voiced by macOS TTS with exact timings.

### 4:40 to 5:00: Next steps
- A real meeting bot and calendar OAuth.
- Supabase Auth with enforced share modes.
- A durable processing queue.
- Real CRM sync of the deal fields.
