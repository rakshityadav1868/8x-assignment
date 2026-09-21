"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, Clock, Keyboard, Link2, Mail, MoreHorizontal, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClientText, MeetingTypeBadge } from "@/components/common/bits";
import { AvatarStack, ParticipantAvatar } from "@/components/common/participant-avatar";
import { FollowUpEmailDialog } from "@/components/summary/follow-up-email-dialog";
import { usePlayerStore } from "@/hooks/use-player";
import { ROUTES, type UpdateMeetingResponse } from "@/lib/contracts";
import { MEETING_TYPE_LABELS, TEMPLATE_BY_KEY, defaultTemplateFor } from "@/lib/templates";
import { api, copyText } from "@/lib/ui/api";
import { formatClock, formatDuration, longDate, timeOfDay } from "@/lib/ui/format";
import { MEETING_TYPES, type MeetingType } from "@/lib/types";
import { useCall } from "./call-context";
import { ShareDialog } from "./share-dialog";

export function CallHeader({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const { meeting, setMeeting, participants, setSummaryTemplate, summaries, readOnly } = useCall();
  const store = usePlayerStore();
  const [emailOpen, setEmailOpen] = useState(false);
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
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
            <ClientText render={() => `${longDate(new Date(when))} · ${timeOfDay(new Date(when))}`} placeholderWidth="18ch" />
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onShowShortcuts}>
                <Keyboard /> Keyboard shortcuts <DropdownMenuShortcut>?</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <FollowUpEmailDialog open={emailOpen} onOpenChange={setEmailOpen} />
        </div>
      )}
    </header>
  );
}
