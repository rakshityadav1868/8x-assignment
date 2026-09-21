import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CallNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-primary">
        <FileQuestion className="size-5" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">This call doesn’t exist</h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have been deleted, or the link is mistyped.</p>
      <Button asChild className="mt-6 rounded-full">
        <Link href="/calls">Back to My Calls</Link>
      </Button>
    </div>
  );
}
