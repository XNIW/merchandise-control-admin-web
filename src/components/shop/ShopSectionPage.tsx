import type { ShopSection, ShopSectionMetric } from "./shopSections";

type ShopSectionPageProps = {
  section: ShopSection;
};

const metricToneClasses: Record<ShopSectionMetric["tone"], string> = {
  neutral: "border-zinc-200 bg-white text-zinc-950",
  good: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  muted: "border-zinc-200 bg-zinc-100 text-zinc-800",
};

export function ShopSectionPage({ section }: ShopSectionPageProps) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <section
        aria-labelledby="shop-page-title"
        className="rounded-md border border-zinc-200 bg-white p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-700">
              {section.eyebrow}
            </p>
            <h1
              id="shop-page-title"
              className="mt-3 text-3xl font-semibold tracking-normal text-zinc-950"
            >
              {section.title}
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-700">
              {section.description}
            </p>
          </div>
          <span className="w-fit rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-700">
            {section.status}
          </span>
        </div>
      </section>

      <section
        aria-label={`${section.title} implementation status`}
        className="grid gap-3 md:grid-cols-3"
      >
        {section.metrics.map((metric) => (
          <article
            key={metric.label}
            className={[
              "rounded-md border p-4 shadow-sm",
              metricToneClasses[metric.tone],
            ].join(" ")}
          >
            <p className="text-sm font-medium">{metric.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-normal">
              {metric.value}
            </p>
            <p className="mt-1 text-sm leading-6 opacity-80">{metric.detail}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-labelledby={`${section.key}-status-title`}
          className="rounded-md border border-zinc-200 bg-white p-5"
        >
          <h2
            id={`${section.key}-status-title`}
            className="text-lg font-semibold text-zinc-950"
          >
            Implementation status
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            No live shop rows are rendered in TASK-008. This page is a guarded
            shell placeholder until the shop read model is implemented.
          </p>
          <div className="mt-5 grid gap-3">
            {section.plannedWork.map((item) => (
              <div
                key={item}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby={`${section.key}-guardrails-title`}
          className="rounded-md border border-zinc-200 bg-white p-5"
        >
          <h2
            id={`${section.key}-guardrails-title`}
            className="text-lg font-semibold text-zinc-950"
          >
            Guardrails
          </h2>
          <div className="mt-4 grid gap-3">
            {section.guardrails.map((guardrail) => (
              <p
                key={guardrail}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-950"
              >
                {guardrail}
              </p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
