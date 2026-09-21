import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import type { FolderWithCount } from "@/lib/types";
import { LibraryView } from "@/components/calls/library-view";

export const dynamic = "force-dynamic";

async function loadFolder(id: string): Promise<{ folder: FolderWithCount | null; known: boolean }> {
  try {
    return { folder: await getRepo().getFolder(id), known: true };
  } catch {
    // Repo not ready (e.g. 501 during rollout) — let the client resolve the folder.
    return { folder: null, known: false };
  }
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const { folder } = await loadFolder(id);
  return { title: `${folder?.name ?? "Folder"} · Fanthom` };
}

export default async function FolderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { folder, known } = await loadFolder(id);
  if (known && !folder) notFound();
  return <LibraryView key={id} folderId={id} folder={folder} nowIso={new Date().toISOString()} />;
}
