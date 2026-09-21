"use client";

import { useMemo, useState } from "react";
import { Loader2, Mail, MoreHorizontal, Search, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { ROUTES } from "@/lib/routes";
import type { InviteTeamResponse, ListTeamResponse, MeResponse, TeamMemberResponse } from "@/lib/contracts";
import { api } from "@/lib/ui/api";
import { errorMessage, useApi } from "@/lib/ui/use-api";
import type { TeamMember, TeamRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLE: Record<TeamRole, { label: string; desc: string; tone: string }> = {
  owner: { label: "Owner", desc: "Full control, billing and workspace settings", tone: "text-amber-200 bg-amber-300/10 ring-amber-300/20" },
  admin: { label: "Admin", desc: "Manage members, integrations and settings", tone: "text-sky-200 bg-sky-400/10 ring-sky-400/20" },
  member: { label: "Member", desc: "Record, view team calls and share", tone: "text-slate-200 bg-white/[0.06] ring-white/10" },
  guest: { label: "Guest", desc: "Only sees calls shared with them", tone: "text-violet-200 bg-violet-400/10 ring-violet-400/20" },
};
const ASSIGNABLE: Exclude<TeamRole, "owner">[] = ["admin", "member", "guest"];

function RoleBadge({ role }: { role: TeamRole }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ring-1 ring-inset", ROLE[role].tone)}>
      {ROLE[role].label}
    </span>
  );
}

export function TeamView() {
  const { data, error, loading, reload, setData } = useApi<ListTeamResponse>(ROUTES.api.team, { tags: ["team"] });
  const me = useApi<MeResponse>(ROUTES.api.me, { tags: ["me"] }).data;
  const [q, setQ] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const canManage = me ? me.member.role === "owner" || me.member.role === "admin" : false;
  const members = useMemo(() => data?.members ?? [], [data]);
  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "invited");
  const teams = useMemo(() => [...new Set(active.map((m) => m.team).filter(Boolean) as string[])].sort(), [active]);
  const shown = active.filter((m) => {
    if (teamFilter !== "all" && m.team !== teamFilter) return false;
    const n = q.trim().toLowerCase();
    return !n || `${m.name} ${m.email} ${m.title ?? ""} ${m.team ?? ""}`.toLowerCase().includes(n);
  });

  const replace = (m: TeamMember) => setData((d) => (d ? { members: d.members.map((x) => (x.id === m.id ? m : x)) } : d));

  const changeRole = async (m: TeamMember, role: Exclude<TeamRole, "owner">) => {
    const prev = m;
    replace({ ...m, role });
    try {
      const r = await api<TeamMemberResponse>(ROUTES.api.teamMember(m.id), { method: "PATCH", json: { role } });
      replace(r.member);
      toast.success(`${m.name} is now ${ROLE[role].label.toLowerCase() === "admin" ? "an admin" : `a ${ROLE[role].label.toLowerCase()}`}`);
    } catch (e) {
      replace(prev);
      toast.error("Couldn't change role", { description: errorMessage(e) });
    }
  };

  const remove = async (m: TeamMember) => {
    try {
      await api(ROUTES.api.teamMember(m.id), { method: "DELETE" });
      setData((d) => (d ? { members: d.members.filter((x) => x.id !== m.id) } : d));
      toast.success(m.status === "invited" ? `Invite to ${m.email} revoked` : `${m.name} removed from the workspace`);
      setRemoving(null);
    } catch (e) {
      toast.error("Couldn't remove", { description: errorMessage(e) });
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {me?.workspace.name ?? "Your workspace"}
            {data ? ` · ${active.length} member${active.length === 1 ? "" : "s"}${pending.length ? ` · ${pending.length} pending` : ""}` : ""}
          </p>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          disabled={!!me && !canManage}
          title={me && !canManage ? "Only owners and admins can invite" : undefined}
          className="h-9 rounded-full bg-white px-4 text-neutral-950 hover:bg-white/90"
        >
          <UserPlus /> Invite people
        </Button>
      </div>

      {loading ? (
        <div className="glass mt-8 divide-y divide-white/[0.05] rounded-2xl">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : error && !data ? (
        <div className="glass mt-8 rounded-2xl">
          <ErrorState title="Couldn't load your team" description={errorMessage(error)} onRetry={reload} />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="mt-8" aria-label="Pending invites">
              <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Pending invites
              </h2>
              <ul className="glass divide-y divide-white/[0.05] overflow-hidden rounded-2xl">
                {pending.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 p-3.5 sm:px-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-white/15 text-muted-foreground">
                      <Mail className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{m.email}</p>
                      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                        Invited {m.invited_at ? new Date(m.invited_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""} ·
                        waiting to join
                      </p>
                    </div>
                    <RoleBadge role={m.role} />
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Invite options for ${m.email}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => toast.info("Invite link re-sent", { description: "Demo: email sending is stubbed." })}>
                            <Mail /> Resend invite
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => void remove(m)}>
                            <X /> Revoke invite
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8" aria-label="Members">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search people, titles, teams…"
                  aria-label="Search members"
                  className="h-9 w-full rounded-full border border-border bg-white/[0.04] pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
                />
              </div>
              {teams.length > 1 && (
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
                  {["all", ...teams].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTeamFilter(t)}
                      className={cn(
                        "h-8 shrink-0 rounded-full border px-3 text-xs transition-colors",
                        teamFilter === t
                          ? "border-primary/40 bg-primary/12 text-sky-100"
                          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t === "all" ? "Everyone" : t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {shown.length === 0 ? (
              <div className="glass rounded-2xl">
                <EmptyState icon={Users} title={members.length ? "No one matches" : "It's just you so far"} description="Invite teammates to share calls, comment and build playlists together." />
              </div>
            ) : (
              <ul className="glass divide-y divide-white/[0.05] overflow-hidden rounded-2xl">
                {shown.map((m) => {
                  const isMe = me?.member.id === m.id;
                  const editable = canManage && !isMe && m.role !== "owner";
                  return (
                    <li key={m.id} className="flex items-center gap-3 p-3.5 sm:px-4">
                      <ParticipantAvatar person={{ name: m.name, color: m.color }} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          {m.name}
                          {isMe && <span className="rounded-full bg-white/[0.08] px-1.5 text-[10px] font-normal text-muted-foreground">You</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[m.title, m.team].filter(Boolean).join(" · ") || m.email}
                        </p>
                        <p className="hidden truncate text-[11px] text-muted-foreground/70 sm:block">{m.email}</p>
                      </div>
                      {editable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Change role for ${m.name}`}>
                              <RoleBadge role={m.role} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel>Role</DropdownMenuLabel>
                            <DropdownMenuRadioGroup value={m.role} onValueChange={(v) => void changeRole(m, v as Exclude<TeamRole, "owner">)}>
                              {ASSIGNABLE.map((r) => (
                                <DropdownMenuRadioItem key={r} value={r} className="items-start">
                                  <span>
                                    <span className="block">{ROLE[r].label}</span>
                                    <span className="block text-[11px] text-muted-foreground">{ROLE[r].desc}</span>
                                  </span>
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(m)}>
                              <Trash2 /> Remove from workspace
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span title={m.role === "owner" ? "The owner's role can't be changed" : undefined}>
                          <RoleBadge role={m.role} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Roles and invites are saved. Invite emails aren&apos;t sent in this demo workspace.
          </p>
        </>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        domain={me?.workspace.domain}
        onInvited={(added) => setData((d) => (d ? { members: [...d.members.filter((x) => !added.some((a) => a.id === x.id)), ...added] } : d))}
      />

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              They lose access to team calls. Calls they recorded stay in the workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => removing && void remove(removing)}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  domain,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  domain?: string;
  onInvited: (m: TeamMember[]) => void;
}) {
  const [text, setText] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("member");
  const [busy, setBusy] = useState(false);
  const emails = [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const valid = emails.filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const invalid = emails.filter((e) => !valid.includes(e));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid.length || invalid.length) return;
    setBusy(true);
    try {
      const r = await api<InviteTeamResponse>(ROUTES.api.teamInvite, { method: "POST", json: { emails: valid, role } });
      onInvited(r.members);
      toast.success(`Invited ${valid.length} ${valid.length === 1 ? "person" : "people"}`, {
        description: "Demo workspace: no email was sent — they appear under Pending invites.",
      });
      setText("");
      onOpenChange(false);
    } catch (err) {
      toast.error("Couldn't send invites", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Invite people</DialogTitle>
            <DialogDescription>They&apos;ll be able to see team calls, comment and share clips.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="invite-emails" className="text-xs font-medium text-muted-foreground">
              Email addresses
            </label>
            <textarea
              id="invite-emails"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={`jordan@${domain ?? "company.com"}, sam@${domain ?? "company.com"}`}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            {invalid.length > 0 ? (
              <p className="text-xs text-red-300">Not a valid email: {invalid.join(", ")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Separate with commas or new lines.</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Role</span>
            <Select value={role} onValueChange={(v) => setRole(v as Exclude<TeamRole, "owner">)}>
              <SelectTrigger className="w-full" aria-label="Role">
                <SelectValue>{ROLE[role].label}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper">
                {ASSIGNABLE.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE[r].label} <span className="text-muted-foreground">· {ROLE[r].desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !valid.length || invalid.length > 0}>
              {busy && <Loader2 className="animate-spin" />} Send {valid.length > 1 ? `${valid.length} invites` : "invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
