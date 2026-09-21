import { Skeleton } from "@/components/ui/skeleton";

export function CallPageSkeleton({ fullHeightClass = "lg:h-[calc(100dvh-3.5rem)]" }: { fullHeightClass?: string }) {
  return (
    <div className={`mx-auto flex w-full max-w-[1680px] flex-col px-4 py-4 md:px-6 lg:overflow-hidden ${fullHeightClass}`} aria-busy>
      <div className="flex items-start gap-2">
        <Skeleton className="size-7 rounded-md" />
        <div className="flex-1">
          <Skeleton className="h-6 w-2/3 max-w-md" />
          <Skeleton className="mt-2 h-4 w-1/2 max-w-sm" />
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="space-y-2">
          <Skeleton className="aspect-video w-full rounded-2xl lg:max-h-[52dvh]" />
          <Skeleton className="h-[74px] w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <div className="glass h-[72dvh] rounded-2xl p-4 lg:h-auto">
          <div className="flex gap-4 border-b border-white/[0.06] pb-3">
            {[16, 20, 24, 10].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
          <div className="mt-5 space-y-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
