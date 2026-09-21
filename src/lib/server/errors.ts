/**
 * Typed errors understood by the API error mapper (`src/lib/server/api.ts`).
 * Repos should throw `NotFoundError` for missing rows so handlers return 404 `not_found`.
 */
export type ApiErrorCode =
  | "not_found"
  | "forbidden"
  | "validation"
  | "llm_failed"
  | "transcription_unavailable"
  | "storage_unavailable"
  | "conflict"
  | "internal";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class NotFoundError extends HttpError {
  constructor(what = "Resource") {
    super(404, "not_found", `${what} not found`);
    this.name = "NotFoundError";
  }
}
