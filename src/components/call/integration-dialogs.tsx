"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Copy, Loader2, Mail, RefreshCw, Send, Hash } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/common/bits";
import { apiErrorMessage } from "@/hooks/use-api";
import { ROUTES } from "@/lib/routes";
import type {
  CrmLogsResponse,
  CrmPreviewResponse,
  CrmSyncResponse,
  EmailRecapRequest,
  EmailRecapResponse,
  SendToSlackResponse,
  SlackConfigResponse,
} from "@/lib/contracts";
import type { CrmProvider, CrmSyncLog, CrmSyncPreview, EmailRecap, SlackConfigView } from "@/lib/types";
import { ApiClientError, api, copyText } from "@/lib/ui/api";
import { timeAgo } from "@/lib/ui/time-ago";
import { cn } from "@/lib/utils";
import { useCall } from "./call-context";

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

export function SlackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { meeting, summaryTemplate } = useCall();
  const [config, setConfig] = useState<SlackConfigView | null>(null);
  const [configErr, setConfigErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendToSlackResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    api<SlackConfigResponse>(ROUTES.api.slack, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        setConfig(r.config);
        setConfigErr(null);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setConfigErr(apiErrorMessage(e));
      });
    return () => ctrl.abort();
  }, [open]);

  const send = async () => {
    setSending(true);
    try {
      const r = await api<SendToSlackResponse>(ROUTES.api.meetingSlack(meeting.id), {
        method: "POST",
        json: { template: summaryTemplate, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setResult(r);
      if (r.ok) toast.success(`Recap posted to ${config?.channel_label ?? "Slack"}`);
      else toast.error("Slack rejected the message", { description: r.error ?? `HTTP ${r.status_code}` });
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 409) setConfig((c) => (c ? { ...c, connected: false } : c));
      toast.error("Couldn't send to Slack", { description: apiErrorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  const notConnected = config && !config.connected;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setResult(null);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="size-4 text-sky-300" /> Send recap to Slack
          </DialogTitle>
          <DialogDescription>
            Posts the summary, action items and highlights through your Slack incoming webhook — a real message.
          </DialogDescription>
        </DialogHeader>
        {configErr ? (
          <ErrorState title="Slack settings unavailable" description={configErr} className="py-6" />
        ) : !config ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : notConnected ? (
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 text-sm">
            <p className="font-medium">Slack isn&apos;t connected yet</p>
            <p className="mt-1 text-muted-foreground">Paste an incoming-webhook URL in Settings → Integrations, then come back.</p>
            <Button asChild size="sm" className="mt-3">
              <Link href={ROUTES.pages.settingsTab("integrations")}>
                Open integrations <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : result ? (
          <div className="space-y-3">
            <p className={cn("flex items-center gap-1.5 text-sm", result.ok ? "text-emerald-300" : "text-red-300")}>
              {result.ok ? <CheckCircle2 className="size-4" /> : null}
              {result.ok ? `Delivered (HTTP ${result.status_code ?? 200})` : `Failed — ${result.error ?? `HTTP ${result.status_code}`}`}
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/80">
              {result.preview_text}
            </pre>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Posting to <span className="text-foreground">{config.channel_label ?? "your Slack channel"}</span>
              {config.webhook_url_masked && <span className="ml-1 font-mono text-[10px]">({config.webhook_url_masked})</span>}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="Add a note (optional)"
              aria-label="Note"
              className="min-h-20 w-full resize-none rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/50"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && config?.connected && (
            <Button onClick={send} disabled={sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />} Send to Slack
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// CRM sync (simulated, logged)
// ---------------------------------------------------------------------------

const CRM_LABEL: Record<CrmProvider, string> = { hubspot: "HubSpot", salesforce: "Salesforce" };

export function CrmDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { meeting } = useCall();
  const [provider, setProvider] = useState<CrmProvider>("hubspot");
  const [preview, setPreview] = useState<CrmSyncPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<CrmSyncLog[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    api<CrmPreviewResponse>(`${ROUTES.api.crm(meeting.id)}?provider=${provider}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        setPreview(r.preview);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(apiErrorMessage(e));
      });
    api<CrmLogsResponse>(`${ROUTES.api.crmLogs}?meeting_id=${encodeURIComponent(meeting.id)}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => setLogs(r.logs))
      .catch(() => setLogs([]));
    return () => ctrl.abort();
  }, [open, provider, meeting.id, nonce]);

  const sync = async () => {
    if (!preview) return;
    setSyncing(true);
    try {
      const r = await api<CrmSyncResponse>(ROUTES.api.crm(meeting.id), {
        method: "POST",
        json: { provider, fields: preview.fields },
      });
      setLogs((l) => [r.log, ...(l ?? [])]);
      toast.success(`${CRM_LABEL[provider]} sync ${r.log.status === "simulated" ? "simulated" : r.log.status}`, {
        description: r.log.message,
      });
    } catch (e) {
      toast.error("Sync failed", { description: apiErrorMessage(e) });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Sync to CRM</DialogTitle>
          <DialogDescription>
            Preview how this call maps onto CRM fields. CRM sign-in isn&apos;t connected in this demo, so syncing is
            simulated and recorded in the log below.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="CRM">
            {(Object.keys(CRM_LABEL) as CrmProvider[]).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={provider === p}
                onClick={() => {
                  if (p === provider) return;
                  setPreview(null);
                  setError(null);
                  setProvider(p);
                }}
                className={cn(
                  "h-7 rounded-full px-3 text-xs font-medium transition-colors",
                  provider === p ? "bg-white text-neutral-950" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {CRM_LABEL[p]}
              </button>
            ))}
          </div>
          {preview?.company_domain && <span className="text-xs text-muted-foreground">Company: {preview.company_domain}</span>}
          <span className="ml-auto rounded-full border border-amber-300/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-200/90">
            Simulated
          </span>
        </div>

        {error ? (
          <ErrorState
            title="Couldn't build the preview"
            description={error}
            onRetry={() => {
              setError(null);
              setNonce((n) => n + 1);
            }}
            className="py-6"
          />
        ) : !preview ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : preview.fields.length === 0 ? (
          <p className="rounded-xl border border-white/8 p-4 text-sm text-muted-foreground">Nothing to map for this call.</p>
        ) : (
          <div className="min-w-0 overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Fanthom</th>
                  <th className="px-3 py-2 font-medium">{CRM_LABEL[provider]} field</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {preview.fields.map((f, i) => (
                  <tr key={`${f.crm_object}.${f.crm_field}.${i}`} className="align-top">
                    <td className="px-3 py-2">
                      <span className="block">{f.label}</span>
                      <span className="text-[10px] text-muted-foreground">{f.source.replace("_", " ")}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-sky-300">
                      {f.crm_object}.{f.crm_field}
                    </td>
                    <td className="max-w-[280px] px-3 py-2 text-white/80">
                      <span className="line-clamp-4 whitespace-pre-wrap">{f.value || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sync log</h4>
          {logs === null ? (
            <Skeleton className="h-10 rounded-lg" />
          ) : logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No syncs yet for this call.</p>
          ) : (
            <ul className="space-y-1">
              {logs.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-xs">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      l.status === "failed" ? "bg-red-400" : l.status === "success" ? "bg-emerald-400" : "bg-amber-300",
                    )}
                  />
                  <span className="font-medium">{CRM_LABEL[l.provider]}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {l.field_count} fields · {l.message}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground" suppressHydrationWarning>
                    {timeAgo(l.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={sync} disabled={!preview || syncing || preview.fields.length === 0}>
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync to {CRM_LABEL[provider]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Email recap preview
// ---------------------------------------------------------------------------

export function EmailRecapDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { meeting, summaryTemplate } = useCall();
  const [opts, setOpts] = useState<Required<Omit<EmailRecapRequest, "template">>>({
    include_action_items: true,
    include_highlights: true,
    recipients: "all",
  });
  const [recap, setRecap] = useState<EmailRecap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    api<EmailRecapResponse>(ROUTES.api.emailRecap(meeting.id), {
      method: "POST",
      json: { template: summaryTemplate, ...opts },
      signal: ctrl.signal,
    })
      .then((r) => {
        setRecap(r.recap);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(apiErrorMessage(e));
      });
    return () => ctrl.abort();
  }, [open, opts, meeting.id, summaryTemplate, nonce]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-sky-300" /> Email recap preview
          </DialogTitle>
          <DialogDescription>
            What attendees would receive after the call. Preview only — no email provider is connected, so nothing is sent.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Send to</span>
            <Select value={opts.recipients} onValueChange={(v) => setOpts((o) => ({ ...o, recipients: v as typeof o.recipients }))}>
              <SelectTrigger size="sm" className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All attendees</SelectItem>
                <SelectItem value="internal">Internal only</SelectItem>
                <SelectItem value="external">External only</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={opts.include_action_items}
              onCheckedChange={(c) => setOpts((o) => ({ ...o, include_action_items: c }))}
            />
            Action items
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={opts.include_highlights} onCheckedChange={(c) => setOpts((o) => ({ ...o, include_highlights: c }))} />
            Highlights
          </label>
        </div>
        {error ? (
          <ErrorState
            title="Couldn't build the recap"
            description={error}
            onRetry={() => {
              setError(null);
              setNonce((n) => n + 1);
            }}
            className="py-6"
          />
        ) : !recap ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/8">
            <div className="space-y-1 border-b border-white/8 bg-white/[0.03] px-3 py-2 text-xs">
              <p>
                <span className="inline-block w-14 text-muted-foreground">To</span>
                {recap.to.length ? recap.to.join(", ") : <span className="text-muted-foreground">No matching recipients</span>}
              </p>
              <p>
                <span className="inline-block w-14 text-muted-foreground">Subject</span>
                <span className="font-medium">{recap.subject}</span>
              </p>
            </div>
            <iframe
              title="Email recap preview"
              sandbox=""
              srcDoc={recap.html}
              className="h-[46dvh] w-full bg-white"
            />
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!recap}
            onClick={async () => {
              if (recap && (await copyText(`Subject: ${recap.subject}\n\n${recap.text}`))) toast.success("Recap copied");
            }}
          >
            <Copy /> Copy text
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
