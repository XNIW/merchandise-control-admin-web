import Link from "next/link";
import type { ReactNode } from "react";
import { ActionButton } from "./components/ActionButton";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { GuardrailNotice } from "@/components/admin/GuardrailNotice";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionCard } from "@/components/admin/SectionCard";
import { StatCard } from "./components/StatCard";
import { AppShell } from "./AppShell";
import {
  formatDisplayValue,
  isLikelyIdentifier,
} from "./displayFormat";
import { getI18n } from "@/i18n/get-locale";
import {
  translatePlatformSection,
  translateText,
} from "@/i18n/translate-sections";
import { PlatformMasterDetail } from "./PlatformMasterDetail";
import type { PlatformSection } from "./platformData";

type PlatformPageProps = {
  children?: ReactNode;
  detailSectionActions?: Record<string, ReactNode>;
  section: PlatformSection;
  selectedRowKey?: string;
};

export async function PlatformPage({
  children,
  detailSectionActions,
  section,
  selectedRowKey,
}: PlatformPageProps) {
  const { dictionary, locale } = await getI18n();
  const localizedSection = translatePlatformSection(dictionary, section, locale);
  const hasMasterDetail =
    localizedSection.serverSearch !== undefined ||
    localizedSection.rowDetails !== undefined &&
    localizedSection.rowDetails.length > 0;
  const hasDetailSections =
    localizedSection.detailSections !== undefined &&
    localizedSection.detailSections.length > 0;
  const compactDiagnostics = localizedSection.diagnosticsPriority !== "primary";
  const rowsAreDiagnostics =
    localizedSection.rowsPresentation === "diagnostics";
  const diagnosticsContent = (
    <div className="grid gap-3">
      {rowsAreDiagnostics && localizedSection.rows.length > 0 ? (
        <div className="grid gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              {translateText(dictionary, "Diagnostics / boundary rows")}
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {translateText(
                dictionary,
                "Internal rows returned by the server boundary for review and troubleshooting.",
              )}
            </p>
          </div>
          <AdminDataTable
            caption={translateText(
              dictionary,
              "Platform Admin diagnostic rows rendered from server-provided rows.",
            )}
            columns={localizedSection.columns}
            rows={localizedSection.rows}
            locale={locale}
            emptyState={
              localizedSection.emptyState ?? {
                title: translateText(dictionary, "No rows visible"),
                description: translateText(
                  dictionary,
                  "The server boundary did not return rows for this view.",
                ),
              }
            }
            footer={translateText(
              dictionary,
              "Rows are server-limited for the current read-only boundary.",
            )}
          />
        </div>
      ) : null}
      <EmptyState
        title={
          localizedSection.emptyState?.title ??
          translateText(dictionary, "Read boundary checked")
        }
        description={
          localizedSection.emptyState?.description ??
          translateText(
            dictionary,
            "No additional read boundary warnings are available for this section.",
          )
        }
      />
      <GuardrailNotice
        title={translateText(dictionary, "Boundary status")}
        items={
          localizedSection.guardrails ?? [
            translateText(
              dictionary,
              "No browser-side Supabase client or service-role key is used by these views.",
            ),
          ]
        }
      />
    </div>
  );

  return (
    <AppShell
      activeSection={localizedSection.key}
      dictionary={dictionary}
      locale={locale}
    >
      <div
        className={[
          "mx-auto flex flex-col gap-5",
          hasMasterDetail ? "max-w-[96rem]" : "max-w-7xl",
        ].join(" ")}
      >
        {localizedSection.backHref ? (
          <nav aria-label={translateText(dictionary, "Detail navigation")}>
            <Link
              href={localizedSection.backHref}
              className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"
            >
              {localizedSection.backLabel ?? dictionary.common.back}
            </Link>
          </nav>
        ) : null}

        <PageHeader
          eyebrow={localizedSection.eyebrow}
          title={localizedSection.title}
          description={localizedSection.description}
          status={localizedSection.status}
          titleId="platform-page-title"
        />

        {localizedSection.purposeItems &&
        localizedSection.purposeItems.length > 0 ? (
          <section
            aria-label={`${localizedSection.title} purpose`}
            className="rounded-md border border-slate-200 bg-white p-4"
          >
            <p className="text-sm font-semibold text-slate-950">
              {translateText(dictionary, "Use this page to")}
            </p>
            <dl className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {localizedSection.purposeItems.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-sm leading-5 text-slate-700">
                    {item.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section
          aria-label={`${localizedSection.title} metrics`}
          className="grid gap-3 md:grid-cols-3 xl:grid-cols-4"
        >
          {localizedSection.stats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </section>

        {hasDetailSections ? (
          <section
            aria-label={`${localizedSection.title} detail sections`}
            className="grid gap-4 xl:grid-cols-2"
          >
            {localizedSection.detailSections?.map((detailSection, index) => {
              const actionNode =
                detailSectionActions?.[
                  section.detailSections?.[index]?.title ?? detailSection.title
                ];
              const actionPlacement = detailSection.actionPlacement ?? "header";

              return (
                <div
                  key={detailSection.title}
                  className={
                    detailSection.layout === "full" ? "xl:col-span-2" : undefined
                  }
                >
                  <SectionCard
                    actions={
                      actionPlacement === "header" ? actionNode : undefined
                    }
                    title={detailSection.title}
                    description={detailSection.description}
                  >
                    <dl
                      className={[
                        "grid gap-3 text-sm",
                        detailSection.layout === "full"
                          ? "md:grid-cols-2 xl:grid-cols-4"
                          : "md:grid-cols-2",
                      ].join(" ")}
                    >
                      {detailSection.fields.map((field) => (
                        <div key={field.label}>
                          <dt className="font-semibold text-slate-500">
                            {field.label}
                          </dt>
                          {(() => {
                            const { text, fullValue } = formatDisplayValue(
                              field.value,
                              locale,
                            );

                            return (
                              <dd
                                title={fullValue}
                                className={[
                                  "mt-0.5 break-words text-slate-800",
                                  isLikelyIdentifier(field.value)
                                    ? "font-mono break-all"
                                    : "",
                                ].join(" ")}
                              >
                                {field.href ? (
                                  <Link
                                    href={field.href}
                                    className="font-semibold text-slate-950 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-950"
                                  >
                                    {text}
                                  </Link>
                                ) : (
                                  text
                                )}
                              </dd>
                            );
                          })()}
                        </div>
                      ))}
                    </dl>
                    {detailSection.notes && detailSection.notes.length > 0 ? (
                      <div className="mt-4 grid gap-2">
                        {detailSection.notes.map((note) => (
                          <p
                            key={note}
                            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-700"
                          >
                            {note}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {actionPlacement === "body" && actionNode ? (
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        {actionNode}
                      </div>
                    ) : null}
                  </SectionCard>
                </div>
              );
            })}
          </section>
        ) : null}

        {children}

        <div
          className={
            hasMasterDetail
              ? "grid gap-5"
              : "grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"
          }
        >
          {!rowsAreDiagnostics ? (
            <SectionCard
              title={`${localizedSection.title} ${translateText(dictionary, "rows")}`}
              description={translateText(
                dictionary,
                "Rows come from the server read model when available; empty states explain the current boundary.",
              )}
            >
              {hasMasterDetail ? (
                <div className="grid gap-4">
                  {localizedSection.tableNotice ? (
                    <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-950">
                        {localizedSection.tableNotice.title}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-700">
                        {localizedSection.tableNotice.description}
                      </p>
                      {localizedSection.nextLinks &&
                      localizedSection.nextLinks.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {localizedSection.nextLinks.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                  <PlatformMasterDetail
                    key={[
                      selectedRowKey ?? localizedSection.key,
                      localizedSection.serverSearch?.value ?? "",
                    ].join(":")}
                    caption={translateText(
                      dictionary,
                      "Platform Admin read-only table rendered from server-provided rows.",
                    )}
                    columns={localizedSection.columns}
                    rows={localizedSection.rows}
                    rowDetails={localizedSection.rowDetails ?? []}
                    selectedRowKey={selectedRowKey}
                    filters={localizedSection.filters}
                    searchPlaceholder={localizedSection.searchPlaceholder}
                    serverSearch={localizedSection.serverSearch}
                    labels={{
                      adjustSearchOrFilters: translateText(
                        dictionary,
                        "Adjust search or filters to show rows already returned by the server boundary.",
                      ),
                      clientFiltersHideRows: translateText(
                        dictionary,
                        "Client filters are hiding rows returned by the server boundary.",
                      ),
                      copied: translateText(dictionary, "Copied"),
                      copy: translateText(dictionary, "Copy"),
                      copyShopCode: translateText(dictionary, "Copy shop code"),
                      doubleClickToOpenFullDetail: translateText(
                        dictionary,
                        "Double click to open full detail",
                      ),
                      inspector: translateText(dictionary, "Inspector"),
                      noMatchingRows: translateText(dictionary, "No matching rows"),
                      openFullDetail: translateText(dictionary, "Open full detail"),
                      search: translateText(dictionary, "Search"),
                      searchRows: translateText(dictionary, "Search rows"),
                      selectRow: translateText(dictionary, "select row"),
                      selectedRow: translateText(dictionary, "selected row"),
                      serverSearchReturnedNoRows: translateText(
                        dictionary,
                        "Server search returned no rows. Clear the search to return to the default view.",
                      ),
                    }}
                    locale={locale}
                    emptyState={
                      localizedSection.emptyState ?? {
                        title: translateText(dictionary, "No rows visible"),
                        description: translateText(
                          dictionary,
                          "The server boundary did not return rows for this view.",
                        ),
                      }
                    }
                    footer={translateText(
                      dictionary,
                      "Rows are server-limited for the current read-only boundary.",
                    )}
                  />
                </div>
              ) : (
                <AdminDataTable
                  caption={translateText(
                    dictionary,
                    "Platform Admin read-only table rendered from server-provided rows.",
                  )}
                  columns={localizedSection.columns}
                  rows={localizedSection.rows}
                  locale={locale}
                  emptyState={
                    localizedSection.emptyState ?? {
                      title: translateText(dictionary, "No rows visible"),
                      description: translateText(
                        dictionary,
                        "The server boundary did not return rows for this view.",
                      ),
                    }
                  }
                  footer={translateText(
                    dictionary,
                    "Rows are server-limited for the current read-only boundary.",
                  )}
                />
              )}
            </SectionCard>
          ) : null}

          <div className="grid gap-5">
            {compactDiagnostics ? (
              <details className="rounded-md border border-slate-200 bg-white">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-slate-950">
                  <span>{dictionary.common.diagnostics}</span>
                  <span className="text-xs font-medium text-slate-500">
                    {dictionary.common.boundaryDetails}
                  </span>
                </summary>
                <div className="border-t border-slate-200 p-3">{diagnosticsContent}</div>
              </details>
            ) : (
              <SectionCard
                title={dictionary.common.diagnostics}
                description={translateText(
                  dictionary,
                  "The page renders only rows returned through the server boundary.",
                )}
              >
                {diagnosticsContent}
              </SectionCard>
            )}

            {localizedSection.operations ? (
              <SectionCard
                title={translateText(dictionary, "Controlled operations")}
                description={translateText(
                  dictionary,
                  "Audited controls are available only through the dedicated operations page.",
                )}
              >
                <div className="grid gap-3">
                  {localizedSection.operations.map((operation) => (
                    <ActionButton
                      key={operation.label}
                      label={operation.label}
                      description={operation.description}
                    />
                  ))}
                </div>
              </SectionCard>
            ) : null}

            {localizedSection.nextLinks && localizedSection.nextLinks.length > 0 ? (
              <SectionCard
                title={translateText(dictionary, "Next action")}
                description={translateText(
                  dictionary,
                  "Move to the page that owns the next operational step.",
                )}
              >
                <div className="grid gap-3">
                  {localizedSection.nextLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition hover:border-slate-300 hover:bg-white focus-visible:ring-2 focus-visible:ring-slate-950"
                    >
                      <span className="font-semibold text-slate-950">
                        {link.label}
                      </span>
                      <span className="mt-1 block leading-5 text-slate-600">
                        {link.description}
                      </span>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
