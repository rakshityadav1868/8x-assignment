import Link from "next/link";
import { Lock, SearchX } from "lucide-react";
import { PillLink } from "@/components/brand/pill-link";

export function PublicGate({ kind, message }: { kind: "forbidden" | "not_found"; message?: string }) {
  const Icon = kind === "forbidden" ? Lock : SearchX;
  return (
    <div className="relative mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.25),transparent)] blur-2xl"
      />
      <div className="relative mb-5 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sky-300 shadow-[0_0_40px_-10px_var(--brand)]">
        <Icon className="size-6" />
      </div>
      <h1 className="relative text-2xl font-semibold tracking-[-0.03em]">
        {kind === "forbidden" ? "You need access" : "This link doesn’t work"}
      </h1>
      <p className="relative mt-2 text-sm text-muted-foreground">
        {kind === "forbidden"
          ? (message ?? "The owner restricted this recording.") + " Ask them to share it with you, or to switch the link to “Anyone with the link”."
          : "The link may have been disabled by its owner, or it’s mistyped."}
      </p>
      <div className="relative mt-7 flex items-center gap-3">
        {kind === "forbidden" && (
          <button
            type="button"
            disabled
            title="Access requests need real sign-in, which is stubbed in this demo"
            className="h-10 cursor-not-allowed rounded-full border border-white/10 bg-black/60 px-4 text-sm text-white/60"
          >
            Request access
          </button>
        )}
        <PillLink href="/">What is Fanthom?</PillLink>
      </div>
      <Link href="/calls" className="relative mt-6 text-xs text-muted-foreground hover:text-foreground">
        Go to the demo workspace
      </Link>
    </div>
  );
}
