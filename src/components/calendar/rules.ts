import type { AutoRecordRule } from "@/lib/types";

export const RULES: { key: AutoRecordRule; label: string; hint: string }[] = [
  { key: "all", label: "All meetings", hint: "Fanthom joins every meeting with a video link" },
  { key: "external_only", label: "External only", hint: "Only meetings with someone outside your company" },
  { key: "internal_only", label: "Internal only", hint: "Only meetings with teammates" },
  { key: "none", label: "None", hint: "Only meetings you switch on yourself" },
];
