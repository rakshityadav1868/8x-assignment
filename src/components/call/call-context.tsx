"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type {
  ActionItem,
  AiMode,
  Highlight,
  Meeting,
  MeetingDetail,
  Participant,
  SpeakerStat,
  Summary,
  SummaryTemplateKey,
  TranscriptSegment,
} from "@/lib/types";
import { defaultTemplateFor } from "@/lib/templates";

export type CallTab = "summary" | "transcript" | "actions" | "ask";

export interface CallContextValue {
  detail: MeetingDetail;
  meeting: Meeting;
  setMeeting: (m: Meeting) => void;
  participants: Participant[];
  participantById: Map<string, Participant>;
  segments: TranscriptSegment[];
  highlights: Highlight[];
  setHighlights: React.Dispatch<React.SetStateAction<Highlight[]>>;
  actionItems: ActionItem[];
  setActionItems: React.Dispatch<React.SetStateAction<ActionItem[]>>;
  summaries: Summary[];
  addSummary: (s: Summary) => void;
  speakerStats: SpeakerStat[];
  speakerFilter: string | null; // participant id
  setSpeakerFilter: (id: string | null) => void;
  summaryTemplate: SummaryTemplateKey;
  setSummaryTemplate: (t: SummaryTemplateKey) => void;
  tab: CallTab;
  setTab: (t: CallTab) => void;
  aiMode: AiMode;
  noteAiMode: (m: AiMode) => void;
  readOnly: boolean;
  shareMode: boolean; // rendered on the public /share page
}

const Ctx = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCall must be used within <CallProvider>");
  return v;
}

export function computeSpeakerStats(segments: TranscriptSegment[], participants: Participant[]): SpeakerStat[] {
  const total = segments.reduce((a, s) => a + Math.max(0, s.end_ms - s.start_ms), 0) || 1;
  const by = new Map<string, SpeakerStat>();
  for (const p of participants) {
    by.set(p.id, {
      participant_id: p.id,
      name: p.name,
      color: p.color,
      talk_ms: 0,
      talk_pct: 0,
      segment_count: 0,
      longest_monologue_ms: 0,
    });
  }
  let runSpeaker: string | null = null;
  let runStart = 0;
  let runEnd = 0;
  const closeRun = () => {
    if (runSpeaker && by.has(runSpeaker)) {
      const st = by.get(runSpeaker)!;
      st.longest_monologue_ms = Math.max(st.longest_monologue_ms, runEnd - runStart);
    }
  };
  for (const s of segments) {
    if (!s.participant_id) continue;
    const st = by.get(s.participant_id);
    if (!st) continue;
    st.talk_ms += Math.max(0, s.end_ms - s.start_ms);
    st.segment_count++;
    if (s.participant_id !== runSpeaker) {
      closeRun();
      runSpeaker = s.participant_id;
      runStart = s.start_ms;
    }
    runEnd = s.end_ms;
  }
  closeRun();
  const out = [...by.values()];
  for (const s of out) s.talk_pct = Math.round((s.talk_ms / total) * 1000) / 10;
  return out.sort((a, b) => b.talk_ms - a.talk_ms);
}

export function CallProvider({
  detail,
  aiMode: initialAiMode,
  initialTab,
  readOnly = false,
  shareMode = false,
  children,
}: {
  detail: MeetingDetail;
  aiMode: AiMode;
  initialTab: CallTab;
  readOnly?: boolean;
  shareMode?: boolean;
  children: React.ReactNode;
}) {
  const [meeting, setMeeting] = useState(detail.meeting);
  const [highlights, setHighlights] = useState(detail.highlights);
  const [actionItems, setActionItems] = useState(detail.action_items);
  const [summaries, setSummaries] = useState(detail.summaries);
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const [tab, setTab] = useState<CallTab>(initialTab);
  const [aiMode, setAiMode] = useState<AiMode>(initialAiMode);
  const [summaryTemplate, setSummaryTemplate] = useState<SummaryTemplateKey>(() => {
    const def = defaultTemplateFor(detail.meeting.meeting_type);
    if (detail.summaries.some((s) => s.template === def && s.language === "en")) return def;
    return detail.summaries[0]?.template ?? def;
  });

  const participantById = useMemo(() => new Map(detail.participants.map((p) => [p.id, p])), [detail.participants]);
  const speakerStats = useMemo(
    () => computeSpeakerStats(detail.segments, detail.participants),
    [detail.segments, detail.participants],
  );
  const addSummary = useCallback((s: Summary) => setSummaries((prev) => [s, ...prev.filter((x) => x.id !== s.id)]), []);
  const noteAiMode = useCallback((m: AiMode) => setAiMode(m), []);

  const value = useMemo<CallContextValue>(
    () => ({
      detail,
      meeting,
      setMeeting,
      participants: detail.participants,
      participantById,
      segments: detail.segments,
      highlights,
      setHighlights,
      actionItems,
      setActionItems,
      summaries,
      addSummary,
      speakerStats,
      speakerFilter,
      setSpeakerFilter,
      summaryTemplate,
      setSummaryTemplate,
      tab,
      setTab,
      aiMode,
      noteAiMode,
      readOnly,
      shareMode,
    }),
    [
      detail,
      meeting,
      participantById,
      highlights,
      actionItems,
      summaries,
      addSummary,
      speakerStats,
      speakerFilter,
      summaryTemplate,
      tab,
      aiMode,
      noteAiMode,
      readOnly,
      shareMode,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
