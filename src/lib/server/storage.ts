import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAvailable } from "@/lib/capabilities";
import { HttpError } from "./errors";

/** Supabase Storage bucket for uploaded recordings (private; read via long-lived signed URLs). */
export const RECORDINGS_BUCKET = process.env.SUPABASE_RECORDINGS_BUCKET || "recordings";

/** `media_url` placeholder stored between upload and processing; resolved to a signed URL by the pipeline. */
export const STORAGE_URL_PREFIX = "storage://";

const g = globalThis as unknown as { __fanthomStorage?: SupabaseClient };

export function storageClient(): SupabaseClient {
  if (!supabaseAvailable()) {
    throw new HttpError(
      503,
      "storage_unavailable",
      "Uploads need Supabase Storage (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). This demo is running on seed data.",
    );
  }
  g.__fanthomStorage ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return g.__fanthomStorage;
}

export function safeFilename(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (base || "recording").slice(-80);
}

export async function createSignedUpload(path: string) {
  const { data, error } = await storageClient().storage.from(RECORDINGS_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new HttpError(503, "storage_unavailable", `Could not create upload URL: ${error?.message ?? "unknown error"}`);
  return data; // { signedUrl, token, path }
}

/** Long-lived signed read URL (10 years) — used as the playable media_url and handed to Deepgram. */
export async function signedReadUrl(path: string): Promise<string> {
  const { data, error } = await storageClient().storage.from(RECORDINGS_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (error || !data) throw new Error(`Could not sign media URL: ${error?.message ?? "unknown error"} (did the upload finish?)`);
  return data.signedUrl;
}
