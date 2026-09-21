"use client";

import { ErrorState } from "@/components/common/bits";

export default function CallError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <ErrorState title="Couldn't load this call" description={error.message} onRetry={reset} />
    </div>
  );
}
