/** Auto-record rule evaluation (Phase 5 B). Pure + isomorphic. Owner: backend (used by repos). */
import type { AutoRecordRule, CalendarEvent } from "@/lib/types";

/** Whether the rule alone would record the event: all → true; none → false; external_only → is_external; internal_only → !is_external. */
export function ruleRecords(event: Pick<CalendarEvent, "is_external">, rule: AutoRecordRule): boolean {
  void event;
  void rule;
  throw new Error("TODO");
}

/** Effective `record` = record_override ?? ruleRecords(event, rule). */
export function effectiveRecord(event: Pick<CalendarEvent, "is_external" | "record_override">, rule: AutoRecordRule): boolean {
  void event;
  void rule;
  throw new Error("TODO");
}
