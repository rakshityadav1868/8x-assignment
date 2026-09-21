import { TimeZoneProvider } from "@/components/common/time-zone";
import { getViewerTimeZone } from "@/lib/ui/tz-server";
import { PublicTopBar } from "@/components/public/public-top-bar";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const tz = await getViewerTimeZone();
  return (
    <TimeZoneProvider tz={tz}>
    <div className="flex min-h-dvh flex-col">
      <PublicTopBar />
      <main className="flex-1">{children}</main>
    </div>
    </TimeZoneProvider>
  );
}
