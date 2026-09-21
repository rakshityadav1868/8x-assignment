import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_TZ, isValidTimeZone } from "./format";

export const TZ_COOKIE = "fanthom_tz";

/** Viewer's IANA time zone from the cookie set by <TimeZoneCookie/>; falls back to DEFAULT_TZ. */
export async function getViewerTimeZone(): Promise<string> {
  const v = (await cookies()).get(TZ_COOKIE)?.value;
  const tz = v ? decodeURIComponent(v) : null;
  return isValidTimeZone(tz) ? tz : DEFAULT_TZ;
}
