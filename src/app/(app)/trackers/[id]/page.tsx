import type { Metadata } from "next";
import { TrackerDetailView } from "@/components/trackers/tracker-detail-view";

export const metadata: Metadata = { title: "Tracker · Fanthom" };

export default async function TrackerPage(props: PageProps<"/trackers/[id]">) {
  const { id } = await props.params;
  return <TrackerDetailView key={id} id={id} />;
}
