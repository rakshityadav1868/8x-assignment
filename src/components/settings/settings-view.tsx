"use client";

import { useState } from "react";
import { Bot, Check, Database, Globe2, Mic, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LANGUAGE_LABELS, SUMMARY_TEMPLATES, TEMPLATE_BY_KEY } from "@/lib/templates";
import { SUMMARY_LANGUAGES, type Capabilities, type ShareAccess, type SummaryLanguage, type SummaryTemplateKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";

const PREFS_KEY = "fanthom:prefs";

interface Prefs {
  template: SummaryTemplateKey | "auto";
  language: SummaryLanguage;
  shareAccess: ShareAccess;
  autoShareExternal: boolean;
  emailRecap: boolean;
}

const DEFAULT_PREFS: Prefs = {
  template: "auto",
  language: "en",
  shareAccess: "anyone_with_link",
  autoShareExternal: false,
  emailRecap: true,
};

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

const ACCESS_LABEL: Record<ShareAccess, string> = {
  anyone_with_link: "Anyone with the link",
  same_domain: "People at your company",
  invited: "Only people added",
};

/** Two-letter monograms in brand-ish tints; we don't ship third-party logos. */
const INTEGRATIONS = [
  { name: "Slack", desc: "Post call recaps to a channel", mono: "Sl", tint: "#e01e5a" },
  { name: "HubSpot", desc: "Sync notes & action items to deals", mono: "Hs", tint: "#ff7a59" },
  { name: "Salesforce", desc: "Log calls on opportunities", mono: "Sf", tint: "#00a1e0" },
  { name: "Asana", desc: "Turn action items into tasks", mono: "As", tint: "#f06a6a" },
  { name: "Zapier", desc: "Trigger 5,000+ apps on new calls", mono: "Zp", tint: "#ff4f00" },
  { name: "Zoom", desc: "Auto-join and record meetings", mono: "Zm", tint: "#2d8cff" },
  { name: "Google Meet", desc: "Auto-join from Google Calendar", mono: "Gm", tint: "#00ac47" },
  { name: "Microsoft Teams", desc: "Auto-join Teams meetings", mono: "Mt", tint: "#6264a7" },
];

export function SettingsView({ capabilities }: { capabilities: Capabilities }) {
  const hydrated = useHydrated();
  const [override, setPrefs] = useState<Prefs | null>(null);
  const prefs = override ?? (hydrated ? loadPrefs() : DEFAULT_PREFS);
  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
    toast.success("Settings saved", { id: "prefs", duration: 1200 });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Demo workspace · preferences are saved in this browser.</p>

      <Section title="System status" desc="What's live on this deployment. Everything works without keys — AI falls back to a deterministic demo mode.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Status
            icon={Sparkles}
            label="AI notes & Ask"
            ok={capabilities.ai_mode === "live"}
            on="Claude (live)"
            off="Demo mode (extractive)"
          />
          <Status icon={Mic} label="Transcription" ok={capabilities.transcription} on="Deepgram connected" off="Needs DEEPGRAM_API_KEY" />
          <Status
            icon={Database}
            label="Data"
            ok={capabilities.data_mode === "supabase"}
            on="Supabase Postgres"
            off="Seed data (in-memory)"
          />
        </div>
      </Section>

      <Section title="Notes" desc="How Fanthom writes your meeting summaries.">
        <Row label="Default summary template" hint="Auto picks a template from the detected meeting type.">
          <Select value={prefs.template} onValueChange={(v) => update({ template: v as Prefs["template"] })}>
            <SelectTrigger className="w-52" aria-label="Default template">
              <SelectValue>{prefs.template === "auto" ? "Auto (by meeting type)" : TEMPLATE_BY_KEY[prefs.template].name}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="auto">Auto (by meeting type)</SelectItem>
              {SUMMARY_TEMPLATES.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Summary language">
          <Select value={prefs.language} onValueChange={(v) => update({ language: v as SummaryLanguage })}>
            <SelectTrigger className="w-52" aria-label="Summary language">
              <SelectValue>{LANGUAGE_LABELS[prefs.language]}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {SUMMARY_LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Email me a recap after each call" hint="Sending email is stubbed in this demo.">
          <Switch checked={prefs.emailRecap} onCheckedChange={(c) => update({ emailRecap: c })} aria-label="Email recap" />
        </Row>
      </Section>

      <Section title="Sharing" desc="Defaults for new share links.">
        <Row label="Default link access" hint={<span className="inline-flex items-center gap-1"><Globe2 className="size-3" /> Applies when you create a new link</span>}>
          <Select value={prefs.shareAccess} onValueChange={(v) => update({ shareAccess: v as ShareAccess })}>
            <SelectTrigger className="w-52" aria-label="Default access">
              <SelectValue>{ACCESS_LABEL[prefs.shareAccess]}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {(Object.keys(ACCESS_LABEL) as ShareAccess[]).map((a) => (
                <SelectItem key={a} value={a}>
                  {ACCESS_LABEL[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Auto-share recaps with external attendees" hint="Off by default — external guests only see what you share.">
          <Switch
            checked={prefs.autoShareExternal}
            onCheckedChange={(c) => update({ autoShareExternal: c })}
            aria-label="Auto-share with external attendees"
          />
        </Row>
      </Section>

      <Section
        title="Integrations"
        desc="Where your notes go after the call. These are stubbed in the demo — the buttons don't connect anything."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {INTEGRATIONS.map((i) => (
            <div key={i.name} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3.5">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
                style={{ color: i.tint, backgroundColor: `${i.tint}1f`, boxShadow: `inset 0 0 0 1px ${i.tint}40` }}
              >
                {i.mono}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{i.name}</p>
                <p className="truncate text-xs text-muted-foreground">{i.desc}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <button
                      type="button"
                      disabled
                      className="h-7 cursor-not-allowed rounded-full border border-white/10 px-2.5 text-[11px] font-medium text-white/50"
                    >
                      Stubbed in demo
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-56">
                  OAuth integrations are intentionally out of scope for this demo. Copy buttons on summaries and action items work
                  today.
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3.5 text-xs text-muted-foreground">
          <Bot className="size-4 text-primary" />
          The live meeting bot and calendar sync are also stubbed — use <span className="text-white/80">Upload</span> to add a
          recording.
        </div>
      </Section>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {desc && <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/[0.06] py-3.5 first:pt-0 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Status({
  icon: Icon,
  label,
  ok,
  on,
  off,
}: {
  icon: typeof Sparkles;
  label: string;
  ok: boolean;
  on: string;
  off: string;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <Icon className="size-4 text-muted-foreground" />
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            ok ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-300/10 text-amber-200",
          )}
        >
          {ok ? <Check className="size-3" /> : null}
          {ok ? "Live" : "Demo"}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{ok ? on : off}</p>
    </div>
  );
}
