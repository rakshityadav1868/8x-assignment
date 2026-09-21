"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import type { AiMode } from "@/lib/types";
import { AskChat } from "./ask-chat";

/** Cross-meeting Ask: citations open the cited call at the exact second. */
export function GlobalAsk({
  meetingTitles,
  callCount,
  aiMode,
}: {
  meetingTitles: Record<string, string>;
  callCount: number;
  aiMode: AiMode;
}) {
  const router = useRouter();
  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col px-4 py-6 md:px-8">
      <div className="shrink-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em] md:text-3xl">
          <Sparkles className="size-6 text-primary" /> Ask Fanthom
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask across all {callCount} calls. Every answer cites the moment it came from.
        </p>
      </div>
      <div className="glass mt-5 min-h-0 flex-1 overflow-hidden rounded-2xl">
        <AskChat
          endpoint={ROUTES.api.askGlobal}
          aiMode={aiMode}
          title="What do you want to know?"
          subtitle="Fanthom searches every transcript, then answers with citations you can click to jump to that call."
          placeholder="Ask about any meeting…"
          describeCitation={(c) => meetingTitles[c.meeting_id]}
          onCitation={(c) => router.push(ROUTES.pages.callAt(c.meeting_id, c.start_ms))}
          suggestions={[
            "What did customers say about pricing?",
            "What decisions were made about the Q4 roadmap?",
            "Which action items are still open for me?",
            "What security concerns came up?",
          ]}
        />
      </div>
    </div>
  );
}
