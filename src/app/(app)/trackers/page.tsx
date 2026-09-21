import type { Metadata } from "next";
import { TrackersView } from "@/components/trackers/trackers-view";

export const metadata: Metadata = { title: "Trackers · Fanthom" };

export default function TrackersPage() {
  return <TrackersView />;
}
