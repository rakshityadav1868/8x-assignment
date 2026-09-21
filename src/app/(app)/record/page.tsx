import type { Metadata } from "next";
import { getCapabilities } from "@/lib/capabilities";
import { RecordView } from "@/components/record/record-view";

export const metadata: Metadata = { title: "Record · Fanthom" };
export const dynamic = "force-dynamic";

export default function RecordPage() {
  return <RecordView capabilities={getCapabilities()} />;
}
