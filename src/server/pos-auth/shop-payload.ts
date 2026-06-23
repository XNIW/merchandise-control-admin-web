import "server-only";

import type { Tables } from "@/lib/supabase/database.types";

export const POS_SHOP_SELECT =
  "shop_id,shop_code,shop_name,shop_status,company_rut,business_giro,business_address,business_city,legal_representative_rut,fiscal_identity_locked_by_platform,updated_at";

export type PosShopPayloadRow = Pick<
  Tables<"shops">,
  | "business_address"
  | "business_city"
  | "business_giro"
  | "company_rut"
  | "fiscal_identity_locked_by_platform"
  | "legal_representative_rut"
  | "shop_code"
  | "shop_id"
  | "shop_name"
  | "shop_status"
  | "updated_at"
>;

export function buildPosShopPayload(shop: PosShopPayloadRow) {
  return {
    businessAddress: shop.business_address ?? null,
    businessCity: shop.business_city ?? null,
    businessGiro: shop.business_giro ?? null,
    companyRut: shop.company_rut ?? null,
    fiscalIdentityLockedByPlatform: shop.fiscal_identity_locked_by_platform ?? true,
    legalRepresentativeRut: shop.legal_representative_rut ?? null,
    shopCode: shop.shop_code,
    shopId: shop.shop_id,
    shopName: shop.shop_name,
    shopStatus: shop.shop_status,
    source: "supabase_admin_server" as const,
    updatedAt: shop.updated_at ?? null,
  };
}

export type PosShopPayload = ReturnType<typeof buildPosShopPayload>;
