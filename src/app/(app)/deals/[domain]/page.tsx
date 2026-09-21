import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DealDetailView } from "@/components/deals/deal-detail-view";
import { loadDeal } from "./load";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/deals/[domain]">): Promise<Metadata> {
  const { domain } = await props.params;
  const c = await loadDeal(domain).catch(() => null);
  return { title: c ? `${c.name} · Deals · Fanthom` : "Deal · Fanthom" };
}

export default async function DealPage(props: PageProps<"/deals/[domain]">) {
  const { domain } = await props.params;
  const d = decodeURIComponent(domain).trim().toLowerCase();
  let initial: Awaited<ReturnType<typeof loadDeal>> | undefined;
  try {
    initial = await loadDeal(d);
  } catch {
    initial = undefined; // repo failure → client-side load with error state
  }
  if (initial === null) notFound();
  return <DealDetailView key={d} domain={d} initial={initial ?? null} />;
}
