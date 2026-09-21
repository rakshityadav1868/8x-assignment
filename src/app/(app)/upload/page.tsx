import type { Metadata } from "next";
import { getCapabilities } from "@/lib/capabilities";
import { UploadView } from "@/components/upload/upload-view";

export const metadata: Metadata = { title: "Upload · Fanthom" };
export const dynamic = "force-dynamic";

export default function UploadPage() {
  const caps = getCapabilities();
  return <UploadView capabilities={caps} />;
}
