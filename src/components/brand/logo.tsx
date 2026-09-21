import Link from "next/link";
import { AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";

/** Fanthom mark: electric-blue rounded square with a waveform glyph + wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_20px_-2px_var(--brand)]",
        className,
      )}
      aria-hidden
    >
      <AudioLines className="size-4" strokeWidth={2.5} />
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-[17px]">Fanthom</span>
    </Link>
  );
}
