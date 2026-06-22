import type { StatItem } from "../platformData";
import { StatusBadge } from "./StatusBadge";

type StatCardProps = {
  stat: StatItem;
};

export function StatCard({ stat }: StatCardProps) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{stat.label}</p>
        <StatusBadge label={stat.toneLabel ?? stat.tone} tone={stat.tone} />
      </div>
      <p className="mt-2 break-words text-xl font-semibold tracking-normal text-slate-950 [overflow-wrap:anywhere]">
        {stat.value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{stat.detail}</p>
    </article>
  );
}
