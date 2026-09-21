import type { Metadata } from "next";
import { WelcomeView } from "@/components/onboarding/welcome-view";

export const metadata: Metadata = { title: "Welcome · Fanthom" };

export default function WelcomePage() {
  return <WelcomeView />;
}
