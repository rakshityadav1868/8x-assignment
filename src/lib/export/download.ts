/** Download dispatcher for GET /api/meetings/:id/download (Phase 5 D). Pure. Owner: backend. */
import type { DownloadFile, DownloadFormat, MeetingDetail, Summary } from "@/lib/types";
import { summaryToMarkdown } from "./summary";
import { meetingDateIso, transcriptToMarkdown, transcriptToSrt, transcriptToTxt, transcriptToVtt } from "./transcript";

/** "Q4 Roadmap: Planning!" → "q4-roadmap-planning". */
export function slugify(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || "meeting";
}

const TEXT_FORMATS = {
  transcript_txt: { ext: "txt", type: "text/plain; charset=utf-8" },
  transcript_srt: { ext: "srt", type: "application/x-subrip; charset=utf-8" },
  transcript_vtt: { ext: "vtt", type: "text/vtt; charset=utf-8" },
  transcript_md: { ext: "md", type: "text/markdown; charset=utf-8" },
  summary_md: { ext: "md", type: "text/markdown; charset=utf-8" },
} as const satisfies Record<Exclude<DownloadFormat, "recording">, { ext: string; type: string }>;

/**
 * Build the file for a text format. Filenames: `<slugified-title>-<yyyy-mm-dd>.{txt|srt|vtt|md}`
 * (summary: `-summary.md`). content_type: text/plain | application/x-subrip | text/vtt | text/markdown, all
 * `; charset=utf-8`. `recording` is not handled here (route redirects to media_url) → throws.
 */
export function buildDownload(
  detail: MeetingDetail,
  format: Exclude<DownloadFormat, "recording">,
  opts: { summary?: Summary | null; callUrl?: string },
): DownloadFile {
  const spec = TEXT_FORMATS[format as keyof typeof TEXT_FORMATS];
  if (!spec) throw new Error(`Unsupported download format: ${format}`);
  const iso = meetingDateIso(detail.meeting);
  const day = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 10) : null;
  const base = [slugify(detail.meeting.title), day].filter(Boolean).join("-");

  let body: string;
  switch (format) {
    case "transcript_txt":
      body = transcriptToTxt(detail);
      break;
    case "transcript_srt":
      body = transcriptToSrt(detail);
      break;
    case "transcript_vtt":
      body = transcriptToVtt(detail);
      break;
    case "transcript_md":
      body = transcriptToMarkdown(detail, opts.callUrl);
      break;
    case "summary_md":
      body = summaryToMarkdown(detail, opts.summary ?? null, opts.callUrl);
      break;
  }
  return {
    filename: `${base}${format === "summary_md" ? "-summary" : ""}.${spec.ext}`,
    content_type: spec.type,
    body,
  };
}

/** RFC 6266 Content-Disposition with an ASCII fallback + UTF-8 filename*. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
