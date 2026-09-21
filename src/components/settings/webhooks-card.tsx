"use client";

import { useState } from "react";
import {
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/routes";
import type {
  ListWebhookDeliveriesResponse,
  ListWebhooksResponse,
  WebhookDeliveryResponse,
  WebhookResponse,
} from "@/lib/contracts";
import { api, copyText } from "@/lib/ui/api";
import { errorMessage, useApi } from "@/lib/ui/use-api";
import { WEBHOOK_EVENTS, type Webhook, type WebhookDelivery, type WebhookEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, Monogram, StatusChip } from "./parts";

const EVENT_LABEL: Record<WebhookEvent, string> = {
  "meeting.ready": "Call ready (notes + action items)",
  "meeting.shared": "Call shared",
  "highlight.created": "Highlight / clip created",
  "action_item.completed": "Action item completed",
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatusCode({ code, ok }: { code: number | null; ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-10 items-center justify-center rounded-md px-1.5 font-mono text-[11px] tabular-nums",
        ok ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300",
      )}
    >
      {code === null || code === 0 ? "ERR" : code}
    </span>
  );
}

/** Real outgoing webhooks (Zapier / Make / your own endpoint): add, toggle, test, inspect deliveries. */
export function WebhooksCard() {
  const { data, error, loading, reload, setData } = useApi<ListWebhooksResponse>(ROUTES.api.webhooks, { tags: ["webhooks"] });
  const [adding, setAdding] = useState(false);
  const hooks = data?.webhooks ?? [];

  const replace = (w: Webhook) => setData((d) => (d ? { webhooks: d.webhooks.map((x) => (x.id === w.id ? w : x)) } : d));

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <Monogram tint="#60a5fa" icon={WebhookIcon} />
        <div className="min-w-0 flex-1 basis-52">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Webhooks</p>
            <StatusChip tone="live">Real</StatusChip>
          </div>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            POST a JSON payload to Zapier, Make or your own endpoint when a call is ready. Signed with{" "}
            <code className="break-all font-mono text-[11px]">X-Fanthom-Signature</code> (HMAC-SHA256).
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => setAdding(true)}>
            <Plus /> Add endpoint
          </Button>
        )}
      </div>

      {adding && (
        <AddWebhookForm
          onCancel={() => setAdding(false)}
          onCreated={(w) => {
            setData((d) => ({ webhooks: [w, ...(d?.webhooks ?? [])] }));
            setAdding(false);
          }}
        />
      )}

      <div className="border-t border-white/[0.06]">
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ) : error && !data ? (
          <p className="p-4 text-sm text-muted-foreground">
            {errorMessage(error, "Couldn't load webhooks")}{" "}
            <button type="button" onClick={reload} className="text-sky-300 hover:underline">
              Retry
            </button>
          </p>
        ) : hooks.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No endpoints yet. Add one and hit “Send test” to see a real delivery.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {hooks.map((w) => (
              <WebhookRow
                key={w.id}
                w={w}
                onChange={replace}
                onDelete={() => setData((d) => (d ? { webhooks: d.webhooks.filter((x) => x.id !== w.id) } : d))}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function AddWebhookForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (w: Webhook) => void }) {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["meeting.ready"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const u = new URL(url.trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    } catch {
      setErr("Enter a full URL, e.g. https://hooks.zapier.com/hooks/catch/…");
      return;
    }
    setBusy(true);
    try {
      const r = await api<WebhookResponse>(ROUTES.api.webhooks, {
        method: "POST",
        json: { url: url.trim(), description: description.trim() || null, events, active: true },
      });
      toast.success("Webhook added", { description: "Send a test to check your endpoint." });
      onCreated(r.webhook);
    } catch (e2) {
      setErr(errorMessage(e2, "Couldn't add webhook"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 border-t border-white/[0.06] bg-white/[0.015] p-4">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.zapier.com/hooks/catch/…"
          aria-label="Endpoint URL"
          inputMode="url"
          className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder="Label (optional)"
          aria-label="Label"
          className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
        />
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1.5 text-xs text-muted-foreground">Events</legend>
        {WEBHOOK_EVENTS.map((ev) => (
          <label key={ev} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={events.includes(ev)}
              onCheckedChange={(c) => setEvents((cur) => (c ? [...cur, ev] : cur.filter((x) => x !== ev)))}
            />
            <span>
              <code className="font-mono text-xs text-sky-200">{ev}</code>
              <span className="block text-[11px] text-muted-foreground">{EVENT_LABEL[ev]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {err && <p className="text-xs text-red-300">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !url.trim() || events.length === 0}>
          {busy && <Loader2 className="animate-spin" />} Add webhook
        </Button>
      </div>
    </form>
  );
}

function WebhookRow({ w, onChange, onDelete }: { w: Webhook; onChange: (w: Webhook) => void; onDelete: () => void }) {
  const [showSecret, setShowSecret] = useState(false);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const deliveries = useApi<ListWebhookDeliveriesResponse>(open ? ROUTES.api.webhookDeliveries(w.id) : null);

  const patch = async (body: Record<string, unknown>, msg?: string) => {
    try {
      const r = await api<WebhookResponse>(ROUTES.api.webhook(w.id), { method: "PATCH", json: body });
      onChange(r.webhook);
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error("Couldn't update webhook", { description: errorMessage(e) });
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api<WebhookDeliveryResponse>(ROUTES.api.webhookTest(w.id), { method: "POST", json: {} });
      const d = r.delivery;
      onChange({ ...w, last_status: d.status_code ?? 0, last_delivery_at: d.created_at });
      deliveries.setData((cur) => ({ deliveries: [d, ...(cur?.deliveries ?? [])] }));
      setOpen(true);
      if (d.ok) toast.success(`Test delivered · ${d.status_code}`, { description: `${w.url} answered in ${d.duration_ms} ms.` });
      else
        toast.error(`Test failed · ${d.status_code ?? "network error"}`, {
          description: d.error ?? "Your endpoint didn't return a 2xx status.",
        });
    } catch (e) {
      toast.error("Couldn't send test", { description: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  const del = async () => {
    try {
      await api(ROUTES.api.webhook(w.id), { method: "DELETE" });
      onDelete();
      toast.success("Webhook deleted");
    } catch (e) {
      toast.error("Couldn't delete webhook", { description: errorMessage(e) });
    }
  };

  const ok = w.last_status !== null && w.last_status >= 200 && w.last_status < 300;
  return (
    <li className="min-w-0 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-all font-mono text-[13px]">{w.url}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {w.description && <span className="mr-1">{w.description}</span>}
            {w.events.map((e) => (
              <span key={e} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-sky-200/90">
                {e}
              </span>
            ))}
            {w.last_status !== null && (
              <span className="ml-1 inline-flex items-center gap-1" suppressHydrationWarning>
                Last <StatusCode code={w.last_status} ok={ok} /> {w.last_delivery_at ? when(w.last_delivery_at) : ""}
              </span>
            )}
          </div>
        </div>
        <Switch checked={w.active} onCheckedChange={(c) => void patch({ active: c }, c ? "Webhook enabled" : "Webhook paused")} aria-label="Active" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Webhook options">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void patch({ rotate_secret: true }, "Signing secret rotated")}>
              <RefreshCw /> Rotate secret
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void del()}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 pl-2.5 pr-1 text-xs text-muted-foreground">
          <span className="shrink-0">Secret</span>
          <code className="min-w-0 truncate font-mono text-[11px] text-foreground/80">
            {showSecret ? w.secret : "whsec_••••••••••••"}
          </code>
          <button
            type="button"
            onClick={() => setShowSecret((s) => !s)}
            aria-label={showSecret ? "Hide secret" : "Show secret"}
            className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-white/10"
          >
            {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={async () => (await copyText(w.secret)) && toast.success("Secret copied")}
            aria-label="Copy secret"
            className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-white/10"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
        <Button size="sm" variant="outline" className="rounded-full" onClick={test} disabled={testing}>
          {testing ? <Loader2 className="animate-spin" /> : <Send />} Send test
        </Button>
        <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Deliveries <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {open && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/8">
          {deliveries.loading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : deliveries.error && !deliveries.data ? (
            <p className="p-3 text-xs text-muted-foreground">{errorMessage(deliveries.error)}</p>
          ) : (deliveries.data?.deliveries.length ?? 0) === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No deliveries yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-white/[0.05] overflow-y-auto">
              {deliveries.data!.deliveries.map((d) => (
                <DeliveryRow key={d.id} d={d} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function DeliveryRow({ d }: { d: WebhookDelivery }) {
  const [open, setOpen] = useState(false);
  let pretty = d.request_body;
  try {
    pretty = JSON.stringify(JSON.parse(d.request_body), null, 2);
  } catch {}
  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-white/[0.03]">
        <StatusCode code={d.status_code} ok={d.ok} />
        <code className="font-mono text-[11px] text-sky-200/90">{d.event}</code>
        {d.test && <span className="rounded bg-white/[0.06] px-1 text-[10px] text-muted-foreground">test</span>}
        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{d.duration_ms} ms</span>
        <span className="hidden shrink-0 text-muted-foreground sm:inline" suppressHydrationWarning>
          {when(d.created_at)}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-2 bg-black/20 px-3 pb-3 pt-1">
          {d.error && <p className="text-xs text-red-300">{d.error}</p>}
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Request body</p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-white/80">{pretty}</pre>
          {d.response_body && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Response</p>
              <pre className="max-h-32 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] text-white/70">{d.response_body}</pre>
            </>
          )}
        </div>
      )}
    </li>
  );
}
