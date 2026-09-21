import { Logo } from "@/components/brand/logo";
import { PillLink } from "@/components/brand/pill-link";

export function PublicTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.06] bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <Logo href="/" />
      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-muted-foreground sm:inline">Shared with Fanthom · AI meeting notes</span>
        <PillLink href="/calls" className="h-9 text-[13px]">
          Open Fanthom
        </PillLink>
      </div>
    </header>
  );
}
