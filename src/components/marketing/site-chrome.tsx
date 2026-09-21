import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PillLink } from "@/components/brand/pill-link";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: ROUTES.pages.features, label: "Features" },
  { href: ROUTES.pages.integrations, label: "Integrations" },
  { href: ROUTES.pages.pricing, label: "Pricing" },
];

/** Floating centered pill nav shared by all marketing pages. */
export function SiteNav({ active }: { active?: string }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-4 py-4 md:px-8">
      <Logo />
      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-white/[0.08] bg-black/55 p-1 pl-4 text-sm shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl md:flex">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active === l.href ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-white/75 transition-colors hover:text-white",
              active === l.href && "bg-white/[0.08] text-white",
            )}
          >
            {l.label}
          </Link>
        ))}
        <PillLink href={ROUTES.pages.calls} className="ml-2 h-9">
          Open demo
        </PillLink>
      </nav>
      <div className="flex items-center gap-2 md:hidden">
        <details className="group relative">
          <summary
            aria-label="Menu"
            className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-black/60 text-white/80 [&::-webkit-details-marker]:hidden"
          >
            <Menu className="size-4" />
          </summary>
          <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-white/10 bg-[#0a0f1c]/95 p-1.5 shadow-2xl backdrop-blur-xl">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="block rounded-xl px-3 py-2 text-sm text-white/80 hover:bg-white/[0.06] hover:text-white">
                {l.label}
              </Link>
            ))}
          </div>
        </details>
        <PillLink href={ROUTES.pages.calls} className="h-9">
          Demo
        </PillLink>
      </div>
    </header>
  );
}

const FOOTER = [
  {
    title: "Product",
    links: [
      [ROUTES.pages.features, "Features"],
      [ROUTES.pages.integrations, "Integrations"],
      [ROUTES.pages.pricing, "Pricing"],
      [ROUTES.pages.calls, "Live demo"],
    ],
  },
  {
    title: "Capture",
    links: [
      [ROUTES.pages.record, "Record in browser"],
      [ROUTES.pages.calendar, "Calendar & auto-record"],
      [ROUTES.pages.upload, "Upload a recording"],
    ],
  },
  {
    title: "Understand",
    links: [
      [ROUTES.pages.search(), "Search every call"],
      [ROUTES.pages.ask, "Ask Fanthom"],
      [ROUTES.pages.insights, "Team insights"],
      [ROUTES.pages.deals, "Deals"],
    ],
  },
  {
    title: "Resources",
    links: [
      [`${ROUTES.pages.pricing}#faq`, "FAQ"],
      [ROUTES.pages.welcome, "Getting started"],
      [ROUTES.pages.settingsTab("integrations"), "Webhooks & Slack"],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] px-5 pb-10 pt-14">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <Logo className="text-white/90" />
          <p className="mt-3 max-w-xs text-sm text-white/45">
            The AI notetaker that takes you to the exact moment anything was said.
          </p>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map(([href, label]) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-white/65 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col items-center justify-between gap-2 border-t border-white/[0.05] pt-6 text-xs text-white/35 sm:flex-row">
        <p>© {2026} Fanthom · a demo meeting notetaker</p>
        <p>Built with Next.js, Claude and Deepgram.</p>
      </div>
    </footer>
  );
}

/** Page frame for secondary marketing pages: dark canvas, top glow, nav + footer. */
export function MarketingFrame({ active, children }: { active?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-[#03050b]">
      <SiteNav active={active} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(55%_55%_at_50%_0%,rgba(37,99,235,0.26),transparent_70%)]"
      />
      <main className="relative z-10">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function PageHero({ eyebrow, title, desc }: { eyebrow: string; title: React.ReactNode; desc: string }) {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-5 pt-32 text-center md:pt-40">
      <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-white/75 backdrop-blur">
        {eyebrow}
      </span>
      <h1
        className="animate-rise mt-6 text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-5xl md:text-6xl"
        style={{ animationDelay: "60ms" }}
      >
        {title}
      </h1>
      <p className="animate-rise mt-5 max-w-xl text-balance text-base text-white/60 md:text-lg" style={{ animationDelay: "120ms" }}>
        {desc}
      </p>
    </section>
  );
}
