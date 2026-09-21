import type { Metadata } from "next";
import { PillLink } from "@/components/brand/pill-link";
import { Faq } from "@/components/marketing/faq";
import { ComparisonTable, PricingTiers } from "@/components/marketing/pricing";
import { MarketingFrame, PageHero } from "@/components/marketing/site-chrome";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Pricing · Fanthom",
  description: "Free forever for unlimited recordings. Upgrade for unlimited AI notes, team collaboration and CRM sync.",
};

const FAQ: [string, React.ReactNode][] = [
  [
    "Is the Free plan really free?",
    "Yes. Record, transcribe, search and share as many calls as you like. AI notes run on your first five calls each month; after that you still get the transcript, highlights and search.",
  ],
  [
    "How does Fanthom join my meetings?",
    "Connect your calendar and choose an auto-record rule (all, external only, internal only or none), or paste a meeting link to send the notetaker in on demand. You can also record right in your browser — no bot at all.",
  ],
  [
    "Which languages are supported?",
    "Transcription handles the most common business languages, and summaries can be written in English, Spanish, French, German, Portuguese, Italian, Japanese and Hindi.",
  ],
  [
    "Who can see my calls?",
    "Only you, until you share. Team plans add a shared library, but every call keeps its own access setting: anyone with the link, people at your company, or only people you add.",
  ],
  [
    "Can I get my data out?",
    "Always. Download transcripts as TXT, SRT, VTT or Markdown, summaries as Markdown, and the original recording. Webhooks push every finished call to your own systems.",
  ],
  [
    "Is this the real product?",
    <>
      This is a working demo of Fanthom: everything in the app works, but billing isn&apos;t switched on and some integrations (calendar OAuth, the
      meeting bot, CRM OAuth) are simulated and labelled as such. Webhooks and Slack recaps are real.
    </>,
  ],
];

export default function PricingPage() {
  return (
    <MarketingFrame active={ROUTES.pages.pricing}>
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Free notes forever.
            <br />
            Pay when your team does.
          </>
        }
        desc="Start with unlimited recordings at no cost. Upgrade for unlimited AI notes, shared libraries, coaching and CRM sync."
      />
      <PricingTiers />
      <p className="mt-6 text-center text-xs text-white/40">Prices in USD. Demo deployment — no card is ever charged.</p>

      <section className="mt-28">
        <h2 className="text-center text-3xl font-semibold tracking-[-0.035em] md:text-4xl">Every plan, side by side</h2>
        <ComparisonTable />
      </section>

      <section id="faq" className="mt-28 scroll-mt-24 px-4">
        <h2 className="mb-8 text-center text-3xl font-semibold tracking-[-0.035em] md:text-4xl">Questions, answered</h2>
        <Faq items={FAQ} />
      </section>

      <section className="mx-auto mt-24 flex max-w-3xl flex-col items-center px-5 pb-24 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Try it on real calls.</h2>
        <p className="mt-3 text-white/60">The demo workspace is loaded with meetings, notes and insights. No sign-up.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <PillLink href={ROUTES.pages.features} variant="secondary" className="h-11 px-5">
            Explore features
          </PillLink>
          <PillLink href={ROUTES.pages.calls} className="h-11 pl-5">
            Open the demo workspace
          </PillLink>
        </div>
      </section>
    </MarketingFrame>
  );
}
