import {
  AdminDataTable,
  type AdminDataTableRow,
} from "@/components/admin/AdminDataTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionCard } from "@/components/admin/SectionCard";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "./shopLayout";
import type { ShopSection, ShopSectionMetric } from "./shopSections";
import type { ReactNode } from "react";

type ShopSectionPageProps = {
  liveDataToolbar?: ReactNode;
  rowActions?: {
    label: string;
    render: (row: AdminDataTableRow) => ReactNode;
  };
  section: ShopSection;
};

const metricToneClasses: Record<ShopSectionMetric["tone"], string> = {
  neutral: "border-zinc-200 bg-white text-zinc-950",
  good: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  muted: "border-zinc-200 bg-zinc-100 text-zinc-800",
};

function metricGridClassName(metricCount: number) {
  return [
    "grid gap-3",
    metricCount >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3",
  ].join(" ");
}

export function ShopSectionPage({
  liveDataToolbar,
  rowActions,
  section,
}: ShopSectionPageProps) {
  const liveData = section.liveData;

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} flex flex-col gap-5`}>
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
        className={metricGridClassName(section.metrics.length)}
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

      {liveData ? liveDataToolbar : null}

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
              rowActions={rowActions}
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

        {section.secondaryLiveData?.map((table) => (
          <SectionCard
            key={table.title}
            title={table.title}
            description={table.description}
            titleId={`${section.key}-${table.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")}-title`}
          >
            <AdminDataTable
              caption={`${section.title} ${table.title} table for the selected shop.`}
              columns={table.columns}
              rows={table.rows}
              emptyState={table.emptyState}
            />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
