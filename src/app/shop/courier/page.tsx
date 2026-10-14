import { AccessState } from "@/components/auth/AccessState";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { getDeliveryTrackingReadModel } from "@/server/shop-admin/delivery-tracking";
import { CourierModeClient } from "./CourierModeClient";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return createLocalizedPageMetadata("Courier Mode");
}

type SearchParams = Promise<{ shop_id?: string | string[] }>;

export default async function CourierModePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = Array.isArray(params.shop_id)
    ? params.shop_id[0]
    : params.shop_id;
  const model = await getDeliveryTrackingReadModel(requestedShopId);

  if (model.status !== "ready" || !model.selectedShopId) {
    return (
      <div className={SHOP_ADMIN_CONTENT_FRAME_CLASS}>
        <AccessState
          area="Courier Mode"
          loginHref="/auth/login?mode=shop-code&next=/shop/courier"
          reason={model.reason ?? "Delivery tracking is unavailable."}
          status={model.status === "error" ? "error" : "unauthorized"}
        />
      </div>
    );
  }

  return (
    <div className={SHOP_ADMIN_CONTENT_FRAME_CLASS}>
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Delivery operations
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Courier Mode
        </h1>
      </header>
      <CourierModeClient
        canManage={model.canManage}
        couriers={model.couriers}
        isCourier={model.isCourier}
        rows={model.rows}
        shopId={model.selectedShopId}
        trackingEnabled={model.trackingEnabled}
      />
    </div>
  );
}
