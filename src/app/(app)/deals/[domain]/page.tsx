import type { Metadata } from "next";
import { DealDetailView } from "@/components/deals/deal-detail-view";

export const metadata: Metadata = { title: "Deal · Fanthom" };

export default async function DealPage(props: PageProps<"/deals/[domain]">) {
  const { domain } = await props.params;
  const d = decodeURIComponent(domain);
  return <DealDetailView key={d} domain={d} />;
}
