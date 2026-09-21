/** Download dispatcher for GET /api/meetings/:id/download (Phase 5 D). Pure. Owner: backend. */
import type { DownloadFile, DownloadFormat, MeetingDetail, Summary } from "@/lib/types";

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
  void detail;
  void format;
  void opts;
  throw new Error("TODO");
}

/** "Q4 Roadmap: Planning!" → "q4-roadmap-planning". */
export function slugify(title: string): string {
  void title;
  throw new Error("TODO");
}
