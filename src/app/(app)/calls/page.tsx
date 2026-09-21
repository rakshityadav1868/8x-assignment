import type { Metadata } from "next";
import { getRepo } from "@/lib/db";
import type { MeetingListItem, UpcomingMeeting } from "@/lib/types";
import { CallsView } from "@/components/calls/calls-view";

export const metadata: Metadata = { title: "My Calls · Fanthom" };
export const dynamic = "force-dynamic";

export default async function CallsPage() {
  let meetings: MeetingListItem[] = [];
  let upcoming: UpcomingMeeting[] = [];
  let error: string | null = null;
  try {
    const repo = getRepo();
    [meetings, upcoming] = await Promise.all([repo.listMeetings(), repo.listUpcoming()]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load calls";
  }
  return <CallsView meetings={meetings} upcoming={upcoming} error={error} />;
}
