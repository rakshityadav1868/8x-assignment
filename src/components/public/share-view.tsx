"use client";

import { useCallback, useState } from "react";
import { CallView } from "@/components/call/call-view";
import { PublicGate } from "@/components/public/gate";
import { ROUTES } from "@/lib/routes";
import type { ApiClientError } from "@/lib/ui/api";
import type { MeetingDetail } from "@/lib/types";

/**
 * Public share view. In demo mode the API is the source of truth for access: if the owner restricted
 * or revoked the link on another instance, swap to the gate once GET /api/share/:token says so.
 */
export function ShareView({
  token,
  detail,
  initialSeconds,
  sync,
}: {
  token: string;
  detail: MeetingDetail;
  initialSeconds: number | null;
  sync: boolean;
}) {
  const [gate, setGate] = useState<{ kind: "forbidden" | "not_found"; message?: string } | null>(null);
  const onSyncError = useCallback((e: ApiClientError) => {
    if (e.status === 403) setGate({ kind: "forbidden", message: e.message });
    else if (e.status === 404) setGate({ kind: "not_found" });
  }, []);
  if (gate) return <PublicGate kind={gate.kind} message={gate.message} />;
  return (
    <CallView
      detail={detail}
      aiMode="live"
      initialSeconds={initialSeconds}
      readOnly
      shareMode
      syncUrl={sync ? ROUTES.api.shareAccess(token) : null}
      onSyncError={onSyncError}
    />
  );
}
