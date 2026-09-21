import { MEETING_TYPES } from "@/lib/types";
import { BASE_SYSTEM, transcriptBlock } from "./common";

export const MEETING_TYPE_SYSTEM = `${BASE_SYSTEM}

Classify the meeting and suggest a title.
- meeting_type: one of ${MEETING_TYPES.map((t) => `"${t}"`).join(", ")}.
  sales = prospect/discovery/demo call; customer_success = existing customer review/QBR/support; standup = team status round;
  one_on_one = two people, manager/report or peers; interview = hiring interview; project_update = status update;
  planning = roadmap/planning session; qa = Q&A/AMA/training; general = anything else.
- title: a specific title of at most 8 words, e.g. "Acme Logistics — Discovery Call" or "Q4 Roadmap Planning".

Output shape: {"meeting_type":string,"title":string}`;

export function meetingTypeUser(transcriptExcerpt: string, participants: string): string {
  return `Participants:\n${participants}\n\n${transcriptBlock(transcriptExcerpt)}\n\nReturn the classification JSON now.`;
}
