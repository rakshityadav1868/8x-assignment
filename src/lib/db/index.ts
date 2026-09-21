import "server-only";
import { supabaseAvailable } from "@/lib/capabilities";
import type { Repo } from "./repo";
import { createSeedRepo } from "./seed-repo";
import { createSupabaseRepo } from "./supabase-repo";

export type { Repo } from "./repo";

// Cached per server instance so the seed store's in-memory mutations persist between requests.
const globalForRepo = globalThis as unknown as { __fanthomRepo?: Repo };

/** Picks Supabase when its env vars exist, else the in-memory seed store. */
export function getRepo(): Repo {
  if (!globalForRepo.__fanthomRepo) {
    globalForRepo.__fanthomRepo = supabaseAvailable() ? createSupabaseRepo() : createSeedRepo();
  }
  return globalForRepo.__fanthomRepo;
}
