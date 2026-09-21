/** Companies / deals view (Phase 5 C). Pure. Owner: backend. */
import type { CompanyDetail, CompanySummary, DealFields, DealOverrides, MeetingDetail, MeetingListItem } from "@/lib/types";

/** Free-mail domains never form a company. */
export const FREE_MAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "aol.com"] as const;

/** Lowercased domain of an email, or null. */
export function emailDomain(email: string | null | undefined): string | null {
  void email;
  throw new Error("TODO");
}

/** "acme-logistics.co.uk" → "Acme Logistics". */
export function companyNameFromDomain(domain: string): string {
  void domain;
  throw new Error("TODO");
}

/**
 * Primary external company of a meeting = most frequent external (non-workspace, non-free-mail) participant
 * domain; ties → first by name. Null for internal meetings. Used to fill MeetingListItem.company_domain/name.
 */
export function primaryCompany(
  participants: { email: string | null; is_external: boolean }[],
  workspaceDomain: string,
): { domain: string; name: string } | null {
  void participants;
  void workspaceDomain;
  throw new Error("TODO");
}

/**
 * Derive deal fields from a company's meetings: stage heuristic from meeting types/count/recency
 * (and keywords like "contract", "pricing", "signed"); BANT from the latest `sales_bant` summary sections,
 * MEDDPICC from the latest `sales_meddpicc` summary (heading → field match); unknown = null.
 */
export function deriveDealFields(details: MeetingDetail[]): DealFields {
  void details;
  throw new Error("TODO");
}

/** Deep-merge user overrides over derived fields. */
export function applyDealOverrides(fields: DealFields, overrides: DealOverrides | null): DealFields {
  void fields;
  void overrides;
  throw new Error("TODO");
}

/** Group meetings by primary company. Most recent activity first. `names` = overridden company names by domain. */
export function groupCompanies(
  items: MeetingListItem[],
  details: MeetingDetail[],
  workspaceDomain: string,
  overrides: (DealOverrides & { name?: string })[],
): CompanySummary[] {
  void items;
  void details;
  void workspaceDomain;
  void overrides;
  throw new Error("TODO");
}

/** Full company page; null if no meeting maps to the domain. */
export function buildCompanyDetail(
  domain: string,
  items: MeetingListItem[],
  details: MeetingDetail[],
  workspaceDomain: string,
  overrides: (DealOverrides & { name?: string }) | null,
): CompanyDetail | null {
  void domain;
  void items;
  void details;
  void workspaceDomain;
  void overrides;
  throw new Error("TODO");
}
