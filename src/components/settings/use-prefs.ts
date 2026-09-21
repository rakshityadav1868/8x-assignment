"use client";

import { toast } from "sonner";
import { ROUTES } from "@/lib/routes";
import type { PrefsResponse, UpdatePrefsRequest } from "@/lib/contracts";
import { api } from "@/lib/ui/api";
import { errorMessage, invalidate, useApi } from "@/lib/ui/use-api";

/** Server-backed user preferences with optimistic updates. */
export function usePrefs() {
  const q = useApi<PrefsResponse>(ROUTES.api.prefs, { tags: ["prefs"] });
  const update = async (patch: UpdatePrefsRequest, opts?: { quiet?: boolean; message?: string }) => {
    const prev = q.data;
    if (prev) q.setData({ prefs: { ...prev.prefs, ...patch } });
    try {
      const r = await api<PrefsResponse>(ROUTES.api.prefs, { method: "PATCH", json: patch });
      q.setData(r);
      if ("auto_record_rule" in patch || "calendar_connected" in patch) invalidate("calendar");
      if (!opts?.quiet) toast.success(opts?.message ?? "Settings saved", { id: "prefs", duration: 1400 });
      return true;
    } catch (e) {
      if (prev) q.setData(prev);
      toast.error("Couldn't save settings", { description: errorMessage(e) });
      return false;
    }
  };
  return { ...q, prefs: q.data?.prefs ?? null, update };
}
