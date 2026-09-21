import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8" aria-busy>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-7 w-3/4" />
      <Skeleton className="mt-6 aspect-video w-full rounded-2xl" />
      <Skeleton className="mt-2 h-[74px] w-full rounded-2xl" />
      <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
    </div>
  );
}
