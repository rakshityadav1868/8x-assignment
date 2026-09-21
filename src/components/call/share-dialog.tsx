"use client";

import { useState } from "react";
import { Building2, Check, Copy, Globe2, Link2, Link2Off, Loader2, Lock, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROUTES } from "@/lib/routes";
import type { CreateShareResponse } from "@/lib/contracts";
import { api, copyText } from "@/lib/ui/api";
import type { ShareAccess } from "@/lib/types";
import { useCall } from "./call-context";

const ACCESS: Record<ShareAccess, { label: string; desc: string; icon: typeof Globe2 }> = {
  anyone_with_link: { label: "Anyone with the link", desc: "No sign-in needed. Recording, transcript and summary.", icon: Globe2 },
  same_domain: { label: "People at your company", desc: "Only teammates on your workspace domain.", icon: Building2 },
  invited: { label: "Only people added", desc: "Invite specific people by email.", icon: Lock },
};

export function ShareDialog() {
  const { meeting, setMeeting } = useCall();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emails, setEmails] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = meeting.share_token ? `${origin}${ROUTES.pages.share(meeting.share_token)}` : null;

  const setShare = async (access: ShareAccess) => {
    setBusy(true);
    try {
      const invited = emails
        .split(/[\s,;]+/)
        .map((e) => e.trim())
        .filter((e) => /.+@.+\..+/.test(e));
      const r = await api<CreateShareResponse>(ROUTES.api.share(meeting.id), {
        method: "POST",
        json: { access, ...(access === "invited" && invited.length ? { invited_emails: invited } : {}) },
      });
      setMeeting({ ...meeting, share_token: r.share_token, share_access: r.access });
      return r;
    } catch (e) {
      toast.error("Couldn't update sharing", { description: e instanceof Error ? e.message : undefined });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    let link = url;
    if (!link) {
      const r = await setShare(meeting.share_access);
      if (!r) return;
      link = `${window.location.origin}${ROUTES.pages.share(r.share_token)}`;
    }
    if (await copyText(link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success("Share link copied", {
        description: meeting.share_access === "anyone_with_link" ? "Anyone with the link can view this call." : ACCESS[meeting.share_access].label,
      });
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await api(ROUTES.api.share(meeting.id), { method: "DELETE" });
      setMeeting({ ...meeting, share_token: null });
      toast.success("Link disabled", { description: "The old link no longer works." });
    } catch (e) {
      toast.error("Couldn't disable link", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const AccessIcon = ACCESS[meeting.share_access].icon;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-8 rounded-full bg-white px-3.5 text-neutral-950 hover:bg-white/90">
          <Share2 /> Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this call</DialogTitle>
          <DialogDescription>Send the recording, transcript and AI notes — they’ll land on the exact call page.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">General access</p>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sky-300">
              <AccessIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <Select value={meeting.share_access} onValueChange={(v) => setShare(v as ShareAccess)} disabled={busy}>
                <SelectTrigger size="sm" className="h-8 w-full" aria-label="Access">
                  <SelectValue>{ACCESS[meeting.share_access].label}</SelectValue>
                </SelectTrigger>
                <SelectContent position="popper">
                  {(Object.keys(ACCESS) as ShareAccess[]).map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACCESS[a].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">{ACCESS[meeting.share_access].desc}</p>
              {meeting.share_access !== "anyone_with_link" && (
                <p className="mt-1 text-[11px] text-amber-200/80">
                  Demo note: there’s no sign-in, so restricted links show a “request access” screen.
                </p>
              )}
            </div>
          </div>
          {meeting.share_access === "invited" && (
            <input
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              onBlur={() => emails.trim() && setShare("invited")}
              placeholder="Add emails, comma separated"
              className="mt-3 h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-sm outline-none focus:border-primary/50"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 text-[13px] text-muted-foreground">
            <Link2 className="size-3.5 shrink-0" />
            <span className="truncate">{url ?? "No link yet — copying creates one"}</span>
          </div>
          <Button onClick={copy} disabled={busy} className="h-9 rounded-lg">
            {busy ? <Loader2 className="animate-spin" /> : copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        {url && (
          <div className="flex items-center justify-between text-xs">
            <a href={url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
              Preview public page ↗
            </a>
            <button type="button" onClick={revoke} disabled={busy} className="inline-flex items-center gap-1 text-muted-foreground hover:text-red-300">
              <Link2Off className="size-3.5" /> Disable link
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
