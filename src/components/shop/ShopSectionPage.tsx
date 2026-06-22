import {
  AdminDataTable,
  type AdminDataTableRow,
} from "@/components/admin/AdminDataTable";
import { SectionCard } from "@/components/admin/SectionCard";
import { getI18n } from "@/i18n/get-locale";
import { translateShopSection, translateText } from "@/i18n/translate-sections";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "./shopLayout";
import type { ShopSection, ShopSectionMetric } from "./shopSections";
import type { ReactNode } from "react";

type ShopSectionPageProps = {
  beforeLiveData?: ReactNode;
  liveDataToolbar?: ReactNode;
  renderLiveData?: (input: {
    liveData: NonNullable<ShopSection["liveData"]>;
    rowActions?: {
      label: string;
      render: (row: AdminDataTableRow) => ReactNode;
    };
  }) => ReactNode;
  rowActions?: {
    label: string;
    render: (row: AdminDataTableRow) => ReactNode;
  };
  secondaryRowActions?: {
    label: string;
    render: (row: AdminDataTableRow) => ReactNode;
    renderForTable?: (
      table: NonNullable<ShopSection["secondaryLiveData"]>[number],
    ) => boolean;
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

const technicalMetricLabels = new Set([
  "Catalog scope",
  "Current page rows",
  "Loaded lower bound",
  "Page",
  "Range",
  "Rows shown",
  "Search scope",
  "Supabase",
  "Writes",
]);

function isTechnicalMetric(metric: ShopSectionMetric) {
  return technicalMetricLabels.has(metric.label);
}

export async function ShopSectionPage({
  beforeLiveData,
  liveDataToolbar,
  renderLiveData,
  rowActions,
  secondaryRowActions,
  section,
}: ShopSectionPageProps) {
  const { dictionary, locale } = await getI18n();
  const localizedSection = translateShopSection(dictionary, section, locale);
  const liveData = section.liveData;
  const localizedLiveData = localizedSection.liveData;
  const localizedRowActions = rowActions
    ? {
        ...rowActions,
        label: translateText(dictionary, rowActions.label),
      }
    : undefined;
  const localizedSecondaryRowActions = secondaryRowActions
    ? {
        ...secondaryRowActions,
        label: translateText(dictionary, secondaryRowActions.label),
      }
    : undefined;
  const metricPairs = localizedSection.metrics.map((metric, index) => ({
    metric,
    source: section.metrics[index] ?? metric,
  }));
  const preferredMetrics = metricPairs.filter(
    (entry) => !isTechnicalMetric(entry.source),
  );
  const primaryMetricPairs = (
    preferredMetrics.length > 0 ? preferredMetrics : metricPairs
  ).slice(0, 4);
  const primaryMetricSourceLabels = new Set(
    primaryMetricPairs.map((entry) => entry.source.label),
  );
  const secondaryMetricPairs = metricPairs.filter(
    (entry) => !primaryMetricSourceLabels.has(entry.source.label),
  );

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} flex flex-col gap-5`}>
      <section
        aria-label={`${localizedSection.title} ${translateText(dictionary, "status")}`}
        className={metricGridClassName(primaryMetricPairs.length)}
      >
        {primaryMetricPairs.map(({ metric }) => (
          <article
            key={metric.label}
            className={[
              "min-w-0 rounded-md border p-3 shadow-sm",
              metricToneClasses[metric.tone],
            ].join(" ")}
          >
            <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
              {metric.label}
            </p>
            <p className="mt-1.5 break-words text-xl font-semibold leading-7 tracking-normal [overflow-wrap:anywhere]">
              {metric.value}
            </p>
            <p className="mt-1 break-words text-xs leading-5 opacity-80 [overflow-wrap:anywhere]">
              {metric.detail}
            </p>
          </article>
        ))}
      </section>

      {secondaryMetricPairs.length > 0 ? (
        <details className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm">
          <summary className="cursor-pointer font-medium text-zinc-900">
            {translateText(dictionary, "Technical details")}
          </summary>
          <dl className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {secondaryMetricPairs.map(({ metric }) => (
              <div
                className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2"
                key={metric.label}
              >
                <dt className="text-xs font-semibold text-zinc-500">
                  {metric.label}
                </dt>
                <dd className="mt-1 break-words text-sm font-semibold text-zinc-950 [overflow-wrap:anywhere]">
                  {metric.value}
                </dd>
                <dd className="mt-0.5 break-words text-xs leading-5 text-zinc-500 [overflow-wrap:anywhere]">
                  {metric.detail}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      {beforeLiveData}

      {liveData ? liveDataToolbar : null}

      <div className="grid gap-5">
        <SectionCard
          title={
            localizedLiveData
              ? localizedLiveData.title
              : translateText(dictionary, "Planned state")
          }
          description={
            localizedLiveData
              ? localizedLiveData.description
              : translateText(
                  dictionary,
                  "No live shop rows are available in this section yet. This page remains a guarded placeholder until its schema is verified.",
                )
          }
          titleId={`${localizedSection.key}-status-title`}
        >
          {localizedLiveData ? (
            renderLiveData ? (
              renderLiveData({
                liveData: localizedLiveData,
                rowActions: localizedRowActions,
              })
            ) : (
              <AdminDataTable
                caption={`${localizedSection.title} ${translateText(
                  dictionary,
                  "read-only table for the selected shop.",
                )}`}
                columns={localizedLiveData.columns}
                rows={localizedLiveData.rows}
                emptyState={localizedLiveData.emptyState}
                locale={locale}
                rowActions={localizedRowActions}
              />
            )
          ) : (
            <div className="mt-5 grid gap-3">
              {localizedSection.plannedWork.map((item) => (
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

        {section.secondaryLiveData?.map((table, index) => {
          const localizedTable =
            localizedSection.secondaryLiveData?.[index] ?? table;
          const tableRowActions =
            localizedSecondaryRowActions &&
            (secondaryRowActions?.renderForTable?.(table) ?? true)
              ? localizedSecondaryRowActions
              : undefined;

          return (
            <SectionCard
              key={table.title}
              title={localizedTable.title}
              description={localizedTable.description}
              titleId={`${localizedSection.key}-${table.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}-title`}
            >
              <AdminDataTable
                caption={`${localizedSection.title} ${localizedTable.title} ${translateText(
                  dictionary,
                  "table for the selected shop.",
                )}`}
                columns={localizedTable.columns}
                rows={localizedTable.rows}
                emptyState={localizedTable.emptyState}
                locale={locale}
                rowActions={tableRowActions}
              />
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}
