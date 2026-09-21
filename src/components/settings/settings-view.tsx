"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, CalendarDays, Database, Globe2, Mic, Plug, Settings2, Sparkles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/bits";
import { RULES } from "@/components/calendar/rules";
import { ROUTES } from "@/lib/routes";
import { LANGUAGE_LABELS, SUMMARY_TEMPLATES, TEMPLATE_BY_KEY } from "@/lib/templates";
import { errorMessage } from "@/lib/ui/use-api";
import { SUMMARY_LANGUAGES, type Capabilities, type ShareAccess, type SummaryLanguage, type SummaryTemplateKey, type UserPrefs } from "@/lib/types";
import { cn } from "@/lib/utils";
import { IntegrationsTab } from "./integrations-tab";
import { Card, Monogram, Row, Section, StatusChip } from "./parts";
import { usePrefs } from "./use-prefs";
import type { SettingsTab } from "./tabs";

const SETTINGS_TABS: { key: SettingsTab; label: string; icon: typeof Bell }[] = [
  { key: "general", label: "General", icon: Settings2 },
  { key: "recording", label: "Recording", icon: Video },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "integrations", label: "Integrations", icon: Plug },
];

const ACCESS_LABEL: Record<ShareAccess, string> = {
  anyone_with_link: "Anyone with the link",
  same_domain: "People at your company",
  invited: "Only people added",
};

export function SettingsView({ capabilities, initialTab }: { capabilities: Capabilities; initialTab: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const prefsQ = usePrefs();
  const select = (t: SettingsTab) => {
    setTab(t);
    window.history.replaceState(null, "", ROUTES.pages.settingsTab(t));
  };

  const needsPrefs = tab !== "integrations";
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Preferences are saved to your workspace account.</p>

      <div role="tablist" aria-label="Settings" className="-mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-white/[0.06] px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        {SETTINGS_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => select(t.key)}
              className={cn(
                "relative -mb-px inline-flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
                tab === t.key &&
                  "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:shadow-[0_0_8px_var(--brand)]",
              )}
            >
              <Icon className="size-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {needsPrefs && prefsQ.loading ? (
        <SettingsSkeleton />
      ) : needsPrefs && !prefsQ.prefs ? (
        <div className="glass mt-8 rounded-2xl">
          <ErrorState title="Couldn't load your settings" description={errorMessage(prefsQ.error)} onRetry={prefsQ.reload} />
        </div>
      ) : tab === "general" ? (
        <GeneralTab capabilities={capabilities} prefs={prefsQ.prefs!} update={prefsQ.update} />
      ) : tab === "recording" ? (
        <RecordingTab prefs={prefsQ.prefs!} update={prefsQ.update} />
      ) : tab === "notifications" ? (
        <NotificationsTab prefs={prefsQ.prefs!} update={prefsQ.update} />
      ) : (
        <IntegrationsTab />
      )}
    </div>
  );
}

type Update = ReturnType<typeof usePrefs>["update"];

function GeneralTab({ capabilities, prefs, update }: { capabilities: Capabilities; prefs: UserPrefs; update: Update }) {
  return (
    <>
      <Section title="System status" desc="What's live on this deployment. Everything works without keys — AI falls back to a deterministic demo mode.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Status icon={Sparkles} label="AI notes & Ask" ok={capabilities.ai_mode === "live"} on="Claude (live)" off="Demo mode (extractive)" />
          <Status icon={Mic} label="Transcription" ok={capabilities.transcription} on="Deepgram connected" off="Needs DEEPGRAM_API_KEY" />
          <Status icon={Database} label="Data" ok={capabilities.data_mode === "supabase"} on="Supabase Postgres" off="Seed data (in-memory)" />
        </div>
      </Section>

      <Section title="Notes" desc="How Fanthom writes your meeting summaries. New calls use these defaults.">
        <Row label="Default summary template" hint="Each call still auto-detects its meeting type; you can switch templates on any call.">
          <Select value={prefs.default_template} onValueChange={(v) => void update({ default_template: v as SummaryTemplateKey })}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Default template">
              <SelectValue>{TEMPLATE_BY_KEY[prefs.default_template]?.name ?? prefs.default_template}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {SUMMARY_TEMPLATES.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Summary language">
          <Select value={prefs.default_language} onValueChange={(v) => void update({ default_language: v as SummaryLanguage })}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Summary language">
              <SelectValue>{LANGUAGE_LABELS[prefs.default_language]}</SelectValue>
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
      </Section>

      <Section title="Sharing" desc="Defaults for new share links.">
        <Row
          label="Default link access"
          hint={
            <span className="inline-flex items-center gap-1">
              <Globe2 className="size-3" /> Applies when you create a new link
            </span>
          }
        >
          <Select value={prefs.default_share_access} onValueChange={(v) => void update({ default_share_access: v as ShareAccess })}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Default access">
              <SelectValue>{ACCESS_LABEL[prefs.default_share_access]}</SelectValue>
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
      </Section>

      <Section title="Onboarding">
        <Row label="Getting-started guide" hint={prefs.onboarding_completed ? "Completed — run it again any time." : "Not finished yet."}>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href={ROUTES.pages.welcome}>
              Open guide <ArrowRight />
            </Link>
          </Button>
        </Row>
      </Section>
    </>
  );
}

function RecordingTab({ prefs, update }: { prefs: UserPrefs; update: Update }) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const connect = async (provider: string) => {
    setConnecting(provider);
    await update({ calendar_connected: true }, { message: `${provider} connected (simulated)` });
    setConnecting(null);
  };
  return (
    <>
      <Section
        title="Auto-record"
        desc="Which calendar meetings the Fanthom notetaker joins on its own. You can override any single meeting on the calendar."
        action={
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link href={ROUTES.pages.calendar}>
              <CalendarDays /> Calendar
            </Link>
          </Button>
        }
      >
        <div role="radiogroup" aria-label="Auto-record rule" className="grid gap-2 sm:grid-cols-2">
          {RULES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={prefs.auto_record_rule === r.key}
              onClick={() => prefs.auto_record_rule !== r.key && void update({ auto_record_rule: r.key }, { message: `Auto-record: ${r.label}` })}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                prefs.auto_record_rule === r.key
                  ? "border-primary/50 bg-primary/[0.08] shadow-[0_0_30px_-14px_var(--brand)]"
                  : "border-white/8 bg-white/[0.02] hover:bg-white/[0.04]",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                  prefs.auto_record_rule === r.key ? "border-sky-400" : "border-white/25",
                )}
              >
                {prefs.auto_record_rule === r.key && <span className="size-2 rounded-full bg-sky-400" />}
              </span>
              <span>
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Calendar" desc="Fanthom reads upcoming meetings to know when to join.">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "Google Calendar", mono: "Gc", tint: "#4285f4" },
            { name: "Outlook Calendar", mono: "Oc", tint: "#0a64d6" },
          ].map((c) => (
            <Card key={c.name} className="flex items-center gap-3 p-3.5">
              <Monogram mono={c.mono} tint={c.tint} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{prefs.calendar_connected ? "Connected · demo events" : "Not connected"}</p>
              </div>
              {prefs.calendar_connected ? (
                <StatusChip tone="stub">Simulated</StatusChip>
              ) : (
                <Button size="sm" variant="outline" className="rounded-full" disabled={!!connecting} onClick={() => void connect(c.name)}>
                  Connect
                </Button>
              )}
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Calendar OAuth isn&apos;t configured on this demo: connecting marks the calendar as linked and shows seeded events.
          {prefs.calendar_connected && (
            <>
              {" "}
              <button
                type="button"
                className="text-sky-300 hover:underline"
                onClick={() => void update({ calendar_connected: false }, { message: "Calendar disconnected" })}
              >
                Disconnect
              </button>
            </>
          )}
        </p>
      </Section>

      <Section title="In-browser recording">
        <Row label="Record from this browser" hint="Mic plus an optional screen or tab — no bot needed.">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href={ROUTES.pages.record}>
              <Mic /> Open recorder
            </Link>
          </Button>
        </Row>
      </Section>
    </>
  );
}

function NotificationsTab({ prefs, update }: { prefs: UserPrefs; update: Update }) {
  const toggle = (k: keyof UserPrefs, label: string) => (c: boolean) => void update({ [k]: c }, { message: `${label} ${c ? "on" : "off"}` });
  return (
    <>
      <Section title="In-app" desc="What shows up under the bell in the top bar.">
        <Row label="A call is ready" hint="When notes, action items and highlights are done.">
          <Switch checked={prefs.notify_meeting_ready} onCheckedChange={toggle("notify_meeting_ready", "Call-ready alerts")} aria-label="Call ready" />
        </Row>
        <Row label="Someone @mentions you" hint="In a comment on any call.">
          <Switch checked={prefs.notify_mentions} onCheckedChange={toggle("notify_mentions", "Mentions")} aria-label="Mentions" />
        </Row>
        <Row label="A call is shared with you">
          <Switch checked={prefs.notify_shared} onCheckedChange={toggle("notify_shared", "Share alerts")} aria-label="Shared with you" />
        </Row>
      </Section>
      <Section title="Email">
        <Row label="Email me a recap after each call" hint="Preview the email from any call page. Sending is stubbed in this demo.">
          <Switch checked={prefs.email_recap_enabled} onCheckedChange={toggle("email_recap_enabled", "Email recaps")} aria-label="Email recap" />
        </Row>
      </Section>
    </>
  );
}

function Status({ icon: Icon, label, ok, on, off }: { icon: typeof Sparkles; label: string; ok: boolean; on: string; off: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <Icon className="size-4 text-muted-foreground" />
        <StatusChip tone={ok ? "live" : "stub"}>{ok ? "Live" : "Demo"}</StatusChip>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{ok ? on : off}</p>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-busy aria-label="Loading settings">
      <Skeleton className="h-4 w-32" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-4 w-24" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between py-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-52 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
