import "server-only";
import { getRepo } from "@/lib/db";
import { defaultTemplateFor } from "@/lib/templates";
import type { MeetingDetail, Summary, SummaryLanguage, SummaryTemplateKey, UserPrefs } from "@/lib/types";

/** Current user's prefs, or null while the repo doesn't implement them yet (501) / on any failure. */
export async function safePrefs(): Promise<UserPrefs | null> {
  try {
    return await getRepo().getPrefs();
  } catch {
    return null;
  }
}

/**
 * Which cached summary is "the" summary of a meeting (server-side default): prefs.default_template in
 * prefs.default_language, then that template in English, then the meeting type's default template, then General,
 * then the newest cached summary. Never generates (cache-only).
 */
export function chooseSummary(
  detail: Pick<MeetingDetail, "meeting" | "summaries">,
  opts: { template?: SummaryTemplateKey | null; language?: SummaryLanguage | null } = {},
): Summary | null {
  const all = detail.summaries.filter((s) => !s.custom_instructions);
  const pool = all.length ? all : detail.summaries;
  const find = (t: SummaryTemplateKey | null | undefined, lang?: SummaryLanguage | null) =>
    t ? (pool.find((s) => s.template === t && (!lang || s.language === lang)) ?? null) : null;
  return (
    find(opts.template, opts.language) ??
    find(opts.template, "en") ??
    find(opts.template) ??
    find(defaultTemplateFor(detail.meeting.meeting_type), opts.language) ??
    find(defaultTemplateFor(detail.meeting.meeting_type), "en") ??
    find("general", "en") ??
    pool[0] ??
    null
  );
}

/** chooseSummary with the current user's prefs (explicit template wins). */
export async function pickDefaultSummary(
  detail: Pick<MeetingDetail, "meeting" | "summaries">,
  explicit?: { template?: SummaryTemplateKey | null; language?: SummaryLanguage | null },
): Promise<Summary | null> {
  const prefs = explicit?.template ? null : await safePrefs();
  return chooseSummary(detail, {
    template: explicit?.template ?? prefs?.default_template ?? null,
    language: explicit?.language ?? prefs?.default_language ?? null,
  });
}

/** MeetingDetail + `default_summary_template` (prefs-aware). Use in API handlers and server components. */
export async function withDefaultSummary<T extends Pick<MeetingDetail, "meeting" | "summaries">>(
  detail: T,
): Promise<T & { default_summary_template: SummaryTemplateKey | null }> {
  const s = await pickDefaultSummary(detail);
  return { ...detail, default_summary_template: s?.template ?? null };
}
