import type { Metadata } from "next";
import { getRepo } from "@/lib/db";
import { getCapabilities } from "@/lib/capabilities";
import { GlobalAsk } from "@/components/summary/global-ask";

export const metadata: Metadata = { title: "Ask Fanthom · Fanthom" };
export const dynamic = "force-dynamic";

export default async function AskPage() {
  const meetings = await getRepo()
    .listMeetings()
    .catch(() => []);
  const titles = Object.fromEntries(meetings.map((m) => [m.id, m.title]));
  return <GlobalAsk meetingTitles={titles} callCount={meetings.length} aiMode={getCapabilities().ai_mode} />;
}
