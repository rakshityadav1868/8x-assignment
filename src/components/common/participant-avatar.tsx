import { cn } from "@/lib/utils";
import { alpha, initials } from "@/lib/ui/format";

export interface AvatarPerson {
  name: string;
  color?: string | null;
  is_external?: boolean;
}

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const;

/** Initials avatar tinted with the participant's stable speaker color. */
export function ParticipantAvatar({
  person,
  size = "md",
  className,
  ring = false,
}: {
  person: AvatarPerson;
  size?: keyof typeof SIZES;
  className?: string;
  ring?: boolean;
}) {
  const color = person.color ?? "#64748b";
  return (
    <span
      title={person.name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight",
        SIZES[size],
        ring && "ring-2 ring-background",
        className,
      )}
      style={{
        background: `linear-gradient(${alpha(color, 0.22)}, ${alpha(color, 0.22)}), #0b1120`,
        color, boxShadow: `inset 0 0 0 1px ${alpha(color, 0.35)}` }}
    >
      {initials(person.name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  className,
}: {
  people: AvatarPerson[];
  max?: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className={cn("flex items-center -space-x-1.5", className)} aria-label={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => (
        <ParticipantAvatar key={`${p.name}-${i}`} person={p} size={size} ring />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-medium text-muted-foreground ring-2 ring-background",
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
