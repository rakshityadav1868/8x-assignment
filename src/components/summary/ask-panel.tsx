"use client";

import { useCall } from "@/components/call/call-context";
import { usePlayerStore } from "@/hooks/use-player";
import { ROUTES } from "@/lib/routes";
import { firstName } from "@/lib/ui/format";
import { AskChat } from "./ask-chat";

/** Per-meeting Ask: citations seek this call's player. */
export function AskPanel({ active }: { active: boolean }) {
  const { meeting, noteAiMode, aiMode, speakerStats } = useCall();
  const store = usePlayerStore();
  const top = speakerStats.find((s) => s.talk_ms > 0);
  return (
    <AskChat
      endpoint={ROUTES.api.ask(meeting.id)}
      active={active}
      aiMode={aiMode}
      onAiMode={noteAiMode}
      onCitation={(c) => store.seek(c.start_ms)}
      suggestions={[
        "What were the key decisions?",
        "What risks or blockers came up?",
        "Who owns the next steps?",
        top ? `What were ${firstName(top.name)}'s main points?` : "Summarize this call in 3 bullets",
      ]}
    />
  );
}
