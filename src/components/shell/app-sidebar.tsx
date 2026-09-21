"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { ROUTES } from "@/lib/routes";
import type { MeResponse } from "@/lib/contracts";
import { useApi } from "@/lib/ui/use-api";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, type NavItem } from "./nav-items";
import { SidebarFolders } from "./sidebar-folders";

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active =
    item.href === "/calls"
      ? pathname === "/calls" || pathname.startsWith("/calls/")
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
      >
        {active && <span className="absolute inset-y-1.5 -left-3 w-0.5 rounded-full bg-primary shadow-[0_0_8px_var(--brand)]" />}
        <Icon className={cn("size-4", active && "text-primary")} />
        {item.label}
      </Link>
    </li>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const [main, ...rest] = NAV_SECTIONS;
  const section = (s: (typeof NAV_SECTIONS)[number]) => (
    <div key={s.label}>
      <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">{s.label}</div>
      <ul className="flex flex-col gap-0.5">
        {s.items.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </ul>
    </div>
  );
  return (
    <nav className="flex flex-col gap-5">
      {section(main)}
      <SidebarFolders onNavigate={onNavigate} />
      {rest.map(section)}
    </nav>
  );
}

/** "Demo workspace" card: who you are, which workspace (GET /api/me; falls back gracefully). */
export function WorkspaceBadge({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useApi<MeResponse>(ROUTES.api.me, { tags: ["me"] });
  const name = data?.user.name ?? "Demo user";
  const demo = !data || data.auth_mode === "demo";
  return (
    <Link
      href={ROUTES.pages.team}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-xl border border-border bg-white/[0.03] p-2.5 text-xs transition-colors hover:bg-white/[0.05]"
    >
      <ParticipantAvatar person={{ name, color: data?.member.color ?? "#60a5fa" }} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{name}</div>
        <div className="truncate text-muted-foreground">{data?.workspace.name ?? "Fanthom workspace"}</div>
      </div>
      {demo && (
        <span
          title="Demo workspace — no sign-in; data resets on redeploy"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/8 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-200/90"
        >
          <FlaskConical className="size-2.5" /> Demo
        </span>
      )}
    </Link>
  );
}

export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur md:flex">
      <div className="px-6 pb-5 pt-4">
        <Logo href="/calls" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
        <SidebarNav />
      </div>
      <div className="border-t border-sidebar-border p-3">
        <WorkspaceBadge />
      </div>
    </aside>
  );
}
