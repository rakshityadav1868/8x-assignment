"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoModeBadge, ErrorState } from "@/components/common/bits";
import { RichText } from "@/components/common/rich-text";
import { useCall } from "@/components/call/call-context";
import { ROUTES } from "@/lib/routes";
import type { FollowUpEmailResponse } from "@/lib/contracts";
import { api, copyText } from "@/lib/ui/api";

type Tone = "friendly" | "formal" | "concise";

export function FollowUpEmailDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const { meeting, noteAiMode } = useCall();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [tone, setTone] = useState<Tone>("friendly");
  const [email, setEmail] = useState<FollowUpEmailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTone, setLastTone] = useState<Tone | null>(null);

  const generate = async (t: Tone) => {
    setLoading(true);
    setError(null);
    setLastTone(t);
    try {
      const r = await api<FollowUpEmailResponse>(ROUTES.api.followUpEmail(meeting.id), {
        method: "POST",
        json: { tone: t },
      });
      setEmail(r);
      noteAiMode(r.ai_mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to draft email");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (o: boolean) => {
    setOpen(o);
  };
  // Controlled opening (from the "…" menu) also triggers the first draft.
  useEffect(() => {
    if (open && lastTone === null) void Promise.resolve().then(() => generate(tone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copy = async () => {
    if (!email) return;
    if (await copyText(`Subject: ${email.subject}\n\n${email.body_markdown}`)) toast.success("Email copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-primary" /> Follow-up email
            {email?.ai_mode === "demo" && <DemoModeBadge className="ml-1" />}
          </DialogTitle>
          <DialogDescription>A recap draft for “{meeting.title}”, grounded in the transcript.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Select
            value={tone}
            onValueChange={(v) => {
              setTone(v as Tone);
              void generate(v as Tone);
            }}
          >
            <SelectTrigger size="sm" aria-label="Tone">
              <SelectValue>{tone[0].toUpperCase() + tone.slice(1)}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
              <SelectItem value="concise">Concise</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => generate(tone)} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : undefined} /> Redraft
          </Button>
        </div>
        <div className="max-h-[55dvh] min-h-48 overflow-y-auto rounded-xl border border-white/8 bg-black/30 p-4">
          {loading || (!email && !error) ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ) : error ? (
            <ErrorState title="Couldn't draft the email" description={error} onRetry={() => generate(tone)} />
          ) : email ? (
            <div className="animate-rise">
              <p className="text-xs text-muted-foreground">Subject</p>
              <p className="mb-3 text-sm font-medium">{email.subject}</p>
              <RichText text={email.body_markdown} className="text-[13.5px] leading-relaxed text-white/85" />
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={copy} disabled={!email || loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Copy />} Copy email
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
