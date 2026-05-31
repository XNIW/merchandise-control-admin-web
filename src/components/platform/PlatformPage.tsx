import { ActionButton } from "./components/ActionButton";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { GuardrailNotice } from "@/components/admin/GuardrailNotice";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionCard } from "@/components/admin/SectionCard";
import { StatCard } from "./components/StatCard";
import { AppShell } from "./AppShell";
import type { PlatformSection } from "./platformData";

type PlatformPageProps = {
  section: PlatformSection;
};

export function PlatformPage({ section }: PlatformPageProps) {
  return (
    <AppShell activeSection={section.key}>
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <PageHeader
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.description}
          status={section.status}
          titleId="platform-page-title"
        />

        <section aria-label={`${section.title} metrics`} className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {section.stats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <SectionCard
            title={`${section.title} rows`}
            description="Rows come from the server read model when available; empty states explain the current boundary."
          >
            <AdminDataTable
              caption="Platform Admin read-only table rendered from server-provided rows."
              columns={section.columns}
              rows={section.rows}
              emptyState={
                section.emptyState ?? {
                  title: "No rows returned",
                  description: "No rows returned through the server boundary.",
                }
              }
              footer="Rows are server-limited for the current read-only boundary."
            />
          </SectionCard>

          <div className="grid gap-5">
            <SectionCard
              title="Read state"
              description="The page renders only rows returned through the server boundary."
            >
              <div className="grid gap-3">
                <EmptyState
                  title={section.emptyState?.title ?? "Read state available"}
                  description={
                    section.emptyState?.description ??
                    "No additional read state is available for this section."
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
            </SectionCard>

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
          </div>
        </div>
      </div>
    </AppShell>
  );
}
