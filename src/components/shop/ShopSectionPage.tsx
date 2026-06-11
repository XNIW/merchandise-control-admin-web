import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { GuardrailNotice } from "@/components/admin/GuardrailNotice";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionCard } from "@/components/admin/SectionCard";
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
  const liveData = section.liveData;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.description}
        status={section.status}
        titleId="shop-page-title"
        accent="emerald"
      />

      <section
        aria-label={`${section.title} status`}
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

      <div className="grid gap-5">
        <SectionCard
          title={liveData ? liveData.title : "Planned state"}
          description={
            liveData
              ? liveData.description
              : "No live shop rows are available in this section yet. This page remains a guarded placeholder until its schema is verified."
          }
          titleId={`${section.key}-status-title`}
        >
          {liveData ? (
            <AdminDataTable
              caption={`${section.title} read-only table for the selected shop.`}
              columns={liveData.columns}
              rows={liveData.rows}
              emptyState={liveData.emptyState}
            />
          ) : (
            <div className="mt-5 grid gap-3">
              {section.plannedWork.map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-700"
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <details
          aria-labelledby={`${section.key}-guardrails-title`}
          className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <summary
            id={`${section.key}-guardrails-title`}
            className="cursor-pointer text-sm font-semibold text-zinc-950"
          >
            Diagnostics
          </summary>
          <div className="mt-3">
            <GuardrailNotice items={section.guardrails} />
          </div>
        </details>
      </div>
    </div>
  );
}
