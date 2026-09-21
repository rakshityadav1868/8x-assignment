import { TimeZoneProvider } from "@/components/common/time-zone";
import { getViewerTimeZone } from "@/lib/ui/tz-server";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { CommandPalette } from "@/components/shell/command-palette";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const tz = await getViewerTimeZone();
  return (
    <TimeZoneProvider tz={tz}>
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1">{children}</main>
      </div>
      <CommandPalette />
    </div>
    </TimeZoneProvider>
  );
}
