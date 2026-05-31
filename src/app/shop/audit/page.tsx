import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Shop Audit | MerchandiseControl Admin Web",
  description: "Shop Admin audit shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  event?: string | string[];
  result?: string | string[];
  severity?: string | string[];
  shop_id?: string | string[];
  target_id?: string | string[];
}>;

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopAuditPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const section = await getShopSectionForRequest(
    "audit",
    requestedShopId,
    {
      auditFilters: {
        eventQuery: getParam(params, "event"),
        result: getParam(params, "result"),
        severity: getParam(params, "severity"),
        targetId: getParam(params, "target_id"),
      },
    },
  );

  return (
    <div className="grid gap-5">
      <form className="mx-auto grid max-w-7xl gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_180px_180px_minmax(0,1fr)_auto]">
        {requestedShopId ? (
          <input name="shop_id" type="hidden" value={requestedShopId} />
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Event
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={getParam(params, "event") ?? ""}
            name="event"
            type="search"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Severity
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={getParam(params, "severity") ?? ""}
            name="severity"
          >
            <option value="">Any</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Result
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={getParam(params, "result") ?? ""}
            name="result"
          >
            <option value="">Any</option>
            <option value="success">Success</option>
            <option value="blocked">Blocked</option>
            <option value="failure">Failure</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Target id
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={getParam(params, "target_id") ?? ""}
            name="target_id"
            type="text"
          />
        </label>
        <button className="self-end rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
          Filter
        </button>
      </form>
      <ShopSectionPage section={section} />
    </div>
  );
}
