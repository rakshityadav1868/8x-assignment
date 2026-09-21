import { Skeleton } from "@/components/ui/skeleton";
import { CallsListSkeleton, UpcomingSkeleton } from "@/components/calls/calls-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />
      <UpcomingSkeleton />
      <div className="mt-10">
        <CallsListSkeleton />
      </div>
    </div>
  );
}
