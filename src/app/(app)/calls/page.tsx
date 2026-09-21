import type { Metadata } from "next";
import { getRepo } from "@/lib/db";
import type { UpcomingMeeting } from "@/lib/types";
import { LibraryView } from "@/components/calls/library-view";

export const metadata: Metadata = { title: "My Calls · Fanthom" };
export const dynamic = "force-dynamic";

export default async function CallsPage() {
  let upcoming: UpcomingMeeting[] = [];
  try {
    upcoming = await getRepo().listUpcoming();
  } catch {
    // The strip is optional; the library itself loads client-side with its own error state.
  }
  return <LibraryView upcoming={upcoming} nowIso={new Date().toISOString()} />;
}
