"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AtSign,
  Bell,
  Bot,
  CheckCheck,
  CircleCheck,
  MessageSquare,
  Share2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/routes";
import type { ListNotificationsResponse, MarkNotificationsReadResponse } from "@/lib/contracts";
import { api } from "@/lib/ui/api";
import { errorMessage, useApi } from "@/lib/ui/use-api";
import type { Notification, NotificationKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND: Record<NotificationKind, { icon: LucideIcon; tint: string }> = {
  meeting_ready: { icon: CircleCheck, tint: "text-emerald-300 bg-emerald-400/10" },
  mention: { icon: AtSign, tint: "text-sky-300 bg-sky-400/10" },
  shared_with_you: { icon: Share2, tint: "text-violet-300 bg-violet-400/10" },
  comment: { icon: MessageSquare, tint: "text-amber-300 bg-amber-400/10" },
  bot_status: { icon: Bot, tint: "text-blue-300 bg-blue-400/10" },
  invite: { icon: UserPlus, tint: "text-pink-300 bg-pink-400/10" },
};

function relTime(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Top-bar notification center: unread badge, list, mark read, deep links. Polls every 30s. */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { data, error, loading, reload, setData } = useApi<ListNotificationsResponse>(
    `${ROUTES.api.notifications}?limit=30`,
    { tags: ["notifications"], pollMs: 30_000 },
  );
  const unread = data?.unread_count ?? 0;
  const items = (data?.notifications ?? []).filter((n) => filter === "all" || !n.read_at);

  const markRead = async (body: { ids?: string[]; all?: boolean }) => {
    if (!data) return;
    const now = new Date().toISOString();
    const prev = data;
    setData({
      unread_count: body.all ? 0 : Math.max(0, data.unread_count - (body.ids ?? []).filter((id) => data.notifications.some((n) => n.id === id && !n.read_at)).length),
      notifications: data.notifications.map((n) => (body.all || body.ids?.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)),
    });
    try {
      const r = await api<MarkNotificationsReadResponse>(ROUTES.api.notificationsRead, { method: "POST", json: body });
      setData((d) => (d ? { ...d, unread_count: r.unread_count } : d));
    } catch (e) {
      setData(prev);
      toast.error("Couldn't mark as read", { description: errorMessage(e) });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-white shadow-[0_0_10px_var(--brand)]">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(380px,calc(100vw-1.5rem))] gap-0 p-0">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <div className="flex items-center gap-1">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs capitalize text-muted-foreground hover:text-foreground",
                  filter === f && "bg-white/[0.08] text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[min(440px,70dvh)] overflow-y-auto">
          {loading ? (
            <div className="space-y-4 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <p>{errorMessage(error, "Couldn't load notifications")}</p>
              <button type="button" onClick={reload} className="mt-2 text-xs text-sky-300 hover:underline">
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <Bell className="size-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">{filter === "unread" ? "You're all caught up" : "No notifications yet"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Ready calls, @mentions and shares show up here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  onOpen={() => {
                    if (!n.read_at) void markRead({ ids: [n.id] });
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
        {data && data.notifications.length > 0 && (
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-xs">
            <button
              type="button"
              disabled={unread === 0}
              onClick={() => markRead({ all: true })}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" /> Mark all as read
            </button>
            <Link
              href={ROUTES.pages.settingsTab("notifications")}
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              Settings
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ n, onOpen }: { n: Notification; onOpen: () => void }) {
  const k = KIND[n.kind] ?? KIND.meeting_ready;
  const Icon = k.icon;
  const inner = (
    <>
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", k.tint)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] leading-snug", n.read_at ? "text-muted-foreground" : "text-foreground")}>{n.title}</p>
        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground/70" suppressHydrationWarning>
          {n.actor_name ? `${n.actor_name} · ` : ""}
          {relTime(n.created_at)}
        </p>
      </div>
      {!n.read_at && <span aria-label="Unread" className="mt-2 size-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--brand)]" />}
    </>
  );
  const cls = "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]";
  return (
    <li>
      {n.href ? (
        <Link href={n.href} onClick={onOpen} className={cls}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} className={cls}>
          {inner}
        </button>
      )}
    </li>
  );
}
