import { TimeZoneProvider } from "@/components/common/time-zone";
import { Logo } from "@/components/brand/logo";
import { getViewerTimeZone } from "@/lib/ui/tz-server";

/** Focused onboarding shell: no sidebar, soft glow, logo top-left. */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const tz = await getViewerTimeZone();
  return (
    <TimeZoneProvider tz={tz}>
      <div className="relative min-h-dvh overflow-x-clip">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(50%_60%_at_50%_0%,rgba(37,99,235,0.22),transparent_70%)]"
        />
        <header className="relative z-10 flex items-center px-5 py-4 md:px-8">
          <Logo href="/calls" />
        </header>
        <main className="relative z-10">{children}</main>
      </div>
    </TimeZoneProvider>
  );
}
