import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { getCapabilities } from "@/lib/capabilities";
import { CallView } from "@/components/call/call-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/calls/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const m = await getRepo()
    .getMeeting(id)
    .catch(() => null);
  return { title: m ? `${m.title} · Fanthom` : "Call · Fanthom" };
}

export default async function CallPage(props: PageProps<"/calls/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const detail = await getRepo().getMeetingDetail(id);
  if (!detail) notFound();
  const tRaw = Array.isArray(sp.t) ? sp.t[0] : sp.t;
  const t = tRaw != null && /^\d+(\.\d+)?$/.test(tRaw) ? Number(tRaw) : null;
  return <CallView key={id} detail={detail} aiMode={getCapabilities().ai_mode} initialSeconds={t} />;
}
