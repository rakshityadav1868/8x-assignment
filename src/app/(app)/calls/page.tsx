import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallsListSkeleton } from "./calls-skeleton";

export const metadata: Metadata = { title: "My Calls · Fanthom" };

/** Phase 0 placeholder — frontend agent replaces with the real grouped-by-date list. */
export default function CallsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">My Calls</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recordings, transcripts and AI notes from your meetings.</p>
        </div>
        <Button asChild className="rounded-full">
          <Link href="/upload">
            <Upload /> Upload recording
          </Link>
        </Button>
      </div>
      <div className="mt-8">
        <CallsListSkeleton />
      </div>
    </div>
  );
}
