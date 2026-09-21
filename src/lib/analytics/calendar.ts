/** Auto-record rule evaluation (Phase 5 B). Pure + isomorphic. Owner: backend (used by repos). */
import type { AutoRecordRule, CalendarEvent } from "@/lib/types";

/** Whether the rule alone would record the event: all → true; none → false; external_only → is_external; internal_only → !is_external. */
export function ruleRecords(event: Pick<CalendarEvent, "is_external">, rule: AutoRecordRule): boolean {
  switch (rule) {
    case "all":
      return true;
    case "none":
      return false;
    case "external_only":
      return event.is_external;
    case "internal_only":
      return !event.is_external;
    default:
      return false;
  }
}

/** Effective `record` = record_override ?? ruleRecords(event, rule). */
export function effectiveRecord(event: Pick<CalendarEvent, "is_external" | "record_override">, rule: AutoRecordRule): boolean {
  return event.record_override ?? ruleRecords(event, rule);
}
