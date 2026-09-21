import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Primary / secondary pill CTAs from the style reference:
 * primary = white pill + small dark circular arrow; secondary = dark pill + bare arrow.
 */
export function PillLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const primary = variant === "primary";
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-10 items-center gap-2 rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        primary
          ? "bg-white pl-4 pr-1.5 text-neutral-950 hover:shadow-[0_0_24px_-4px_rgba(96,165,250,0.7)]"
          : "border border-white/10 bg-black/60 px-4 text-white hover:bg-white/10",
        className,
      )}
    >
      {children}
      {primary ? (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-neutral-950 text-white transition-transform group-hover:rotate-45">
          <ArrowUpRight className="size-3.5" />
        </span>
      ) : (
        <ArrowUpRight className="size-3.5 opacity-80 transition-transform group-hover:rotate-45" />
      )}
    </Link>
  );
}
