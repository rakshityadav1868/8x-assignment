import { Skeleton } from "@/components/ui/skeleton";

export function UpcomingSkeleton() {
  return (
    <div className="mt-8">
      <Skeleton className="mb-3 h-3 w-20" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass h-[104px] w-64 shrink-0 rounded-2xl p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-4 w-44" />
            <Skeleton className="mt-4 h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CallsListSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy aria-label="Loading calls">
      {[3, 2].map((rows, g) => (
        <section key={g}>
          <Skeleton className="mb-3 h-3 w-24" />
          <div className="glass divide-y divide-border overflow-hidden rounded-2xl">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex h-[76px] items-center gap-4 px-4">
                <Skeleton className="h-12 w-20 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3 max-w-xs" />
                  <Skeleton className="h-3 w-1/3 max-w-40" />
                </div>
                <div className="hidden -space-x-2 sm:flex">
                  {[0, 1, 2].map((a) => (
                    <Skeleton key={a} className="size-6 rounded-full ring-2 ring-background" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
