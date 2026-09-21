"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiErrorMessage } from "@/hooks/use-api";
import { ROUTES } from "@/lib/routes";
import type { CreateTrackerRequest, TrackerResponse } from "@/lib/contracts";
import type { TrackerWithStats } from "@/lib/types";
import { api } from "@/lib/ui/api";
import { cn } from "@/lib/utils";

export const TRACKER_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];

/** Create / edit a keyword tracker. Keywords are chips: type and press Enter or comma. */
export function TrackerDialog({
  open,
  onOpenChange,
  tracker,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tracker?: TrackerWithStats | null;
  onSaved: (t: TrackerWithStats) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <TrackerForm tracker={tracker ?? null} onSaved={onSaved} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TrackerForm({
  tracker,
  onSaved,
  onCancel,
}: {
  tracker: TrackerWithStats | null;
  onSaved: (t: TrackerWithStats) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tracker?.name ?? "");
  const [description, setDescription] = useState(tracker?.description ?? "");
  const [keywords, setKeywords] = useState<string[]>(tracker?.keywords ?? []);
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState(tracker?.color ?? TRACKER_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const addKeywords = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setKeywords((prev) => {
      const seen = new Set(prev.map((k) => k.toLowerCase()));
      const next = [...prev];
      for (const p of parts) {
        if (!seen.has(p.toLowerCase()) && next.length < 50) {
          next.push(p.slice(0, 80));
          seen.add(p.toLowerCase());
        }
      }
      return next;
    });
    setDraft("");
  };

  const save = async () => {
    const all = draft.trim() ? [...keywords, draft.trim()] : keywords;
    if (!name.trim()) return toast.error("Name your tracker");
    if (all.length === 0) return toast.error("Add at least one keyword or phrase");
    setSaving(true);
    const body: CreateTrackerRequest = {
      name: name.trim(),
      description: description.trim() || null,
      keywords: [...new Set(all)],
      color,
    };
    try {
      const r = tracker
        ? await api<TrackerResponse>(ROUTES.api.tracker(tracker.id), { method: "PATCH", json: body })
        : await api<TrackerResponse>(ROUTES.api.trackers, { method: "POST", json: body });
      toast.success(tracker ? "Tracker updated" : "Tracker created", {
        description: `${r.tracker.hit_count} mentions across ${r.tracker.meeting_count} calls`,
      });
      onSaved(r.tracker);
    } catch (e) {
      toast.error("Couldn't save tracker", { description: apiErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{tracker ? "Edit tracker" : "New tracker"}</DialogTitle>
        <DialogDescription>
          Track words and phrases across every call — competitors, pricing, security asks. Matching is case-insensitive
          and whole-word.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Competitors"
            className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
          />
        </label>
        <div>
          <span className="mb-1 block text-xs text-muted-foreground">Keywords &amp; phrases</span>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-1.5 focus-within:border-primary/50">
            {keywords.map((k) => (
              <span key={k} className="inline-flex h-6 items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] pl-2 pr-1 text-xs">
                {k}
                <button
                  type="button"
                  onClick={() => setKeywords((prev) => prev.filter((x) => x !== k))}
                  aria-label={`Remove ${k}`}
                  className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              value={draft}
              onChange={(e) => {
                if (e.target.value.includes(",")) addKeywords(e.target.value);
                else setDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeywords(draft);
                } else if (e.key === "Backspace" && !draft && keywords.length) {
                  setKeywords((prev) => prev.slice(0, -1));
                }
              }}
              onBlur={() => addKeywords(draft)}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text");
                if (/[,\n]/.test(t)) {
                  e.preventDefault();
                  addKeywords(t);
                }
              }}
              placeholder={keywords.length ? "Add another…" : "Type a keyword and press Enter"}
              aria-label="Add keyword"
              className="h-6 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Description (optional)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="What this tracker is for"
            className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-primary/50"
          />
        </label>
        <div>
          <span className="mb-1.5 block text-xs text-muted-foreground">Color</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Color">
            {TRACKER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn(
                  "size-6 rounded-full ring-offset-2 ring-offset-[#0b1120] transition-transform hover:scale-110",
                  color === c && "ring-2 ring-white",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {tracker ? "Save changes" : "Create tracker"}
        </Button>
      </DialogFooter>
    </>
  );
}
