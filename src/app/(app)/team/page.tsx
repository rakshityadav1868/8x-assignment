import type { Metadata } from "next";
import { TeamView } from "@/components/team/team-view";

export const metadata: Metadata = { title: "Team · Fanthom" };

export default function TeamPage() {
  return <TeamView />;
}
