import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE, DEMO_SESSION_MAX_AGE } from "@/lib/server/demo-session";

/**
 * Sets the demo-workspace cookie when someone opens the app (landing or any app page). API write routes
 * require it (see `route()` in src/lib/server/api.ts), so visitors who only hold a public /share or /clip
 * link can view but not mutate. Public pages and GET APIs are unaffected.
 */
export function proxy(request: NextRequest) {
  const res = NextResponse.next();
  if (!request.cookies.get(DEMO_SESSION_COOKIE)?.value) {
    res.cookies.set(DEMO_SESSION_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: DEMO_SESSION_MAX_AGE,
    });
  }
  return res;
}

export const config = {
  matcher: [
    "/",
    "/calls/:path*",
    "/search/:path*",
    "/upload/:path*",
    "/playlists/:path*",
    "/settings/:path*",
    "/ask/:path*",
    // Phase 5 app + marketing pages
    "/folders/:path*",
    "/record/:path*",
    "/calendar/:path*",
    "/insights/:path*",
    "/trackers/:path*",
    "/deals/:path*",
    "/team/:path*",
    "/welcome/:path*",
    "/pricing",
    "/features",
    "/integrations",
  ],
};
