"use client";

import { useState } from "react";
import { ExternalLink, Hash, Loader2, Send, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/routes";
import type { SendToSlackResponse, SlackConfigResponse, UpdateSlackConfigRequest } from "@/lib/contracts";
import { api } from "@/lib/ui/api";
import { errorMessage, useApi } from "@/lib/ui/use-api";
import { Card, Monogram, StatusChip } from "./parts";

/** Slack via an incoming-webhook URL — real posts, no OAuth needed. The URL never comes back to the browser. */
export function SlackCard() {
  const { data, error, loading, reload, setData } = useApi<SlackConfigResponse>(ROUTES.api.slack, { tags: ["slack"] });
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const cfg = data?.config;

  const save = async (patch: UpdateSlackConfigRequest, msg?: string, key = "save") => {
    setBusy(key);
    try {
      const r = await api<SlackConfigResponse>(ROUTES.api.slack, { method: "PUT", json: patch });
      setData(r);
      if (msg) toast.success(msg);
      return true;
    } catch (e) {
      toast.error("Couldn't update Slack", { description: errorMessage(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^https:\/\/hooks\.slack\.com\//.test(url.trim())) {
      toast.error("That isn't a Slack incoming-webhook URL", { description: "It starts with https://hooks.slack.com/services/…" });
      return;
    }
    const ok = await save({ webhook_url: url.trim(), channel_label: channel.trim() || null }, "Slack connected", "connect");
    if (ok) {
      setUrl("");
      setChannel("");
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const r = await api<SendToSlackResponse>(ROUTES.api.slackTest, { method: "POST" });
      setPreview(r.preview_text);
      if (r.ok) toast.success("Test message posted to Slack", { description: cfg?.channel_label ?? undefined });
      else toast.error(`Slack rejected the message${r.status_code ? ` (${r.status_code})` : ""}`, { description: r.error ?? undefined });
    } catch (e) {
      toast.error("Couldn't reach Slack", { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const toggle = (k: keyof UpdateSlackConfigRequest, v: boolean) => {
    if (!cfg) return;
    setData({ config: { ...cfg, [k]: v } });
    void save({ [k]: v });
  };

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <Monogram mono="Sl" tint="#e01e5a" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Slack</p>
            {cfg?.connected ? <StatusChip tone="live">Connected</StatusChip> : <StatusChip tone="off">Not connected</StatusChip>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Post call recaps to a channel with an{" "}
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-sky-300 hover:underline"
            >
              incoming webhook <ExternalLink className="size-3" />
            </a>
            . Messages are really sent.
          </p>
        </div>
      </div>
      <div className="border-t border-white/[0.06] p-4">
        {loading ? (
          <Skeleton className="h-9 w-full" />
        ) : error && !data ? (
          <p className="text-sm text-muted-foreground">
            {errorMessage(error, "Couldn't load Slack settings")}{" "}
            <button type="button" onClick={reload} className="text-sky-300 hover:underline">
              Retry
            </button>
          </p>
        ) : cfg?.connected ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-muted-foreground">
                <Hash className="size-3" /> {cfg.channel_label ?? "Channel"} ·{" "}
                <code className="font-mono text-[11px] text-foreground/70">{cfg.webhook_url_masked}</code>
              </span>
              <Button size="sm" variant="outline" className="rounded-full" onClick={test} disabled={!!busy}>
                {busy === "test" ? <Loader2 className="animate-spin" /> : <Send />} Send test
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full text-muted-foreground"
                disabled={!!busy}
                onClick={() => void save({ webhook_url: null }, "Slack disconnected", "disconnect")}
              >
                <Unplug /> Disconnect
              </Button>
            </div>
            <div className="grid gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              {(
                [
                  ["auto_post_on_ready", "Post automatically when a call is ready"],
                  ["include_summary", "Include the summary"],
                  ["include_action_items", "Include action items"],
                  ["include_highlights", "Include highlights"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center justify-between gap-3 text-sm">
                  {label}
                  <Switch checked={cfg[k]} onCheckedChange={(c) => toggle(k, c)} aria-label={label} />
                </label>
              ))}
            </div>
            {preview && (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Last message sent</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2.5 font-mono text-[11px] text-white/75">{preview}</pre>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={connect} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
              aria-label="Slack webhook URL"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
            />
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              maxLength={80}
              placeholder="#sales-calls"
              aria-label="Channel label"
              className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
            />
            <Button type="submit" disabled={!!busy || !url.trim()} className="h-9">
              {busy === "connect" && <Loader2 className="animate-spin" />} Connect
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
