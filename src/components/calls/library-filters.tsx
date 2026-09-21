"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  CircleCheck,
  Search,
  Star,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { MEETING_TYPE_LABELS } from "@/lib/templates";
import { MEETING_TYPES, type MeetingListItem, type MeetingSort, type MeetingType } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface LibraryFilterState {
  q: string;
  meeting_type?: MeetingType;
  participant?: string; // email or name
  participantLabel?: string;
  company?: string; // domain
  companyLabel?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
  has_action_items?: boolean;
  starred?: boolean;
  trash?: boolean;
  sort: MeetingSort;
}

export const EMPTY_FILTERS: LibraryFilterState = { q: "", sort: "newest" };

export function activeFilterCount(f: LibraryFilterState): number {
  return [f.meeting_type, f.participant, f.company, f.from || f.to, f.has_action_items, f.starred].filter(Boolean).length;
}

const SORT_LABEL: Record<MeetingSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  longest: "Longest",
  shortest: "Shortest",
  title: "Title A–Z",
};

function Chip({
  active,
  icon: Icon,
  children,
  onClear,
  ...rest
}: {
  active?: boolean;
  icon: typeof Tag;
  children: React.ReactNode;
  onClear?: () => void;
} & React.ComponentProps<"button">) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full border text-xs transition-colors",
        active
          ? "border-primary/40 bg-primary/12 text-sky-100"
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
      )}
    >
      <button type="button" {...rest} className={cn("inline-flex h-full items-center gap-1.5 pl-3", active && onClear ? "pr-1" : "pr-3")}>
        <Icon className={cn("size-3.5", active && "text-sky-300")} />
        {children}
        {!active && <ChevronDown className="size-3 opacity-60" />}
      </button>
      {active && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear filter"
          className="mr-1 flex size-6 items-center justify-center rounded-full hover:bg-white/10"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

function Toggle({
  active,
  icon: Icon,
  children,
  onClick,
  tone = "primary",
}: {
  active?: boolean;
  icon: typeof Tag;
  children: React.ReactNode;
  onClick: () => void;
  tone?: "primary" | "danger";
}) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
        active
          ? tone === "danger"
            ? "border-red-400/30 bg-red-400/10 text-red-200"
            : "border-primary/40 bg-primary/12 text-sky-100"
          : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Facet options derived from the unfiltered library. */
export function useFacets(all: MeetingListItem[]) {
  return useMemo(() => {
    const people = new Map<string, { key: string; name: string; email: string | null; color: string; is_external: boolean; n: number }>();
    const companies = new Map<string, { domain: string; name: string; n: number }>();
    for (const m of all) {
      for (const p of m.participants) {
        const key = (p.email ?? p.name).toLowerCase();
        const cur = people.get(key);
        if (cur) cur.n++;
        else people.set(key, { key, name: p.name, email: p.email, color: p.color, is_external: p.is_external, n: 1 });
      }
      const domains = new Set<string>();
      if (m.company_domain) domains.add(m.company_domain.toLowerCase());
      for (const p of m.participants)
        if (p.is_external && p.email?.includes("@")) domains.add(p.email.split("@")[1].toLowerCase());
      for (const d of domains) {
        const cur = companies.get(d);
        const name =
          (m.company_domain?.toLowerCase() === d && m.company_name) ||
          d.split(".")[0].replace(/^./, (c) => c.toUpperCase());
        if (cur) cur.n++;
        else companies.set(d, { domain: d, name, n: 1 });
      }
    }
    return {
      people: [...people.values()].sort((a, b) => Number(a.is_external) - Number(b.is_external) || b.n - a.n || a.name.localeCompare(b.name)),
      companies: [...companies.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    };
  }, [all]);
}

export function LibraryFilterBar({
  value,
  onChange,
  facets,
  showTrash = true,
}: {
  value: LibraryFilterState;
  onChange: (next: LibraryFilterState) => void;
  facets: ReturnType<typeof useFacets>;
  showTrash?: boolean;
}) {
  const set = (patch: Partial<LibraryFilterState>) => onChange({ ...value, ...patch });
  const [personQ, setPersonQ] = useState("");
  const [openPeople, setOpenPeople] = useState(false);
  const [openDate, setOpenDate] = useState(false);
  const people = facets.people.filter(
    (p) => !personQ.trim() || `${p.name} ${p.email ?? ""}`.toLowerCase().includes(personQ.trim().toLowerCase()),
  );
  const count = activeFilterCount(value);
  const today = new Date();
  const dateLabel =
    value.from || value.to
      ? `${value.from ? new Date(`${value.from}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "…"} – ${
          value.to ? new Date(`${value.to}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "now"
        }`
      : "Date";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={value.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Filter by title or person…"
            aria-label="Filter calls"
            className="h-9 w-full rounded-full border border-border bg-white/[0.04] pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:bg-white/[0.06]"
          />
          {value.q && (
            <button
              type="button"
              onClick={() => set({ q: "" })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs text-muted-foreground hover:text-foreground"
              aria-label={`Sort: ${SORT_LABEL[value.sort]}`}
            >
              <ArrowDownUp className="size-3.5" />
              <span className="hidden sm:inline">{SORT_LABEL[value.sort]}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={value.sort} onValueChange={(v) => set({ sort: v as MeetingSort })}>
              {(Object.keys(SORT_LABEL) as MeetingSort[]).map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {SORT_LABEL[s]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {/* Meeting type */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Chip icon={Tag} active={!!value.meeting_type} onClear={() => set({ meeting_type: undefined })}>
              {value.meeting_type ? MEETING_TYPE_LABELS[value.meeting_type] : "Meeting type"}
            </Chip>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuRadioGroup
              value={value.meeting_type ?? ""}
              onValueChange={(v) => set({ meeting_type: (v || undefined) as MeetingType | undefined })}
            >
              {MEETING_TYPES.map((t) => (
                <DropdownMenuRadioItem key={t} value={t}>
                  {MEETING_TYPE_LABELS[t]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Participant */}
        <Popover open={openPeople} onOpenChange={setOpenPeople}>
          <PopoverTrigger asChild>
            <Chip
              icon={User}
              active={!!value.participant}
              onClear={() => set({ participant: undefined, participantLabel: undefined })}
            >
              <span className="max-w-32 truncate">{value.participantLabel ?? "Participant"}</span>
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 gap-0 p-0">
            <div className="border-b border-white/[0.06] p-2">
              <input
                autoFocus
                value={personQ}
                onChange={(e) => setPersonQ(e.target.value)}
                placeholder="Find a person…"
                aria-label="Find a person"
                className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <ul className="max-h-64 overflow-y-auto p-1">
              {people.slice(0, 60).map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => {
                      set({ participant: p.email ?? p.name, participantLabel: p.name });
                      setOpenPeople(false);
                      setPersonQ("");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/[0.06]"
                  >
                    <ParticipantAvatar person={p} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      {p.email && <span className="block truncate text-[11px] text-muted-foreground">{p.email}</span>}
                    </span>
                    {p.is_external && <span className="text-[10px] text-muted-foreground">Ext</span>}
                    {value.participant === (p.email ?? p.name) && <Check className="size-3.5 text-sky-300" />}
                  </button>
                </li>
              ))}
              {people.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">No one matches.</li>}
            </ul>
          </PopoverContent>
        </Popover>

        {/* Company */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Chip
              icon={Building2}
              active={!!value.company}
              onClear={() => set({ company: undefined, companyLabel: undefined })}
            >
              {value.companyLabel ?? "Company"}
            </Chip>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
            {facets.companies.length === 0 ? (
              <DropdownMenuLabel className="font-normal text-muted-foreground">No external companies yet</DropdownMenuLabel>
            ) : (
              <DropdownMenuRadioGroup
                value={value.company ?? ""}
                onValueChange={(v) => set({ company: v, companyLabel: facets.companies.find((c) => c.domain === v)?.name })}
              >
                {facets.companies.map((c) => (
                  <DropdownMenuRadioItem key={c.domain} value={c.domain}>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] text-muted-foreground">{c.domain}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Date range */}
        <Popover open={openDate} onOpenChange={setOpenDate}>
          <PopoverTrigger asChild>
            <Chip icon={CalendarRange} active={!!(value.from || value.to)} onClear={() => set({ from: undefined, to: undefined })}>
              {dateLabel}
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ["7 days", 7],
                ["30 days", 30],
                ["90 days", 90],
              ].map(([label, days]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    set({ from: isoDay(new Date(today.getTime() - (days as number) * 86_400_000)), to: undefined });
                    setOpenDate(false);
                  }}
                  className="h-8 rounded-lg border border-white/10 bg-white/[0.03] text-xs hover:bg-white/[0.07]"
                >
                  Last {label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted-foreground">
                From
                <input
                  type="date"
                  value={value.from ?? ""}
                  max={value.to}
                  onChange={(e) => set({ from: e.target.value || undefined })}
                  className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-foreground outline-none [color-scheme:dark] focus:border-primary/50"
                />
              </label>
              <label className="text-[11px] text-muted-foreground">
                To
                <input
                  type="date"
                  value={value.to ?? ""}
                  min={value.from}
                  onChange={(e) => set({ to: e.target.value || undefined })}
                  className="mt-1 h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-foreground outline-none [color-scheme:dark] focus:border-primary/50"
                />
              </label>
            </div>
          </PopoverContent>
        </Popover>

        <Toggle icon={CircleCheck} active={value.has_action_items} onClick={() => set({ has_action_items: value.has_action_items ? undefined : true })}>
          Has action items
        </Toggle>
        <Toggle icon={Star} active={value.starred} onClick={() => set({ starred: value.starred ? undefined : true })}>
          Starred
        </Toggle>
        {showTrash && (
          <Toggle icon={Trash2} tone="danger" active={value.trash} onClick={() => set({ trash: value.trash ? undefined : true })}>
            Trash
          </Toggle>
        )}
        {count > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, q: value.q, sort: value.sort, trash: value.trash })}
            className="shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear {count > 1 ? `${count} filters` : "filter"}
          </button>
        )}
      </div>
    </div>
  );
}
