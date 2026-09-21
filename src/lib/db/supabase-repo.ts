import type { Repo } from "./repo";

/**
 * PLACEHOLDER (Phase 0) — the database agent replaces this with the real Supabase implementation.
 * Every method throws until then, so misuse is loud rather than silently empty.
 */
export function createSupabaseRepo(): Repo {
  return new Proxy({} as Repo, {
    get(_t, prop) {
      return () => Promise.reject(new Error(`SupabaseRepo.${String(prop)} not implemented yet`));
    },
  });
}
