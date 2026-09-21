"use client";

import { Fragment, createContext, useContext, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DemoModeBadge, ErrorState } from "@/components/common/bits";
import { LogoMark } from "@/components/brand/logo";
import { RichText } from "@/components/common/rich-text";
import type { AskHistoryResponse, AskStreamEvent } from "@/lib/contracts";
import { api, readNdjson } from "@/lib/ui/api";
import { formatClock } from "@/lib/ui/format";
import type { AiMode, ChatMessage, Citation } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  pending?: boolean;
  error?: string;
}

const fromChat = (m: ChatMessage): UiMessage => ({ id: m.id, role: m.role, content: m.content, citations: m.citations });

interface CitationRenderer {
  onCitation: (c: Citation) => void;
  /** Extra context shown in the citation list chip + tooltip (e.g. the meeting title). */
  describe?: (c: Citation) => string | undefined;
}
const CiteCtx = createContext<CitationRenderer>({ onCitation: () => {} });

/**
 * Generic Ask Fanthom chat: history via GET `endpoint`, NDJSON stream via POST `endpoint`.
 * Used per meeting (citations seek the player) and across meetings (citations open the call at ?t=).
 */
export function AskChat({
  endpoint,
  active = true,
  suggestions,
  onCitation,
  describeCitation,
  onAiMode,
  aiMode,
  title = "Ask Fanthom about this call",
  subtitle = "Answers are grounded in the transcript, with citations that jump to the exact moment.",
  placeholder = "Ask anything about this meeting…",
  className,
}: {
  endpoint: string;
  active?: boolean;
  suggestions: string[];
  onCitation: (c: Citation) => void;
  describeCitation?: (c: Citation) => string | undefined;
  onAiMode?: (m: AiMode) => void;
  aiMode?: AiMode;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<UiMessage[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AiMode | undefined>(aiMode);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadedRef = useRef(false);

  const note = (m: AiMode) => {
    setMode(m);
    onAiMode?.(m);
  };

  useEffect(() => {
    if (!active || loadedRef.current) return;
    loadedRef.current = true;
    api<AskHistoryResponse>(endpoint)
      .then((r) => setMessages(r.messages.map(fromChat)))
      .catch(() => {
        setMessages([]);
        setHistoryError(true);
      });
  }, [active, endpoint]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const tempUser: UiMessage = { id: `u-${Date.now()}`, role: "user", content: q, citations: [] };
    const tempAsst: UiMessage = { id: `a-${Date.now()}`, role: "assistant", content: "", citations: [], pending: true };
    setMessages((prev) => [...(prev ?? []), tempUser, tempAsst]);
    const patchAsst = (fn: (m: UiMessage) => UiMessage) =>
      setMessages((prev) => (prev ?? []).map((m) => (m.id === tempAsst.id ? fn(m) : m)));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          msg = ((await res.json()) as { error?: string }).error ?? msg;
        } catch {}
        throw new Error(msg);
      }
      await readNdjson<AskStreamEvent>(res, (ev) => {
        if (ev.type === "start") note(ev.ai_mode);
        else if (ev.type === "delta") patchAsst((m) => ({ ...m, content: m.content + ev.text }));
        else if (ev.type === "citations") patchAsst((m) => ({ ...m, citations: ev.citations }));
        else if (ev.type === "done") {
          note(ev.ai_mode);
          patchAsst(() => ({ ...fromChat(ev.message), pending: false }));
        } else if (ev.type === "error") patchAsst((m) => ({ ...m, pending: false, error: ev.error }));
      });
      patchAsst((m) => ({ ...m, pending: false }));
    } catch (e) {
      patchAsst((m) => ({ ...m, pending: false, error: e instanceof Error ? e.message : "Something went wrong" }));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <CiteCtx.Provider value={{ onCitation, describe: describeCitation }}>
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-4 [scrollbar-width:thin]">
          {messages === null ? (
            <div className="space-y-4 px-1">
              <Skeleton className="ml-auto h-9 w-2/3 rounded-2xl" />
              <Skeleton className="h-20 w-5/6 rounded-2xl" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center px-4 pt-6 text-center">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] shadow-[0_0_30px_-8px_var(--brand)]">
                <Sparkles className="size-5 text-primary" />
              </div>
              <p className="mt-3 text-sm font-medium">{title}</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">{subtitle}</p>
              {historyError && <ErrorState className="py-4" title="Couldn't load earlier questions" />}
              <div className="mt-5 flex w-full max-w-md flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-left text-[13px] text-white/80 transition-colors hover:border-sky-400/30 hover:bg-primary/[0.08] hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} m={m} />
              ))}
            </div>
          )}
        </div>
        <form
          className="border-t border-white/[0.06] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 pl-3 focus-within:border-primary/50">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder={placeholder}
              aria-label="Ask a question"
              className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] outline-none placeholder:text-muted-foreground [field-sizing:content]"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              aria-label="Send"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-neutral-950 transition-opacity disabled:opacity-30"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>Enter to send · Shift+Enter for a new line</span>
            {mode === "demo" && <DemoModeBadge />}
          </div>
        </form>
      </div>
    </CiteCtx.Provider>
  );
}

function MessageBubble({ m }: { m: UiMessage }) {
  const { describe } = useContext(CiteCtx);
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13.5px] leading-relaxed text-white shadow-[0_6px_24px_-10px_var(--brand)]">
          {m.content}
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <LogoMark className="mt-0.5 size-6 shrink-0 rounded-md [&_svg]:size-3.5" />
      <div className="min-w-0 flex-1">
        {m.error ? (
          <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[13px] text-red-200">{m.error}</p>
        ) : m.pending && !m.content ? (
          <p className="flex items-center gap-2 py-1 text-[13px] text-muted-foreground">
            <MessageSquareText className="size-3.5 animate-pulse" /> Reading the transcripts…
          </p>
        ) : (
          <div className="text-[13.5px] leading-relaxed text-white/85">
            <CitedText text={m.content} citations={m.citations} />
            {m.pending && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-sky-300 align-middle" />}
          </div>
        )}
        {!m.pending && m.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {m.citations.map((c) => {
              const ctx = describe?.(c);
              return (
                <CitationChip
                  key={c.index}
                  c={c}
                  label={`${c.index} · ${ctx ? `${ctx.length > 28 ? ctx.slice(0, 26) + "…" : ctx} · ` : ""}${formatClock(c.start_ms)}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CitationChip({ c, label }: { c: Citation; label: string }) {
  const { onCitation, describe } = useContext(CiteCtx);
  const ctx = describe?.(c);
  const chip = (
    <button
      type="button"
      onClick={() => onCitation(c)}
      className="mx-0.5 inline-flex h-[18px] max-w-full translate-y-[-1px] items-center truncate rounded-md bg-primary/15 px-1.5 align-middle font-mono text-[10.5px] font-medium tabular-nums text-sky-300 ring-1 ring-primary/25 hover:bg-primary/30 hover:text-white"
    >
      {label}
    </button>
  );
  if (!c.quote && !ctx) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent className="max-w-72">
        {ctx && <div className="mb-0.5 text-[11px] text-white/60">{ctx}</div>}
        {c.quote && <>“{c.quote}”</>}
      </TooltipContent>
    </Tooltip>
  );
}

function CitedText({ text, citations }: { text: string; citations: Citation[] }) {
  const byIndex = new Map(citations.map((c) => [c.index, c]));
  return (
    <RichText
      text={text}
      renderCitation={(nums, key) => (
        <Fragment key={key}>
          {nums.map((n) => {
            const c = byIndex.get(n);
            return c ? (
              <CitationChip key={n} c={c} label={formatClock(c.start_ms)} />
            ) : (
              <span key={n} className="mx-0.5 font-mono text-[10.5px] text-muted-foreground">
                [{n}]
              </span>
            );
          })}
        </Fragment>
      )}
    />
  );
}
