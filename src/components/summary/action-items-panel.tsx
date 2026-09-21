"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Copy, Handshake, Loader2, Plus, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoModeBadge, EmptyState, TimestampChip } from "@/components/common/bits";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { useCall } from "@/components/call/call-context";
import { usePlayerStore } from "@/hooks/use-player";
import { ROUTES } from "@/lib/routes";
import type { ActionItemResponse, CommitmentsResponse } from "@/lib/contracts";
import { api, copyText } from "@/lib/ui/api";
import { firstName, formatClock } from "@/lib/ui/format";
import type { ActionItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const UNASSIGNED = "__none";

export function ActionItemsPanel() {
  const { meeting, actionItems, setActionItems, participantById, participants, readOnly } = useCall();
  const store = usePlayerStore();
  const [adding, setAdding] = useState(false);

  const sorted = useMemo(
    () =>
      [...actionItems].sort(
        (a, b) => Number(a.completed) - Number(b.completed) || (a.timestamp_ms ?? Infinity) - (b.timestamp_ms ?? Infinity),
      ),
    [actionItems],
  );
  const done = actionItems.filter((a) => a.completed).length;

  const toggle = async (item: ActionItem, completed: boolean) => {
    setActionItems((prev) => prev.map((a) => (a.id === item.id ? { ...a, completed } : a)));
    try {
      const r = await api<ActionItemResponse>(ROUTES.api.actionItem(item.id), { method: "PATCH", json: { completed } });
      setActionItems((prev) => prev.map((a) => (a.id === item.id ? r.action_item : a)));
    } catch {
      setActionItems((prev) => prev.map((a) => (a.id === item.id ? { ...a, completed: !completed } : a)));
      toast.error("Couldn't update action item");
    }
  };

  const remove = async (item: ActionItem) => {
    setActionItems((prev) => prev.filter((a) => a.id !== item.id));
    try {
      await api(ROUTES.api.actionItem(item.id), { method: "DELETE" });
      toast.success("Action item removed");
    } catch {
      setActionItems((prev) => [...prev, item]);
      toast.error("Couldn't remove action item");
    }
  };

  const copyAll = async () => {
    const text = sorted
      .map((a) => {
        const who = a.assignee_participant_id ? participantById.get(a.assignee_participant_id)?.name : null;
        return `- [${a.completed ? "x" : " "}] ${a.description}${who ? ` — ${who}` : ""}${a.timestamp_ms != null ? ` (${formatClock(a.timestamp_ms)})` : ""}`;
      })
      .join("\n");
    if (await copyText(`Action items — ${meeting.title}\n${text}`)) toast.success("Action items copied");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <p className="text-[13px] font-medium">
          {actionItems.length} action {actionItems.length === 1 ? "item" : "items"}
          {actionItems.length > 0 && <span className="ml-1.5 text-muted-foreground">· {done} done</span>}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copyAll} disabled={!actionItems.length}>
            <Copy /> Copy all
          </Button>
          {!readOnly && (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={adding}>
              <Plus /> Add
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3 [scrollbar-width:thin]">
        {adding && <AddActionItem onDone={() => setAdding(false)} />}
        {sorted.length === 0 && !adding ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No action items"
            description="Nothing was assigned in this call. Add one to keep track of follow-ups."
          />
        ) : (
          <ul className="space-y-1">
            {sorted.map((a) => {
              const who = a.assignee_participant_id ? participantById.get(a.assignee_participant_id) : undefined;
              return (
                <li
                  key={a.id}
                  className="group flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.035]"
                >
                  <Checkbox
                    checked={a.completed}
                    disabled={readOnly}
                    onCheckedChange={(c) => toggle(a, c === true)}
                    aria-label={a.completed ? "Mark as not done" : "Mark as done"}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[13.5px] leading-relaxed transition-colors",
                        a.completed ? "text-muted-foreground line-through decoration-white/30" : "text-white/90",
                      )}
                    >
                      {a.description}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {who ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ParticipantAvatar person={who} size="xs" />
                          {who.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="size-3.5" /> Unassigned
                        </span>
                      )}
                      {a.timestamp_ms != null && <TimestampChip ms={a.timestamp_ms} onClick={() => store.seek(a.timestamp_ms!)} />}
                      {a.user_generated && <span className="rounded-full border border-white/10 px-1.5 text-[10px]">Added by you</span>}
                    </div>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label="Delete action item"
                      onClick={() => remove(a)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-red-300 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!readOnly && participants.length > 0 && <Commitments />}
      </div>
    </div>
  );
}

function AddActionItem({ onDone }: { onDone: () => void }) {
  const { meeting, participants, setActionItems } = useCall();
  const store = usePlayerStore();
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState<string>(UNASSIGNED);
  const [atCurrent, setAtCurrent] = useState(true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const r = await api<ActionItemResponse>(ROUTES.api.actionItems(meeting.id), {
        method: "POST",
        json: {
          description: text.trim(),
          assignee_participant_id: assignee === UNASSIGNED ? null : assignee,
          timestamp_ms: atCurrent ? Math.round(store.getState().currentMs) : null,
        },
      });
      setActionItems((prev) => [...prev, r.action_item]);
      toast.success("Action item added");
      onDone();
    } catch (e) {
      toast.error("Couldn't add action item", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="animate-rise mb-3 rounded-xl border border-sky-400/25 bg-primary/[0.06] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        placeholder="What needs to happen?"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        maxLength={1000}
        aria-label="Action item description"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Assignee">
            <SelectValue>{assignee === UNASSIGNED ? "Unassigned" : participants.find((p) => p.id === assignee)?.name}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {participants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={atCurrent} onCheckedChange={(c) => setAtCurrent(c === true)} className="size-3.5" />
          Link to current moment
        </label>
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!text.trim() || saving}>
            {saving && <Loader2 className="animate-spin" />} Add
          </Button>
        </div>
      </div>
    </form>
  );
}

function Commitments() {
  const { meeting, participants, participantById, speakerStats, noteAiMode } = useCall();
  const store = usePlayerStore();
  const [pid, setPid] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CommitmentsResponse | null>(null);
  const talkers = speakerStats.filter((s) => s.talk_ms > 0).map((s) => participantById.get(s.participant_id)!).filter(Boolean);
  const people = talkers.length ? talkers : participants;

  const ask = async (id: string) => {
    setPid(id);
    setLoading(true);
    setResult(null);
    try {
      const r = await api<CommitmentsResponse>(ROUTES.api.commitments(meeting.id), {
        method: "POST",
        json: { participant_id: id },
      });
      setResult(r);
      noteAiMode(r.ai_mode);
    } catch (e) {
      toast.error("Couldn't look that up", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setLoading(false);
    }
  };
  const person = pid ? participantById.get(pid) : undefined;

  return (
    <section className="mt-6 rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Handshake className="size-4 text-sky-300" />
        <span className="text-[13px] font-medium">What did</span>
        <Select value={pid} onValueChange={ask}>
          <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Person">
            <SelectValue placeholder="someone">{person?.name}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[13px] font-medium">commit to?</span>
        {result?.ai_mode === "demo" && <DemoModeBadge className="ml-auto" />}
        {result && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => {
              setResult(null);
              setPid("");
            }}
            className={cn("flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10", result.ai_mode !== "demo" && "ml-auto")}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {loading && (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      )}
      {result && person && (
        <div className="animate-rise mt-3">
          {result.commitments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{firstName(person.name)} didn’t make any explicit commitments.</p>
          ) : (
            <ul className="space-y-1.5">
              {result.commitments.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/85">
                  <ParticipantAvatar person={person} size="xs" className="mt-0.5" />
                  <span className="flex-1">
                    {c.text}
                    {c.due && <span className="ml-1.5 rounded-full bg-amber-300/10 px-1.5 text-[11px] text-amber-200">{c.due}</span>}
                  </span>
                  <TimestampChip ms={c.start_ms} onClick={() => store.seek(c.start_ms)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
