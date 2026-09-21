"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TZ } from "@/lib/ui/format";

const TZ_COOKIE = "fanthom_tz";
const TzContext = createContext<string>(DEFAULT_TZ);

/** The viewer's IANA zone as resolved on the server — use it for every date string (SSR-safe). */
export function useTimeZone(): string {
  return useContext(TzContext);
}

/**
 * Provides the server-resolved zone and keeps the `fanthom_tz` cookie in sync with the browser.
 * First visit: the server rendered in the fallback zone, so refresh once after setting the cookie.
 */
export function TimeZoneProvider({ tz, children }: { tz: string; children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    let browserTz: string | undefined;
    try {
      browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!browserTz) return;
    const current = document.cookie.match(/(?:^|; )fanthom_tz=([^;]*)/)?.[1];
    if (!current || decodeURIComponent(current) !== browserTz) {
      document.cookie = `${TZ_COOKIE}=${encodeURIComponent(browserTz)}; path=/; max-age=31536000; samesite=lax`;
    }
    if (browserTz !== tz) {
      // Guard against loops if the server can't honour the zone.
      try {
        if (sessionStorage.getItem("fanthom_tz_refreshed") === browserTz) return;
        sessionStorage.setItem("fanthom_tz_refreshed", browserTz);
      } catch {}
      router.refresh();
    }
  }, [router, tz]);
  return <TzContext.Provider value={tz}>{children}</TzContext.Provider>;
}
