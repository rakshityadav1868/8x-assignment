/** Settings tab keys (plain module so the server page can validate `?tab=`). */
export const SETTINGS_TAB_KEYS = ["general", "recording", "notifications", "integrations"] as const;
export type SettingsTab = (typeof SETTINGS_TAB_KEYS)[number];

export function parseSettingsTab(v: unknown): SettingsTab {
  return (SETTINGS_TAB_KEYS as readonly string[]).includes(v as string) ? (v as SettingsTab) : "general";
}
