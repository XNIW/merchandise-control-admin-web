import { StatusBadge, type StatusBadgeTone } from "./StatusBadge";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  titleId?: string;
  statusTone?: StatusBadgeTone;
  accent?: "slate" | "emerald";
};

const eyebrowClasses: Record<NonNullable<PageHeaderProps["accent"]>, string> = {
  emerald: "text-emerald-700",
  slate: "text-slate-500",
};

export function PageHeader({
  eyebrow,
  title,
  description,
  status,
  titleId = "admin-page-title",
  statusTone = "neutral",
  accent = "slate",
}: PageHeaderProps) {
  return (
    <section
      aria-labelledby={titleId}
      className="rounded-md border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p
            className={[
              "text-xs font-semibold uppercase tracking-normal",
              eyebrowClasses[accent],
            ].join(" ")}
          >
            {eyebrow}
          </p>
          <h1
            id={titleId}
            className="mt-2 text-2xl font-semibold tracking-normal text-slate-950"
          >
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <StatusBadge label={status} tone={statusTone} />
      </div>
    </section>
  );
}
