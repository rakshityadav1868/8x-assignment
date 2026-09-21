/** Summary / recap exporters (Phase 5 D). Pure. Owner: backend. */
import { SUMMARY_TEMPLATES } from "@/lib/templates";
import type { EmailRecap, MeetingDetail, Summary } from "@/lib/types";
import { formatClockMs, formatExportDate, meetingDateIso } from "./transcript";

const tlink = (callUrl: string | undefined, ms: number) => (callUrl ? `${callUrl}?t=${Math.floor(ms / 1000)}` : null);
const templateName = (s: Summary) => SUMMARY_TEMPLATES.find((t) => t.key === s.template)?.name ?? s.template;

function assigneeName(detail: MeetingDetail, id: string | null): string | null {
  return id ? (detail.participants.find((p) => p.id === id)?.name ?? null) : null;
}

/** Markdown with title, date, participants, summary sections (bullets link to `${callUrl}?t=sec` when given), action items, highlights. */
export function summaryToMarkdown(detail: MeetingDetail, summary: Summary | null, callUrl?: string): string {
  const out: string[] = [`# ${detail.meeting.title}`, ""];
  const date = formatExportDate(meetingDateIso(detail.meeting));
  if (date) out.push(`- **Date:** ${date}`);
  if (detail.meeting.duration_sec) out.push(`- **Duration:** ${Math.round(detail.meeting.duration_sec / 60)} min`);
  if (detail.participants.length) out.push(`- **Participants:** ${detail.participants.map((p) => p.name).join(", ")}`);
  if (callUrl) out.push(`- **Recording:** ${callUrl}`);
  out.push("");

  const stamp = (ms: number) => {
    const url = tlink(callUrl, ms);
    return url ? `[${formatClockMs(ms)}](${url})` : `[${formatClockMs(ms)}]`;
  };

  if (summary) {
    out.push(`## Summary (${templateName(summary)})`, "");
    for (const sec of summary.sections) {
      out.push(`### ${sec.heading}`, "");
      if (!sec.bullets.length) out.push("_Nothing noted._");
      for (const b of sec.bullets) out.push(`- ${b.text} ${stamp(b.start_ms)}`);
      out.push("");
    }
  } else {
    out.push("## Summary", "", "_No summary has been generated for this meeting yet._", "");
  }

  if (detail.action_items.length) {
    out.push("## Action items", "");
    for (const a of detail.action_items) {
      const who = assigneeName(detail, a.assignee_participant_id);
      out.push(`- [${a.completed ? "x" : " "}] ${a.description}${who ? ` (${who})` : ""}${a.timestamp_ms != null ? ` ${stamp(a.timestamp_ms)}` : ""}`);
    }
    out.push("");
  }

  if (detail.highlights.length) {
    out.push("## Highlights", "");
    for (const h of detail.highlights) out.push(`- **${h.title}** (${h.type.replace(/_/g, " ")}) ${stamp(h.start_ms)}${h.note ? ` — ${h.note}` : ""}`);
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Email recap preview (HTML inline-styled + plain text). Recipients per `recipients` filter on participant emails. */
export function buildEmailRecap(
  detail: MeetingDetail,
  summary: Summary | null,
  opts: { callUrl: string; include_action_items: boolean; include_highlights: boolean; recipients: "all" | "internal" | "external" },
): EmailRecap {
  const to = detail.participants
    .filter((p) => p.email && (opts.recipients === "all" || (opts.recipients === "external" ? p.is_external : !p.is_external)))
    .map((p) => p.email!)
    .filter((e, i, a) => a.indexOf(e) === i);
  const date = formatExportDate(meetingDateIso(detail.meeting));
  const subject = `Recap: ${detail.meeting.title}${date ? ` (${date})` : ""}`;
  const url = (ms: number) => `${opts.callUrl}?t=${Math.floor(ms / 1000)}`;

  const text: string[] = [`${detail.meeting.title}`, date, "", `Watch the recording: ${opts.callUrl}`, ""];
  const A = "color:#2563eb;text-decoration:none";
  const html: string[] = [
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;max-width:640px;line-height:1.5">`,
    `<h1 style="font-size:20px;margin:0 0 4px">${esc(detail.meeting.title)}</h1>`,
    date ? `<p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(date)}</p>` : "",
    `<p style="margin:0 0 20px"><a href="${esc(opts.callUrl)}" style="display:inline-block;background:#2563eb;color:#fff;padding:8px 14px;border-radius:999px;text-decoration:none;font-size:14px">Watch the recording</a></p>`,
  ];

  if (summary) {
    for (const sec of summary.sections) {
      if (!sec.bullets.length) continue;
      text.push(sec.heading.toUpperCase());
      html.push(`<h2 style="font-size:15px;margin:18px 0 6px">${esc(sec.heading)}</h2><ul style="margin:0;padding-left:20px">`);
      for (const b of sec.bullets) {
        text.push(`- ${b.text} [${formatClockMs(b.start_ms)}] ${url(b.start_ms)}`);
        html.push(`<li style="margin:2px 0">${esc(b.text)} <a href="${esc(url(b.start_ms))}" style="${A};font-size:12px">${formatClockMs(b.start_ms)}</a></li>`);
      }
      html.push("</ul>");
      text.push("");
    }
  } else {
    text.push("No summary has been generated yet.", "");
    html.push(`<p style="color:#64748b">No summary has been generated yet.</p>`);
  }

  if (opts.include_action_items && detail.action_items.length) {
    text.push("ACTION ITEMS");
    html.push(`<h2 style="font-size:15px;margin:18px 0 6px">Action items</h2><ul style="margin:0;padding-left:20px">`);
    for (const a of detail.action_items) {
      const who = assigneeName(detail, a.assignee_participant_id);
      text.push(`- [${a.completed ? "x" : " "}] ${a.description}${who ? ` (${who})` : ""}`);
      html.push(
        `<li style="margin:2px 0">${a.completed ? "&#9745;" : "&#9744;"} ${esc(a.description)}${who ? ` <span style="color:#64748b">(${esc(who)})</span>` : ""}</li>`,
      );
    }
    html.push("</ul>");
    text.push("");
  }

  if (opts.include_highlights && detail.highlights.length) {
    text.push("HIGHLIGHTS");
    html.push(`<h2 style="font-size:15px;margin:18px 0 6px">Highlights</h2><ul style="margin:0;padding-left:20px">`);
    for (const h of detail.highlights) {
      text.push(`- ${h.title} [${formatClockMs(h.start_ms)}] ${url(h.start_ms)}`);
      html.push(`<li style="margin:2px 0"><a href="${esc(url(h.start_ms))}" style="${A}">${esc(h.title)}</a> <span style="color:#64748b;font-size:12px">${formatClockMs(h.start_ms)}</span></li>`);
    }
    html.push("</ul>");
    text.push("");
  }

  text.push("Sent with Fanthom");
  html.push(`<p style="margin-top:24px;color:#94a3b8;font-size:12px">Sent with Fanthom</p></div>`);
  return { subject, to, html: html.filter(Boolean).join("\n"), text: text.join("\n") };
}
