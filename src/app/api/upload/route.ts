import { UploadRequest, type UploadResponse } from "@/lib/contracts";
import { getRepo } from "@/lib/db";
import { deepgramAvailable } from "@/lib/deepgram";
import { HttpError, parseBody, route } from "@/lib/server/api";
import { RECORDINGS_BUCKET, STORAGE_URL_PREFIX, createSignedUpload, safeFilename, storageClient } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/upload — creates a `processing` meeting and a Supabase signed upload URL.
 * 503 `storage_unavailable` without Supabase; 503 `transcription_unavailable` without DEEPGRAM_API_KEY.
 */
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, UploadRequest);
  storageClient(); // throws 503 storage_unavailable when Supabase isn't configured
  if (!deepgramAvailable()) {
    throw new HttpError(503, "transcription_unavailable", "Transcription needs a DEEPGRAM_API_KEY. Uploads are disabled in this demo until it's configured.");
  }
  const repo = getRepo();
  const now = new Date().toISOString();
  const meeting = await repo.createMeeting({
    title: body.title?.trim() || body.filename,
    meeting_type: "general",
    scheduled_start: null,
    scheduled_end: null,
    recording_start: now,
    recording_end: null,
    duration_sec: 0,
    media_url: null,
    media_kind: body.content_type.startsWith("video/") ? "video" : "audio",
    status: "processing",
    processing_stage: "awaiting_upload",
    processing_error: null,
    transcript_language: "en",
    share_token: null,
    share_access: "anyone_with_link",
    recorded_by: null,
    synthetic: false,
  });
  const path = `${meeting.id}/${safeFilename(body.filename)}`;
  const signed = await createSignedUpload(path);
  await repo.updateMeeting(meeting.id, { media_url: `${STORAGE_URL_PREFIX}${RECORDINGS_BUCKET}/${path}` });
  return Response.json(
    { meeting_id: meeting.id, bucket: RECORDINGS_BUCKET, path, signed_url: signed.signedUrl, token: signed.token } satisfies UploadResponse,
    { status: 201 },
  );
});
