"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ParticipantAvatar } from "@/components/common/participant-avatar";
import { cn } from "@/lib/utils";

export interface MentionCandidate {
  key: string;
  /** TeamMember id when mentionable (creates a notification); null for external participants. */
  member_id: string | null;
  name: string;
  email: string | null;
  color: string;
  subtitle?: string | null;
}

/** Team member ids whose "@Full Name" appears in `body`. */
export function extractMentions(body: string, candidates: MentionCandidate[]): string[] {
  const ids = new Set<string>();
  for (const c of candidates) {
    if (c.member_id && body.includes(`@${c.name}`)) ids.add(c.member_id);
  }
  return [...ids];
}

/** Render body text with "@Name" tokens for known candidates styled as mention pills. */
export function renderWithMentions(body: string, names: string[]): React.ReactNode {
  const sorted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  const esc = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Known names first; otherwise fall back to "@First Last" (e.g. teammates unknown to a public viewer).
  const re = new RegExp(`@(${[...esc, "\\p{Lu}[\\p{L}'-]+(?: \\p{Lu}[\\p{L}'-]+)?"].join("|")})`, "gu");
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(body.slice(last, i));
    out.push(
      <span key={i} className="rounded bg-primary/15 px-0.5 font-medium text-sky-300">
        {m[0]}
      </span>,
    );
    last = i + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export interface MentionTextareaHandle {
  focus: () => void;
}

export const MentionTextarea = forwardRef<
  MentionTextareaHandle,
  {
    value: string;
    onChange: (v: string) => void;
    candidates: MentionCandidate[];
    onSubmit?: () => void;
    onCancel?: () => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    ariaLabel?: string;
  }
>(function MentionTextarea({ value, onChange, candidates, onSubmit, onCancel, placeholder, className, autoFocus, ariaLabel }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ q: string; start: number } | null>(null);
  const [cursor, setCursor] = useState(0);
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }), []);

  const options = useMemo(() => {
    if (!query) return [];
    const q = query.q.toLowerCase();
    return candidates
      .filter((c) => !q || c.name.toLowerCase().split(/\s+/).some((p) => p.startsWith(q)) || c.name.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [query, candidates]);

  const detect = (el: HTMLTextAreaElement) => {
    const upto = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = /(^|\s)@([\p{L}.'-]{0,24})$/u.exec(upto);
    if (m) {
      setQuery({ q: m[2], start: upto.length - m[2].length - 1 });
      setCursor(0);
    } else setQuery(null);
  };

  const pick = (c: MentionCandidate) => {
    if (!query) return;
    const el = ta.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, query.start)}@${c.name} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    const pos = query.start + c.name.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ta}
        value={value}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target);
        }}
        onClick={(e) => detect(e.currentTarget)}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        onKeyDown={(e) => {
          if (query && options.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => (c + 1) % options.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => (c - 1 + options.length) % options.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(options[Math.min(cursor, options.length - 1)]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setQuery(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit?.();
          }
          if (e.key === "Escape") onCancel?.();
        }}
        className={cn(
          "min-h-16 w-full resize-none rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-[13px] leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground focus:border-primary/50",
          className,
        )}
      />
      {query && options.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mention someone"
          className="absolute bottom-full left-0 z-30 mb-1 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#0b1120] p-1 shadow-2xl"
        >
          {options.map((c, i) => (
            <li key={c.key} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setCursor(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                  i === cursor ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
                )}
              >
                <ParticipantAvatar person={c} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{c.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {c.subtitle ?? c.email ?? (c.member_id ? "Teammate" : "Participant")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
