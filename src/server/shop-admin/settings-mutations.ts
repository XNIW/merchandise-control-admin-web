import "server-only";

import {
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";

export const SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE =
  "SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE";

type UpdateShopSettingsInput = {
  reason?: string;
  requestedShopId?: string;
  shopName?: string;
};

export async function updateShopSettings(
  input: UpdateShopSettingsInput,
): Promise<ShopAdminActionResult> {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "settings.write",
  );

  if (context.status !== "ready") {
    return context.result;
  }

  return shopAdminActionResult("shop_settings_managed_by_master_console", {
    ok: false,
    shopId: context.selectedShop.shopId,
    targetId: context.selectedShop.shopId,
  });
}
