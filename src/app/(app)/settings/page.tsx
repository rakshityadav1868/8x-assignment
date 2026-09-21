import type { Metadata } from "next";
import { getCapabilities } from "@/lib/capabilities";
import { SettingsView } from "@/components/settings/settings-view";
import { parseSettingsTab } from "@/components/settings/tabs";

export const metadata: Metadata = { title: "Settings · Fanthom" };
export const dynamic = "force-dynamic";

export default async function SettingsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tab } = await props.searchParams;
  return <SettingsView capabilities={getCapabilities()} initialTab={parseSettingsTab(tab)} />;
}
