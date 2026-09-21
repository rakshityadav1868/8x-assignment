"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "./nav-items";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            {section.label}
          </div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active =
                item.href === "/calls"
                  ? pathname === "/calls" || pathname.startsWith("/calls/")
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-1.5 -left-3 w-0.5 rounded-full bg-primary shadow-[0_0_8px_var(--brand)]" />
                    )}
                    <Icon className={cn("size-4", active && "text-primary")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 px-3 py-4 backdrop-blur md:flex">
      <div className="px-3 pb-6">
        <Logo href="/calls" />
      </div>
      <SidebarNav />
      <div className="mt-auto rounded-xl border border-border bg-white/[0.03] p-3 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Demo workspace</div>
        <div className="mt-0.5">Signed in as Alex Rivera</div>
      </div>
    </aside>
  );
}
