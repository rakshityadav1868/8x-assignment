import type { Metadata } from "next";
import { getRepo } from "@/lib/db";
import { ClipView } from "@/components/public/clip-view";
import { PublicGate } from "@/components/public/gate";

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
  if (!clip) return <PublicGate kind="not_found" />;
  return <ClipView clip={clip} />;
}
