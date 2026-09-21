import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackerDetailView } from "@/components/trackers/tracker-detail-view";
import { loadTrackerHits } from "./load";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/trackers/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const d = await loadTrackerHits(id).catch(() => null);
  return { title: d ? `${d.tracker.name} · Trackers · Fanthom` : "Tracker · Fanthom" };
}

export default async function TrackerPage(props: PageProps<"/trackers/[id]">) {
  const { id } = await props.params;
  // A repo failure falls back to client-side loading (with its error state); only a missing tracker is a 404.
  let initial: Awaited<ReturnType<typeof loadTrackerHits>> | undefined;
  try {
    initial = await loadTrackerHits(id);
  } catch {
    initial = undefined;
  }
  if (initial === null) notFound();
  return <TrackerDetailView key={id} id={id} initial={initial ?? null} />;
}
