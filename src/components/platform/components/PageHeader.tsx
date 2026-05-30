import { StatusBadge } from "./StatusBadge";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  status,
}: PageHeaderProps) {
  return (
    <section
      aria-labelledby="platform-page-title"
      className="rounded-md border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {eyebrow}
          </p>
          <h1
            id="platform-page-title"
            className="mt-2 text-2xl font-semibold tracking-normal text-slate-950"
          >
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <StatusBadge label={status} tone="neutral" />
      </div>
    </section>
  );
}
