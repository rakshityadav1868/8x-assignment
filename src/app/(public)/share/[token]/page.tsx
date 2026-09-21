import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getRepo } from "@/lib/db";
import { ShareView } from "@/components/public/share-view";
import { getCapabilities } from "@/lib/capabilities";
import { PublicGate } from "@/components/public/gate";
import { withDefaultSummary } from "@/lib/server/summaries";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/share/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const d = await getRepo()
    .getMeetingDetailByShareToken(token)
    .catch(() => null);
  const ok = d && d.meeting.share_access === "anyone_with_link";
  return {
    title: ok ? `${d.meeting.title} · Shared via Fanthom` : "Shared call · Fanthom",
    robots: { index: false },
  };
}

export default async function SharePage(props: PageProps<"/share/[token]">) {
  const [{ token }, sp] = await Promise.all([props.params, props.searchParams]);
  const detail = await getRepo().getMeetingDetailByShareToken(token);
  if (!detail) notFound();
  if (detail.meeting.share_access !== "anyone_with_link") {
    return (
      <PublicGate
        kind="forbidden"
        message={
          detail.meeting.share_access === "same_domain"
            ? "This recording is only available to people in the owner’s workspace."
            : "This recording is only available to people the owner invited."
        }
      />
    );
  }
  const tRaw = Array.isArray(sp.t) ? sp.t[0] : sp.t;
  const t = tRaw != null && /^\d+(\.\d+)?$/.test(tRaw) ? Number(tRaw) : null;
  // Strip workspace-internal bits the public page doesn't need.
  const publicDetail = await withDefaultSummary({ ...detail, meeting: { ...detail.meeting, share_token: token } });
  return (
    <ShareView token={token} detail={publicDetail} initialSeconds={t} sync={getCapabilities().data_mode === "seed"} />
  );
}
