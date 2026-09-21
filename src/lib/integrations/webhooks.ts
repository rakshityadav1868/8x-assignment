/** Outgoing webhooks — REAL HTTP delivery (Phase 5 D). Server-only. Owner: backend. */
import "server-only";
import type { MeetingDetail, Summary, Webhook, WebhookDelivery, WebhookEvent, WebhookPayload } from "@/lib/types";

/** Build the JSON envelope for an event (absolute URLs from NEXT_PUBLIC_APP_URL / request origin). */
export function buildWebhookPayload(
  event: WebhookEvent,
  detail: MeetingDetail,
  summary: Summary | null,
  opts: { origin: string; deliveryId: string; test: boolean },
): WebhookPayload {
  void event;
  void detail;
  void summary;
  void opts;
  throw new Error("TODO");
}

/** `sha256=<hex HMAC-SHA256(secret, body)>` for header X-Fanthom-Signature. */
export function signWebhookBody(secret: string, body: string): string {
  void secret;
  void body;
  throw new Error("TODO");
}

/**
 * Reject non-http(s), credentials in URL, and private/loopback/link-local hosts (SSRF guard; localhost allowed
 * only when NODE_ENV=development). Returns an error message or null when OK.
 */
export function validateWebhookUrl(url: string): string | null {
  void url;
  throw new Error("TODO");
}

/**
 * POST payload (Content-Type application/json, User-Agent Fanthom-Webhooks/1.0, X-Fanthom-Event,
 * X-Fanthom-Signature), 8s timeout, no redirects followed. Never throws: failures become a delivery with
 * ok=false. Caller persists via repo.recordWebhookDelivery.
 */
export async function deliverWebhook(
  webhook: Webhook,
  payload: WebhookPayload,
): Promise<Omit<WebhookDelivery, "id" | "created_at">> {
  void webhook;
  void payload;
  throw new Error("TODO");
}

/** Fire `event` to every active webhook subscribed to it (used by the pipeline on meeting.ready). Never throws. */
export async function dispatchEvent(event: WebhookEvent, meetingId: string, origin: string): Promise<void> {
  void event;
  void meetingId;
  void origin;
  throw new Error("TODO");
}
