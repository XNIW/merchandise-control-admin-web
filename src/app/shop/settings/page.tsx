import type { Metadata } from "next";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { updateShopSettingsAction } from "@/app/shop/actions";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Settings | MerchandiseControl Admin Web",
  description: "Shop Admin settings shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
}>;

function getParam(
  searchParams: Awaited<ShopPageSearchParams>,
  key: keyof Awaited<ShopPageSearchParams>,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopSettingsPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const section = await getShopSectionForRequest(
    "settings",
    getParam(params, "shop_id"),
  );
  const requestedShopId = getParam(params, "shop_id");
  const canUpdateSettings =
    (await resolveShopActionContext(requestedShopId, "settings.write"))
      .status === "ready";

  return (
    <div className="grid gap-5">
      <ShopSectionPage section={section} />
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      <section className="mx-auto w-full max-w-7xl rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Fiscal/boleta identity is managed by Master Console. Admin Console can
        view company RUT, giro, address, city, and legal representative RUT, but
        cannot edit those fields.
      </section>
      {canUpdateSettings ? (
        <form
          action={updateShopSettingsAction}
          className="mx-auto grid w-full max-w-7xl gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          {requestedShopId ? (
            <input name="shop_id" type="hidden" value={requestedShopId} />
          ) : null}
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            Shop name
            <input
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              name="shopName"
              required
              type="text"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            Reason
            <input
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              name="reason"
              required
              type="text"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            Type SETTINGS as confirmation
            <input
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              name="confirmation"
              required
              type="text"
            />
          </label>
          <button className="self-end rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Update settings
          </button>
        </form>
      ) : null}
    </div>
  );
}
