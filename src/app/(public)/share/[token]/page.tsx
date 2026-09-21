import type { Metadata } from "next";
import { getRepo } from "@/lib/db";
import { CallView } from "@/components/call/call-view";
import { PublicGate } from "@/components/public/gate";

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
  if (!detail) return <PublicGate kind="not_found" />;
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
  const publicDetail = { ...detail, meeting: { ...detail.meeting, share_token: token } };
  return <CallView detail={publicDetail} aiMode="live" initialSeconds={t} readOnly shareMode />;
}
