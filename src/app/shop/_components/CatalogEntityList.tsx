import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import type { ShopSection } from "@/components/shop/shopSections";
import type { ReactNode } from "react";

type CatalogEntityListProps = {
  icon: "category" | "supplier";
  labels: {
    actions: string;
    linkedProducts: string;
    updated: string;
  };
  liveData: NonNullable<ShopSection["liveData"]>;
  rowActions?: {
    label: string;
    render: (row: AdminDataTableRow) => ReactNode;
  };
};

export type CatalogEntityPaginationState = {
  currentPageRows: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  page: number;
  pageSize: 10 | 25 | 50 | 100 | 200;
  rangeEnd: number;
  rangeStart: number;
  totalCount: number;
  totalCountStatus: "deferred" | "exact";
  totalPages: number;
};

export type CatalogEntityPaginationFilters = {
  query: string | null;
  state?: string | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function buildCatalogEntityHref(input: {
  basePath: "/shop/categories" | "/shop/suppliers";
  page?: number | string | null;
  pageSize?: number | string | null;
  query?: string | null;
  requestedShopId?: string | null;
  state?: string | null;
}) {
  const nextParams = new URLSearchParams();

  if (input.requestedShopId) {
    nextParams.set("shop_id", input.requestedShopId);
  }

  if (input.query) {
    nextParams.set("q", input.query);
  }

  if (input.state && input.state !== "active") {
    nextParams.set("state", input.state);
  }

  if (input.page && String(input.page) !== "1") {
    nextParams.set("page", String(input.page));
  }

  if (input.pageSize && String(input.pageSize) !== "10") {
    nextParams.set("pageSize", String(input.pageSize));
  }

  const query = nextParams.toString();

  return query ? `${input.basePath}?${query}` : input.basePath;
}

export function CatalogEntityPagination({
  basePath,
  filters,
  labels,
  pagination,
  placement,
  requestedShopId,
}: {
  basePath: "/shop/categories" | "/shop/suppliers";
  filters: CatalogEntityPaginationFilters;
  labels: {
    applyPage: string;
    goToPage: string;
    next: string;
    of: string;
    page: string;
    pagination: string;
    previous: string;
    rowsOnThisPage: string;
  };
  pagination: CatalogEntityPaginationState;
  placement: "bottom" | "top";
  requestedShopId?: string | null;
}) {
  const hasExactTotal = pagination.totalCountStatus === "exact";
  const previousPage = Math.max(1, pagination.page - 1);
  const nextPage = hasExactTotal
    ? Math.min(pagination.totalPages, pagination.page + 1)
    : pagination.page + 1;
  const range =
    pagination.rangeStart > 0 && pagination.rangeEnd > 0
      ? `${formatNumber(pagination.rangeStart)}-${formatNumber(
          pagination.rangeEnd,
        )}`
      : "0";
  const totalLabel = hasExactTotal
    ? formatNumber(pagination.totalCount)
    : `at least ${formatNumber(pagination.totalCount)}`;
  const baseLinkInput = {
    basePath,
    pageSize: pagination.pageSize,
    query: filters.query,
    requestedShopId,
    state: filters.state,
  };
  const hiddenFields = [
    requestedShopId ? ["shop_id", requestedShopId] : null,
    filters.query ? ["q", filters.query] : null,
    filters.state && filters.state !== "active" ? ["state", filters.state] : null,
    pagination.pageSize !== 10 ? ["pageSize", String(pagination.pageSize)] : null,
  ].filter((field): field is [string, string] => Boolean(field));

  return (
    <nav
      aria-label={`${labels.pagination} ${placement}`}
      className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-700 shadow-sm lg:flex-row lg:items-center lg:justify-between"
      data-catalog-entity-pagination={placement}
    >
      <div className="min-w-0">
        <p className="font-medium text-zinc-950">
          {range} {labels.of} {totalLabel} · {labels.page} {pagination.page}
          {hasExactTotal
            ? ` ${labels.of} ${pagination.totalPages}`
            : pagination.hasNextPage
              ? ` ${labels.of} ${pagination.totalPages}+`
              : ""}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {labels.rowsOnThisPage}: {pagination.currentPageRows}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        {pagination.hasPreviousPage ? (
          <a
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:border-emerald-400 hover:text-emerald-800"
            href={buildCatalogEntityHref({
              ...baseLinkInput,
              page: previousPage,
            })}
          >
            {labels.previous}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-400"
          >
            {labels.previous}
          </span>
        )}
        <form
          action={basePath}
          className="flex min-w-0 flex-wrap items-end gap-2"
          method="get"
        >
          {hiddenFields.map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-zinc-500">
            {labels.goToPage}
            <input
              className="h-9 w-20 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              defaultValue={String(pagination.page)}
              inputMode="numeric"
              max={hasExactTotal ? pagination.totalPages : undefined}
              min={1}
              name="page"
              required
              type="number"
            />
          </label>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:border-emerald-400 hover:text-emerald-800"
            type="submit"
          >
            {labels.applyPage}
          </button>
        </form>
        {pagination.hasNextPage ? (
          <a
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:border-emerald-400 hover:text-emerald-800"
            href={buildCatalogEntityHref({
              ...baseLinkInput,
              page: nextPage,
            })}
          >
            {labels.next}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-400"
          >
            {labels.next}
          </span>
        )}
      </div>
    </nav>
  );
}

function CatalogEntityIcon({ icon }: { icon: "category" | "supplier" }) {
  const commonProps = {
    "aria-hidden": true,
    className: "size-5",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  return (
    <svg {...commonProps}>
      {icon === "supplier" ? (
        <>
          <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
          <path d="M8 7h4" />
          <path d="M8 11h4" />
          <path d="M8 15h4" />
          <path d="M3 21h18" />
        </>
      ) : (
        <>
          <path d="M4 6h7l2 2h7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
          <path d="M8 13h8" />
        </>
      )}
    </svg>
  );
}

function rowText(row: AdminDataTableRow, key: string) {
  const value = row[key];

  return typeof value === "string" ? value : "";
}

export function CatalogEntityList({
  icon,
  labels,
  liveData,
  rowActions,
}: CatalogEntityListProps) {
  if (liveData.rows.length === 0) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        <p className="font-medium text-zinc-900">{liveData.emptyState.title}</p>
        <p className="mt-1 leading-6">{liveData.emptyState.description}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-catalog-entity-list role="list">
      {liveData.rows.map((row) => {
        const name = rowText(row, "name");
        const linkedProducts = rowText(row, "activeProductsCount") || "0";
        const state = rowText(row, "state") || "Active";
        const updated = rowText(row, "updated");
        const isArchived = state.toLowerCase() === "archived";

        return (
          <article
            className="grid min-w-0 gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            data-catalog-entity-card
            key={row.rowKey}
            role="listitem"
          >
            <div className="flex min-w-0 gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500">
                <CatalogEntityIcon icon={icon} />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-start gap-2">
                  <h3
                    className="line-clamp-2 min-w-0 break-words text-base font-semibold leading-6 text-zinc-950 [overflow-wrap:anywhere]"
                    title={name}
                  >
                    {name}
                  </h3>
                  <span
                    className={[
                      "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                      isArchived
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800",
                    ].join(" ")}
                  >
                    {state}
                  </span>
                </div>
                <p className="mt-0.5 text-sm leading-5 text-zinc-600">
                  {linkedProducts} {labels.linkedProducts}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {labels.updated}: {updated}
                </p>
              </div>
            </div>

            {rowActions ? (
              <div className="min-w-0 sm:justify-self-end">
                <p className="sr-only">{labels.actions}</p>
                {rowActions.render(row)}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
