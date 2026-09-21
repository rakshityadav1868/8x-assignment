import type { MeetingType, SummaryLanguage, SummaryTemplateKey } from "./types";

export interface SummaryTemplate {
  key: SummaryTemplateKey;
  name: string;
  description: string;
  /** Section headings the LLM must produce, in order. */
  sections: string[];
}

export const SUMMARY_TEMPLATES: SummaryTemplate[] = [
  {
    key: "general",
    name: "General",
    description: "Balanced recap for any meeting.",
    sections: ["Meeting purpose", "Topics discussed", "Key takeaways", "Next steps"],
  },
  {
    key: "sales",
    name: "Sales",
    description: "Discovery-call recap: needs, objections and next steps.",
    sections: ["Prospect background", "Pain points", "Current solution", "Objections & concerns", "Pricing & budget", "Next steps"],
  },
  {
    key: "sales_bant",
    name: "Sales – BANT",
    description: "Budget, Authority, Need, Timeline qualification.",
    sections: ["Budget", "Authority", "Need", "Timeline", "Next steps"],
  },
  {
    key: "sales_meddpicc",
    name: "Sales – MEDDPICC",
    description: "Enterprise deal qualification framework.",
    sections: [
      "Metrics",
      "Economic buyer",
      "Decision criteria",
      "Decision process",
      "Paper process",
      "Identify pain",
      "Champion",
      "Competition",
      "Next steps",
    ],
  },
  {
    key: "sales_spiced",
    name: "Sales – SPICED",
    description: "Situation, Pain, Impact, Critical event, Decision.",
    sections: ["Situation", "Pain", "Impact", "Critical event", "Decision", "Next steps"],
  },
  {
    key: "qa",
    name: "Q&A",
    description: "Every question asked and how it was answered.",
    sections: ["Questions & answers", "Open questions", "Next steps"],
  },
  {
    key: "standup",
    name: "Stand-up",
    description: "Per-person yesterday / today / blockers.",
    sections: ["Completed", "In progress / today", "Blockers", "Next steps"],
  },
  {
    key: "one_on_one",
    name: "1:1",
    description: "Wins, challenges, feedback and growth.",
    sections: ["Updates & wins", "Challenges", "Feedback", "Career & growth", "Next steps"],
  },
  {
    key: "project_update",
    name: "Project Update",
    description: "Status, progress, risks and decisions.",
    sections: ["Status overview", "Progress since last update", "Risks & blockers", "Decisions made", "Next steps"],
  },
  {
    key: "customer_success",
    name: "Customer Success",
    description: "Account health, goals, feedback and expansion.",
    sections: ["Account health", "Customer goals", "Feedback & issues", "Expansion opportunities", "Risks", "Next steps"],
  },
  {
    key: "interview",
    name: "Interview",
    description: "Candidate background, strengths, concerns.",
    sections: ["Candidate background", "Key strengths", "Concerns", "Questions asked by candidate", "Recommendation & next steps"],
  },
];

export const TEMPLATE_BY_KEY: Record<SummaryTemplateKey, SummaryTemplate> = Object.fromEntries(
  SUMMARY_TEMPLATES.map((t) => [t.key, t]),
) as Record<SummaryTemplateKey, SummaryTemplate>;

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  sales: "Sales",
  customer_success: "Customer Success",
  standup: "Stand-up",
  one_on_one: "1:1",
  interview: "Interview",
  project_update: "Project Update",
  planning: "Planning",
  qa: "Q&A",
  general: "General",
};

/** Meeting type → default summary template (the AI-detected badge picks this). */
export const DEFAULT_TEMPLATE_FOR_MEETING_TYPE: Record<MeetingType, SummaryTemplateKey> = {
  sales: "sales",
  customer_success: "customer_success",
  standup: "standup",
  one_on_one: "one_on_one",
  interview: "interview",
  project_update: "project_update",
  planning: "project_update",
  qa: "qa",
  general: "general",
};

export function defaultTemplateFor(type: MeetingType): SummaryTemplateKey {
  return DEFAULT_TEMPLATE_FOR_MEETING_TYPE[type] ?? "general";
}

export const LANGUAGE_LABELS: Record<SummaryLanguage, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ja: "Japanese",
  hi: "Hindi",
};
