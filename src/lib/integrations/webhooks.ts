/** Outgoing webhooks — REAL HTTP delivery (Phase 5 D). Server-only. Owner: backend. */
import "server-only";
import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ROUTES } from "@/lib/routes";
import { getRepo } from "@/lib/db";
import { newId } from "@/lib/server/ids";
import { pickDefaultSummary } from "@/lib/server/summaries";
import type { MeetingDetail, Summary, Webhook, WebhookDelivery, WebhookEvent, WebhookPayload } from "@/lib/types";

export const WEBHOOK_TIMEOUT_MS = 5000;
const MAX_RESPONSE_CHARS = 2048;

/** Build the JSON envelope for an event (absolute URLs from NEXT_PUBLIC_APP_URL / request origin). */
export function buildWebhookPayload(
  event: WebhookEvent,
  detail: MeetingDetail,
  summary: Summary | null,
  opts: { origin: string; deliveryId: string; test: boolean },
): WebhookPayload {
  const origin = opts.origin.replace(/\/+$/, "");
  const m = detail.meeting;
  const names = new Map(detail.participants.map((p) => [p.id, p.name]));
  return {
    id: opts.deliveryId,
    event,
    created_at: new Date().toISOString(),
    test: opts.test,
    data: {
      meeting: {
        id: m.id,
        title: m.title,
        meeting_type: m.meeting_type,
        recording_start: m.recording_start,
        duration_sec: m.duration_sec,
      },
      url: `${origin}${ROUTES.pages.call(m.id)}`,
      share_url: m.share_token && m.share_access === "anyone_with_link" ? `${origin}${ROUTES.pages.share(m.share_token)}` : null,
      participants: detail.participants.map((p) => ({ name: p.name, email: p.email, is_external: p.is_external })),
      summary_markdown: summary?.markdown ?? null,
      action_items: detail.action_items.map((a) => ({
        description: a.description,
        assignee: a.assignee_participant_id ? (names.get(a.assignee_participant_id) ?? null) : null,
        completed: a.completed,
      })),
      highlights: detail.highlights.map((h) => ({
        title: h.title,
        type: h.type,
        start_ms: h.start_ms,
        url: `${origin}${ROUTES.pages.clip(h.share_token)}`,
      })),
    },
  };
}

/** `sha256=<hex HMAC-SHA256(secret, body)>` for header X-Fanthom-Signature. */
export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

const isDev = () => process.env.NODE_ENV === "development";

function ipv4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved + broadcast
  );
}

function ipv6Private(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  if (/^::ffff:/.test(s)) return true; // hex-form mapped addresses: reject conservatively
  const first = parseInt(s.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // multicast
    s.startsWith("64:ff9b:") || // NAT64
    s.startsWith("2001:db8:") // documentation
  );
}

/** True when `ip` (v4 or v6 literal) is loopback / private / link-local / reserved. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip.replace(/^\[|\]$/g, ""));
  if (v === 4) return ipv4Private(ip);
  if (v === 6) return ipv6Private(ip);
  return false;
}

const LOCAL_HOST_RE = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;
const isLoopbackHost = (h: string) => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i.test(h);

/**
 * Reject non-https (http allowed only in development), credentials in URL, and private/loopback/link-local
 * hosts (SSRF guard; localhost allowed only when NODE_ENV=development). Returns an error message or null when OK.
 * `deliverWebhook` additionally checks the DNS-resolved addresses right before sending.
 */
export function validateWebhookUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return "Enter a valid URL.";
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isDev())) return "Webhook URLs must use https://";
  if (u.username || u.password) return "Webhook URLs must not contain credentials.";
  const host = u.hostname.toLowerCase();
  if (!host) return "Enter a valid URL.";
  if (isDev() && isLoopbackHost(host)) return null;
  if (LOCAL_HOST_RE.test(host) || (!host.includes(".") && !isIP(host.replace(/^\[|\]$/g, "")))) return "Webhook URLs must point to a public host.";
  if (isPrivateIp(host)) return "Webhook URLs must not point to private or loopback addresses.";
  if (u.port && !["443", "8443", "80", "8080"].includes(u.port)) return "Webhook URLs must use a standard port (443, 8443, 80, 8080).";
  return null;
}

/** Resolve the host and make sure none of its addresses are private (DNS-rebinding guard). */
async function resolvedHostError(url: string): Promise<string | null> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return null; // literal already checked
  if (isDev() && isLoopbackHost(host)) return null;
  try {
    const addrs = await lookup(host, { all: true, verbatim: true });
    if (!addrs.length) return `Could not resolve ${host}`;
    if (addrs.some((a) => isPrivateIp(a.address))) return "Webhook host resolves to a private address.";
    return null;
  } catch {
    return `Could not resolve ${host}`;
  }
}

/**
 * POST payload (Content-Type application/json, User-Agent Fanthom-Webhooks/1.0, X-Fanthom-Event,
 * X-Fanthom-Signature, X-Fanthom-Delivery), 5s timeout, no redirects followed. Never throws: failures become a
 * delivery with ok=false. Caller persists via repo.recordWebhookDelivery.
 */
export async function deliverWebhook(
  webhook: Webhook,
  payload: WebhookPayload,
): Promise<Omit<WebhookDelivery, "id" | "created_at">> {
  const body = JSON.stringify(payload);
  const started = Date.now();
  const base = { webhook_id: webhook.id, event: payload.event, test: payload.test, request_body: body };
  const fail = (error: string, status_code: number | null = null, response_body: string | null = null) => ({
    ...base,
    status_code,
    ok: false,
    response_body,
    error,
    duration_ms: Date.now() - started,
  });

  const invalid = validateWebhookUrl(webhook.url) ?? (await resolvedHostError(webhook.url));
  if (invalid) return fail(invalid);

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Fanthom-Webhooks/1.0",
        "X-Fanthom-Event": payload.event,
        "X-Fanthom-Delivery": payload.id,
        "X-Fanthom-Signature": signWebhookBody(webhook.secret, body),
      },
      body,
    });
    let text: string | null = null;
    try {
      text = (await res.text()).slice(0, MAX_RESPONSE_CHARS);
    } catch {
      text = null;
    }
    if (res.status >= 300 && res.status < 400) return fail(`Redirects are not followed (HTTP ${res.status}).`, res.status, text);
    if (!res.ok) return fail(`Endpoint responded with HTTP ${res.status}.`, res.status, text);
    return { ...base, status_code: res.status, ok: true, response_body: text, error: null, duration_ms: Date.now() - started };
  } catch (err) {
    const e = err as Error;
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return fail(timeout ? `Timed out after ${WEBHOOK_TIMEOUT_MS / 1000}s.` : `Network error: ${e?.message ?? "request failed"}`);
  }
}

/** Deliver + persist (updates last_status / last_delivery_at). Never throws; returns the stored delivery. */
export async function sendWebhook(
  webhook: Webhook,
  event: WebhookEvent,
  detail: MeetingDetail,
  summary: Summary | null,
  opts: { origin: string; test: boolean },
): Promise<WebhookDelivery | null> {
  try {
    const payload = buildWebhookPayload(event, detail, summary, { origin: opts.origin, deliveryId: newId("whd"), test: opts.test });
    const result = await deliverWebhook(webhook, payload);
    return await getRepo().recordWebhookDelivery(result);
  } catch (err) {
    console.error("[webhooks] delivery failed", webhook.id, err);
    return null;
  }
}

/** Fire `event` to every active webhook subscribed to it (used by the pipeline on meeting.ready). Never throws. */
export async function dispatchEvent(event: WebhookEvent, meetingId: string, origin: string): Promise<void> {
  try {
    const repo = getRepo();
    const hooks = (await repo.listWebhooks()).filter((w) => w.active && w.events.includes(event));
    if (!hooks.length) return;
    const detail = await repo.getMeetingDetail(meetingId);
    if (!detail) return;
    const summary = await pickDefaultSummary(detail);
    await Promise.allSettled(hooks.map((w) => sendWebhook(w, event, detail, summary, { origin, test: false })));
  } catch (err) {
    console.error("[webhooks] dispatch failed", event, meetingId, err);
  }
}
