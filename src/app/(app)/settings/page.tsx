import type { Metadata } from "next";
import { getCapabilities } from "@/lib/capabilities";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings · Fanthom" };
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsView capabilities={getCapabilities()} />;
}
