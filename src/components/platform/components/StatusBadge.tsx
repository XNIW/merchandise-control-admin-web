type StatusBadgeProps = {
  label: string;
  tone: "neutral" | "good" | "warning" | "muted";
};

const toneClasses: Record<StatusBadgeProps["tone"], string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  muted: "border-slate-200 bg-white text-slate-500",
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-xs font-medium",
        toneClasses[tone],
      ].join(" ")}
    >
      {label}
    </span>
  );
}
