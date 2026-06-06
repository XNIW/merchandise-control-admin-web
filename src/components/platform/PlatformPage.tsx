import Link from "next/link";
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
import { PlatformMasterDetail } from "./PlatformMasterDetail";
import type { PlatformSection } from "./platformData";

type PlatformPageProps = {
  section: PlatformSection;
  selectedRowKey?: string;
};

export function PlatformPage({ section, selectedRowKey }: PlatformPageProps) {
  const hasMasterDetail =
    section.rowDetails !== undefined && section.rowDetails.length > 0;
  const hasDetailSections =
    section.detailSections !== undefined && section.detailSections.length > 0;
  const compactDiagnostics = section.diagnosticsPriority !== "primary";
  const diagnosticsContent = (
    <div className="grid gap-3">
      <EmptyState
        title={section.emptyState?.title ?? "Read boundary checked"}
        description={
          section.emptyState?.description ??
          "No additional read boundary warnings are available for this section."
        }
      />
      <GuardrailNotice
        title="Boundary status"
        items={
          section.guardrails ?? [
            "No browser-side Supabase client or service-role key is used by these views.",
          ]
        }
      />
    </div>
  );

  return (
    <AppShell activeSection={section.key}>
      <div
        className={[
          "mx-auto flex flex-col gap-5",
          hasMasterDetail ? "max-w-[96rem]" : "max-w-7xl",
        ].join(" ")}
      >
        {section.backHref ? (
          <nav aria-label="Detail navigation">
            <Link
              href={section.backHref}
              className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950"
            >
              {section.backLabel ?? "Back"}
            </Link>
          </nav>
        ) : null}

        <PageHeader
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.description}
          status={section.status}
          titleId="platform-page-title"
        />

        {section.purposeItems && section.purposeItems.length > 0 ? (
          <section
            aria-label={`${section.title} purpose`}
            className="rounded-md border border-slate-200 bg-white p-4"
          >
            <p className="text-sm font-semibold text-slate-950">
              Use this page to
            </p>
            <dl className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {section.purposeItems.map((item) => (
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

        <section aria-label={`${section.title} metrics`} className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {section.stats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </section>

        {hasDetailSections ? (
          <section
            aria-label={`${section.title} detail sections`}
            className="grid gap-4 xl:grid-cols-2"
          >
            {section.detailSections?.map((detailSection) => (
              <SectionCard
                key={detailSection.title}
                title={detailSection.title}
                description={detailSection.description}
              >
                <dl className="grid gap-3 text-sm">
                  {detailSection.fields.map((field) => (
                    <div key={field.label}>
                      <dt className="font-semibold text-slate-500">{field.label}</dt>
                      {(() => {
                        const { text, fullValue } = formatDisplayValue(field.value);

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
                            {text}
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
              </SectionCard>
            ))}
          </section>
        ) : null}

        <div
          className={
            hasMasterDetail
              ? "grid gap-5"
              : "grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"
          }
        >
          <SectionCard
            title={`${section.title} rows`}
            description="Rows come from the server read model when available; empty states explain the current boundary."
          >
            {hasMasterDetail ? (
              <PlatformMasterDetail
                key={selectedRowKey ?? section.key}
                caption="Platform Admin read-only table rendered from server-provided rows."
                columns={section.columns}
                rows={section.rows}
                rowDetails={section.rowDetails ?? []}
                selectedRowKey={selectedRowKey}
                filters={section.filters}
                searchPlaceholder={section.searchPlaceholder}
                emptyState={
                  section.emptyState ?? {
                    title: "No rows visible",
                    description: "The server boundary did not return rows for this view.",
                  }
                }
                footer="Rows are server-limited for the current read-only boundary."
              />
            ) : (
              <AdminDataTable
                caption="Platform Admin read-only table rendered from server-provided rows."
                columns={section.columns}
                rows={section.rows}
                emptyState={
                  section.emptyState ?? {
                    title: "No rows visible",
                    description: "The server boundary did not return rows for this view.",
                  }
                }
                footer="Rows are server-limited for the current read-only boundary."
              />
            )}
          </SectionCard>

          <div className="grid gap-5">
            {compactDiagnostics ? (
              <details className="rounded-md border border-slate-200 bg-white">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-slate-950">
                  <span>Diagnostics</span>
                  <span className="text-xs font-medium text-slate-500">
                    Boundary details
                  </span>
                </summary>
                <div className="border-t border-slate-200 p-3">{diagnosticsContent}</div>
              </details>
            ) : (
              <SectionCard
                title="Diagnostics"
                description="The page renders only rows returned through the server boundary."
              >
                {diagnosticsContent}
              </SectionCard>
            )}

            {section.operations ? (
              <SectionCard
                title="Controlled operations"
                description="Audited controls are available only through the dedicated operations page."
              >
                <div className="grid gap-3">
                  {section.operations.map((operation) => (
                    <ActionButton
                      key={operation.label}
                      label={operation.label}
                      description={operation.description}
                    />
                  ))}
                </div>
              </SectionCard>
            ) : null}

            {section.nextLinks && section.nextLinks.length > 0 ? (
              <SectionCard
                title="Next action"
                description="Move to the page that owns the next operational step."
              >
                <div className="grid gap-3">
                  {section.nextLinks.map((link) => (
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
