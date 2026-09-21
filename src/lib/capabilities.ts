import "server-only";
import type { AiMode, Capabilities, DataMode } from "./types";

/**
 * Keyless-first capability detection. Server-only: never import from client components
 * (the client should call GET /api/capabilities or receive these as props).
 */
export function aiAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function aiMode(): AiMode {
  return aiAvailable() ? "live" : "demo";
}

export function transcriptionAvailable(): boolean {
  return !!(process.env.DEEPGRAM_API_KEY || process.env.ASSEMBLYAI_API_KEY);
}

export function supabaseAvailable(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function dataMode(): DataMode {
  return supabaseAvailable() ? "supabase" : "seed";
}

export function getCapabilities(): Capabilities {
  return { ai_mode: aiMode(), transcription: transcriptionAvailable(), data_mode: dataMode() };
}
