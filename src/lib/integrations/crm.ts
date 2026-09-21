/** CRM sync preview (Phase 5 D). Pure. CRM OAuth is stubbed; "Sync" only logs. Owner: backend. */
import { companyNameFromDomain } from "@/lib/analytics/deals";
import type { CrmFieldMapping, CrmProvider, CrmSyncPreview, DealFields, DealStage, MeetingDetail, Summary } from "@/lib/types";

const HUBSPOT_STAGE: Record<DealStage, string> = {
  discovery: "appointmentscheduled",
  evaluation: "qualifiedtobuy",
  proposal: "presentationscheduled",
  negotiation: "contractsent",
  closed_won: "closedwon",
  closed_lost: "closedlost",
};
const SALESFORCE_STAGE: Record<DealStage, string> = {
  discovery: "Prospecting",
  evaluation: "Needs Analysis",
  proposal: "Proposal/Price Quote",
  negotiation: "Negotiation/Review",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

const BANT_LABELS = { budget: "Budget", authority: "Authority", need: "Need", timeline: "Timeline" } as const;
const MEDDPICC_LABELS = {
  metrics: "Metrics",
  economic_buyer: "Economic buyer",
  decision_criteria: "Decision criteria",
  decision_process: "Decision process",
  paper_process: "Paper process",
  identify_pain: "Identify pain",
  champion: "Champion",
  competition: "Competition",
} as const;

function plainSummary(summary: Summary | null, max = 4000): string {
  if (!summary) return "";
  const md = summary.markdown?.trim() || summary.sections.map((s) => `${s.heading}\n${s.bullets.map((b) => `- ${b.text}`).join("\n")}`).join("\n\n");
  return md.length > max ? `${md.slice(0, max - 1)}…` : md;
}

function nextSteps(detail: MeetingDetail, summary: Summary | null): string {
  const sec = summary?.sections.find((s) => /next step/i.test(s.heading));
  if (sec?.bullets.length) return sec.bullets.map((b) => b.text).join("; ");
  const open = detail.action_items.filter((a) => !a.completed);
  return open.map((a) => a.description).join("; ");
}

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
  const m = detail.meeting;
  const fields: CrmFieldMapping[] = [];
  const add = (crm_object: string, crm_field: string, label: string, value: string | number | null | undefined, source: CrmFieldMapping["source"]) => {
    if (value === null || value === undefined || value === "") return;
    fields.push({ crm_object, crm_field, label, value: String(value), source });
  };
  const company = companyDomain ? companyNameFromDomain(companyDomain) : null;
  const dealName = company ? `${company} — ${m.title}` : m.title;
  const date = m.recording_start ?? m.scheduled_start ?? m.created_at;
  const names = new Map(detail.participants.map((p) => [p.id, p.name]));
  const steps = nextSteps(detail, summary);
  const body = plainSummary(summary);
  const externals = detail.participants.filter((p) => p.is_external);
  const open = detail.action_items.filter((a) => !a.completed);

  if (provider === "hubspot") {
    add("Note", "hs_timestamp", "Meeting date", date, "meeting");
    add("Note", "hs_note_body", "Meeting notes", body || m.title, "summary");
    add("Deal", "dealname", "Deal name", dealName, "meeting");
    if (dealFields) {
      add("Deal", "dealstage", "Deal stage", HUBSPOT_STAGE[dealFields.stage], "deal_fields");
      add("Deal", "amount", "Amount", dealFields.amount, "deal_fields");
      add("Deal", "closedate", "Close date", dealFields.close_date, "deal_fields");
    }
    add("Deal", "hs_next_step", "Next step", steps, "summary");
    add("Deal", "description", "Description", summary?.sections[0]?.bullets.map((b) => b.text).join(" ") ?? null, "summary");
    for (const a of open) {
      const who = a.assignee_participant_id ? names.get(a.assignee_participant_id) : null;
      add("Task", "hs_task_subject", "Task", a.description + (who ? ` (${who})` : ""), "action_items");
    }
    for (const p of externals) {
      const [first, ...rest] = p.name.split(/\s+/);
      add("Contact", "email", `Contact email (${p.name})`, p.email, "participants");
      add("Contact", "firstname", `First name (${p.name})`, first, "participants");
      add("Contact", "lastname", `Last name (${p.name})`, rest.join(" "), "participants");
      add("Contact", "company", `Company (${p.name})`, company, "participants");
    }
  } else {
    add("Event", "Subject", "Subject", m.title, "meeting");
    add("Event", "ActivityDateTime", "Meeting date", date, "meeting");
    add("Event", "DurationInMinutes", "Duration (min)", m.duration_sec ? Math.round(m.duration_sec / 60) : null, "meeting");
    add("Event", "Description", "Description", body || m.title, "summary");
    add("Opportunity", "Name", "Opportunity name", dealName, "meeting");
    if (dealFields) {
      add("Opportunity", "StageName", "Stage", SALESFORCE_STAGE[dealFields.stage], "deal_fields");
      add("Opportunity", "Amount", "Amount", dealFields.amount, "deal_fields");
      add("Opportunity", "CloseDate", "Close date", dealFields.close_date, "deal_fields");
    }
    add("Opportunity", "NextStep", "Next step", steps.length > 255 ? `${steps.slice(0, 254)}…` : steps, "summary");
    for (const a of open) {
      const who = a.assignee_participant_id ? names.get(a.assignee_participant_id) : null;
      add("Task", "Subject", "Task", a.description + (who ? ` (${who})` : ""), "action_items");
    }
    for (const p of externals) {
      const parts = p.name.split(/\s+/);
      add("Contact", "Email", `Contact email (${p.name})`, p.email, "participants");
      add("Contact", "FirstName", `First name (${p.name})`, parts.length > 1 ? parts.slice(0, -1).join(" ") : "", "participants");
      add("Contact", "LastName", `Last name (${p.name})`, parts[parts.length - 1], "participants");
      add("Contact", "Account.Name", `Account (${p.name})`, company, "participants");
    }
  }

  if (dealFields) {
    const prefix = provider === "hubspot" ? "fanthom_" : "Fanthom_";
    const suffix = provider === "hubspot" ? "" : "__c";
    const obj = provider === "hubspot" ? "Deal" : "Opportunity";
    for (const [k, label] of Object.entries(BANT_LABELS) as [keyof typeof BANT_LABELS, string][])
      add(obj, `${prefix}bant_${k}${suffix}`, `BANT: ${label}`, dealFields.bant[k], "deal_fields");
    for (const [k, label] of Object.entries(MEDDPICC_LABELS) as [keyof typeof MEDDPICC_LABELS, string][])
      add(obj, `${prefix}meddpicc_${k}${suffix}`, `MEDDPICC: ${label}`, dealFields.meddpicc[k], "deal_fields");
  }

  return { meeting_id: m.id, provider, company_domain: companyDomain, fields, connected: false };
}
