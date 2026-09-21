import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRepo } from "@/lib/db";
import { ClipView } from "@/components/public/clip-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/clip/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const clip = await getRepo()
    .getClipByToken(token)
    .catch(() => null);
  return {
    title: clip ? `${clip.highlight.title} · Fanthom clip` : "Clip · Fanthom",
    robots: { index: false },
  };
}

export default async function ClipPage(props: PageProps<"/clip/[token]">) {
  const { token } = await props.params;
  const clip = await getRepo().getClipByToken(token);
  if (!clip) notFound();
  return <ClipView clip={clip} />;
}
