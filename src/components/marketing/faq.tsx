import { Plus } from "lucide-react";

/** Accessible, JS-free accordion (native <details>). */
export function Faq({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-white/[0.07] rounded-3xl border border-white/[0.07] bg-white/[0.015]">
      {items.map(([q, a]) => (
        <details key={q} className="group px-5 py-1 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium">
            {q}
            <Plus className="size-4 shrink-0 text-white/50 transition-transform group-open:rotate-45" />
          </summary>
          <div className="pb-5 text-sm leading-relaxed text-white/60">{a}</div>
        </details>
      ))}
    </div>
  );
}
