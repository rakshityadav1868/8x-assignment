import "server-only";
import { ZodError, type z } from "zod";
import type { ApiError } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import type { MeetingDetail } from "@/lib/types";
import { HttpError, NotFoundError, type ApiErrorCode } from "./errors";

export { HttpError, NotFoundError };

export function errorResponse(status: number, code: ApiErrorCode, error: string): Response {
  return Response.json({ error, code } satisfies ApiError, { status });
}

function zodMessage(err: ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof HttpError) return errorResponse(err.status, err.code, err.message);
  if (err instanceof ZodError) return errorResponse(400, "validation", zodMessage(err));
  console.error("[api] unhandled error", err);
  return errorResponse(500, "internal", "Something went wrong. Please try again.");
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

/** Wraps a route handler so every thrown error becomes a consistent `ApiError` response. */
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Parse + validate a JSON body. Empty body is treated as `{}`. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, "validation", "Request body must be valid JSON");
    }
  }
  return schema.parse(raw);
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return schema.parse(params);
}

export async function requireMeetingDetail(id: string): Promise<MeetingDetail> {
  const detail = await getRepo().getMeetingDetail(id);
  if (!detail) throw new NotFoundError("Meeting");
  return detail;
}

export async function requireMeeting(id: string) {
  const m = await getRepo().getMeeting(id);
  if (!m) throw new NotFoundError("Meeting");
  return m;
}

/** Absolute base URL for share / clip links: request origin (works on previews), else NEXT_PUBLIC_APP_URL. */
export function appOrigin(req: Request): string {
  try {
    return new URL(req.url).origin;
  } catch {
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  }
}

export const ok = () => Response.json({ ok: true as const });
