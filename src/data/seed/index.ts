/**
 * Seed data barrel — GENERATED (database agent regenerates this when the seed changes).
 *
 * Static JSON imports so Vercel bundles every file (no fs / glob at runtime).
 * Format: see ARCHITECTURE.md §3 "Seed data files" and `SeedMeetingFile` / `SeedWorkspaceFile` in `@/lib/types`.
 */
import type { SeedMeetingFile, SeedWorkspaceFile } from "@/lib/types";

import workspace from "./workspace.json";
import fixtureA from "./meetings/fixture-a.json";
import fixtureB from "./meetings/fixture-b.json";

export const seedWorkspace = workspace as unknown as SeedWorkspaceFile;

export const seedMeetings = [fixtureA, fixtureB] as unknown as SeedMeetingFile[];
