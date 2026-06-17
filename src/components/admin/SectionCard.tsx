import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  titleId?: string;
};

export function SectionCard({
  actions,
  title,
  description,
  children,
  titleId,
}: SectionCardProps) {
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 rounded-md border border-slate-200 bg-white p-5"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-base font-semibold tracking-normal text-slate-950"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
