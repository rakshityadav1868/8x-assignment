import { CallsListSkeleton } from "./calls-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="h-9" />
      <div className="mt-8">
        <CallsListSkeleton />
      </div>
    </div>
  );
}
