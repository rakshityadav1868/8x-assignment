import type { Repo } from "./repo";

/**
 * PLACEHOLDER (Phase 0) — the database agent replaces this with the real Seed implementation.
 * Every method throws until then, so misuse is loud rather than silently empty.
 */
export function createSeedRepo(): Repo {
  return new Proxy({} as Repo, {
    get(_t, prop) {
      return () => Promise.reject(new Error(`SeedRepo.${String(prop)} not implemented yet`));
    },
  });
}
