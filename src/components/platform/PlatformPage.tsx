import { ActionButton } from "./components/ActionButton";
import { DataTable } from "./components/DataTable";
import { EmptyState } from "./components/EmptyState";
import { PageHeader } from "./components/PageHeader";
import { SectionCard } from "./components/SectionCard";
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
        />

        <section aria-label={`${section.title} metrics`} className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {section.stats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <SectionCard
            title={`${section.title} table`}
            description="Server-side read-only rows when authorized; empty state otherwise. Mutating actions are not available."
          >
            <DataTable columns={section.columns} rows={section.rows} />
          </SectionCard>

          <div className="grid gap-5">
            <SectionCard
              title="Read state"
              description="The page renders only rows returned through the server boundary and RLS."
            >
              <div className="grid gap-3">
                <EmptyState
                  title={section.emptyState?.title ?? "Placeholder ready"}
                  description={
                    section.emptyState?.description ??
                    "No additional read state is available for this section."
                  }
                />
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    Boundary status
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    No browser-side Supabase client or service-role key is used
                    by these views.
                  </p>
                </div>
              </div>
            </SectionCard>

            {section.operations ? (
              <SectionCard
                title="Disabled safe operations"
                description="Non-operational controls reserved for TASK-006."
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
