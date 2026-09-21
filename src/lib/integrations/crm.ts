/** CRM sync preview (Phase 5 D). Pure. CRM OAuth is stubbed; "Sync" only logs. Owner: backend. */
import type { CrmProvider, CrmSyncPreview, DealFields, MeetingDetail, Summary } from "@/lib/types";

/**
 * Map meeting data to CRM fields. HubSpot: Note (hs_note_body = summary md), Deal (dealname, dealstage,
 * hs_next_step, description), Tasks (one per open action item), Contacts (external participants).
 * Salesforce: Task/Event (Subject, Description), Opportunity (Name, StageName, NextStep, Amount, CloseDate),
 * Contacts. BANT/MEDDPICC from dealFields when present.
 */
export function buildCrmPreview(
  provider: CrmProvider,
  detail: MeetingDetail,
  summary: Summary | null,
  dealFields: DealFields | null,
  companyDomain: string | null,
): CrmSyncPreview {
  void provider;
  void detail;
  void summary;
  void dealFields;
  void companyDomain;
  throw new Error("TODO");
}
