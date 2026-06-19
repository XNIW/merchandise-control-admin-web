import {
  AdminDataTable,
  type AdminDataTableRow,
} from "@/components/admin/AdminDataTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionCard } from "@/components/admin/SectionCard";
import { getI18n } from "@/i18n/get-locale";
import { translateShopSection, translateText } from "@/i18n/translate-sections";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "./shopLayout";
import type { ShopSection, ShopSectionMetric } from "./shopSections";
import type { ReactNode } from "react";

type ShopSectionPageProps = {
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

export async function ShopSectionPage({
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

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} flex flex-col gap-5`}>
      <PageHeader
        eyebrow={localizedSection.eyebrow}
        title={localizedSection.title}
        description={localizedSection.description}
        status={localizedSection.status}
        titleId="shop-page-title"
        accent="emerald"
      />

      <section
        aria-label={`${localizedSection.title} ${translateText(dictionary, "status")}`}
        className={metricGridClassName(localizedSection.metrics.length)}
      >
        {localizedSection.metrics.map((metric) => (
          <article
            key={metric.label}
            className={[
              "min-w-0 rounded-md border p-4 shadow-sm",
              metricToneClasses[metric.tone],
            ].join(" ")}
          >
            <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
              {metric.label}
            </p>
            <p className="mt-2 break-words text-xl font-semibold leading-7 tracking-normal [overflow-wrap:anywhere]">
              {metric.value}
            </p>
            <p className="mt-1 break-words text-sm leading-6 opacity-80 [overflow-wrap:anywhere]">
              {metric.detail}
            </p>
          </article>
        ))}
      </section>

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
