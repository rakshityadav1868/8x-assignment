"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Database,
  Download,
  FileText,
  Hash,
  Inbox,
  Keyboard,
  Link2,
  Mail,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MeetingTypeBadge } from "@/components/common/bits";
import { useTimeZone } from "@/components/common/time-zone";
import { AvatarStack, ParticipantAvatar } from "@/components/common/participant-avatar";
import { FollowUpEmailDialog } from "@/components/summary/follow-up-email-dialog";
import { usePlayerStore } from "@/hooks/use-player";
import { ROUTES } from "@/lib/routes";
import type { UpdateMeetingResponse } from "@/lib/contracts";
import { MEETING_TYPE_LABELS, TEMPLATE_BY_KEY, defaultTemplateFor } from "@/lib/templates";
import { api, copyText } from "@/lib/ui/api";
import { formatClock, formatDuration, longDate, timeOfDay } from "@/lib/ui/format";
import { MEETING_TYPES, type MeetingType } from "@/lib/types";
import { useCall } from "./call-context";
import { ShareDialog } from "./share-dialog";
import { CrmDialog, EmailRecapDialog, SlackDialog } from "./integration-dialogs";

export function CallHeader({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const { meeting, setMeeting, participants, setSummaryTemplate, summaryTemplate, summaries, readOnly } = useCall();
  const store = usePlayerStore();
  const [emailOpen, setEmailOpen] = useState(false);
  const [dialog, setDialog] = useState<"slack" | "crm" | "recap" | null>(null);
  const tz = useTimeZone();
  const when = meeting.recording_start ?? meeting.scheduled_start ?? meeting.created_at;
  const external = participants.filter((p) => p.is_external).length;

  const changeType = async (type: MeetingType) => {
    if (type === meeting.meeting_type) return;
    const prev = meeting;
    setMeeting({ ...meeting, meeting_type: type });
    try {
      const r = await api<UpdateMeetingResponse>(ROUTES.api.meeting(meeting.id), {
        method: "PATCH",
        json: { meeting_type: type },
      });
      setMeeting(r.meeting);
      const tpl = defaultTemplateFor(type);
      const hasCached = summaries.some((s) => s.template === tpl);
      setSummaryTemplate(tpl);
      toast.success(`Meeting type set to ${MEETING_TYPE_LABELS[type]}`, {
        description: `Summary switched to the ${TEMPLATE_BY_KEY[tpl].name} template${hasCached ? "" : " — generating"}.`,
      });
    } catch (e) {
      setMeeting(prev);
      toast.error("Couldn't change meeting type", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const copyMoment = async () => {
    const ms = store.getState().currentMs;
    const url = `${window.location.origin}${ROUTES.pages.callAt(meeting.id, ms)}`;
    if (await copyText(url)) toast.success(`Link to ${formatClock(ms)} copied`);
  };

  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        {!readOnly && (
          <Button asChild variant="ghost" size="icon-sm" className="mt-0.5 shrink-0" aria-label="Back to My Calls">
            <Link href={ROUTES.pages.calls}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="text-balance text-lg font-semibold leading-tight tracking-[-0.02em] md:text-xl">{meeting.title}</h1>
          <div className="-mx-1 mt-1.5 flex h-6 flex-nowrap items-center gap-x-2.5 overflow-x-auto whitespace-nowrap px-1 text-xs text-muted-foreground [scrollbar-width:none] *:shrink-0 md:h-auto md:flex-wrap md:gap-y-1.5 md:overflow-visible">
            <span suppressHydrationWarning>
              {longDate(new Date(when), tz)} · {timeOfDay(new Date(when), tz)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> {formatDuration(meeting.duration_sec)}
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 hover:bg-white/[0.06]">
                  <AvatarStack people={participants} max={5} size="xs" />
                  <span className="hidden sm:inline">
                    {participants.length} {participants.length === 1 ? "person" : "people"}
                    {external > 0 && ` · ${external} external`}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                <p className="flex items-center gap-1.5 px-1.5 pb-1 text-xs font-medium text-muted-foreground">
                  <Users className="size-3.5" /> Attendees
                </p>
                <ul className="max-h-72 overflow-y-auto">
                  {participants.map((p) => (
                    <li key={p.id} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
                      <ParticipantAvatar person={p} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{p.name}</p>
                        {p.email && <p className="truncate text-[11px] text-muted-foreground">{p.email}</p>}
                      </div>
                      {p.is_external && (
                        <span className="rounded-full border border-amber-300/20 px-1.5 text-[10px] text-amber-200/90">External</span>
                      )}
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
            {readOnly ? (
              <MeetingTypeBadge type={meeting.meeting_type} />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-0.5 rounded-full hover:opacity-90" aria-label="Meeting type">
                    <MeetingTypeBadge type={meeting.meeting_type} className="pr-1.5" />
                    <ChevronDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Meeting type · picks the default summary template
                  </DropdownMenuLabel>
                  {MEETING_TYPES.map((t) => (
                    <DropdownMenuItem key={t} onSelect={() => changeType(t)}>
                      {MEETING_TYPE_LABELS[t]}
                      {t === meeting.meeting_type && <Check className="ml-auto size-3.5 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {meeting.synthetic && (
              <span
                className="rounded-full border border-white/10 px-1.5 text-[10px]"
                title="Seed recording generated with text-to-speech voices; timestamps are exact."
              >
                Synthetic audio
              </span>
            )}
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex shrink-0 items-center gap-1.5 pl-9 md:pl-0">
          <ShareDialog />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" className="size-8 rounded-full" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => setEmailOpen(true)}>
                <Mail /> Draft follow-up email
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={copyMoment}>
                <Link2 /> Copy link at current time
              </DropdownMenuItem>
              <DownloadsSub meetingId={meeting.id} hasMedia={!!meeting.media_url} template={summaryTemplate} />
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Send &amp; sync
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setDialog("slack")}>
                <Hash /> Send to Slack
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("crm")}>
                <Database /> Sync to CRM
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("recap")}>
                <Inbox /> Email recap preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onShowShortcuts}>
                <Keyboard /> Keyboard shortcuts <DropdownMenuShortcut>?</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <FollowUpEmailDialog open={emailOpen} onOpenChange={setEmailOpen} />
          <SlackDialog open={dialog === "slack"} onOpenChange={(o) => setDialog(o ? "slack" : null)} />
          <CrmDialog open={dialog === "crm"} onOpenChange={(o) => setDialog(o ? "crm" : null)} />
          <EmailRecapDialog open={dialog === "recap"} onOpenChange={(o) => setDialog(o ? "recap" : null)} />
        </div>
      )}
    </header>
  );
}

const DOWNLOADS: { format: string; label: string; ext: string }[] = [
  { format: "transcript_txt", label: "Transcript", ext: "TXT" },
  { format: "transcript_srt", label: "Subtitles", ext: "SRT" },
  { format: "transcript_vtt", label: "Subtitles", ext: "VTT" },
  { format: "transcript_md", label: "Transcript", ext: "Markdown" },
];

function DownloadsSub({ meetingId, hasMedia, template }: { meetingId: string; hasMedia: boolean; template: string }) {
  const item = (href: string, children: React.ReactNode) => (
    <DropdownMenuItem asChild key={href}>
      <a href={href} download>
        {children}
      </a>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Download className="size-4" /> Download
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {DOWNLOADS.map((d) =>
          item(
            ROUTES.api.download(meetingId, d.format),
            <span className="flex w-full items-center gap-2">
              <FileText className="size-4" /> {d.label}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{d.ext}</span>
            </span>,
          ),
        )}
        <DropdownMenuSeparator />
        {item(
          ROUTES.api.download(meetingId, "summary_md", { template }),
          <span className="flex w-full items-center gap-2">
            <FileText className="size-4" /> Summary
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">Markdown</span>
          </span>,
        )}
        {hasMedia &&
          item(
            ROUTES.api.download(meetingId, "recording"),
            <span className="flex w-full items-center gap-2">
              <Download className="size-4" /> Recording
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">Media</span>
            </span>,
          )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
