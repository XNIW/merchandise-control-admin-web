import "server-only";

import type { Tables } from "@/lib/supabase/database.types";
import {
  POS_CATALOG_CAPABILITY_VERSION,
  POS_POLICY_CONTRACT_VERSION,
  POS_POLICY_LIMITATIONS,
  POS_SALES_SCHEMA_VERSION,
  POS_SUPPORTED_PAYMENT_METHODS,
  POS_UNSUPPORTED_CAPABILITIES,
  POS_UNSUPPORTED_PAYMENT_METHODS,
} from "./pos-contract";

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

export function buildPosPolicyPayload() {
  return {
    capabilities: {
      catalogPull: POS_CATALOG_CAPABILITY_VERSION,
      fiscalDocumentMode: "local_receipt_redacted",
      localReceiptPrinting: true,
      localStaffMirror: "current_staff_only",
      offlineSales: true,
      paymentMethods: POS_SUPPORTED_PAYMENT_METHODS,
      salesSync: POS_SALES_SCHEMA_VERSION,
    },
    contractVersion: POS_POLICY_CONTRACT_VERSION,
    limitations: POS_POLICY_LIMITATIONS,
    offlinePolicy: {
      firstActivationRequiresOnline: true,
      mode: "offline_first_after_activation",
      pendingSalesRetention: "local_outbox_until_server_ack",
      revocationEnforcement: "next_online_check",
    },
    paymentPolicy: {
      currency: "CLP",
      fallbackMethod: "other",
      supportedMethods: POS_SUPPORTED_PAYMENT_METHODS,
      unsupportedMethods: POS_UNSUPPORTED_PAYMENT_METHODS,
    },
    staffPolicy: {
      credentialMaterial: "not_synced",
      mustChangeCredential: "online_required",
      offlineMirror: "current_staff_only",
    },
    taxPolicy: {
      defaultTaxClp: 0,
      fiscalAuthorityIntegration: "not_configured",
      status: "not_configured",
    },
    unsupportedCapabilities: POS_UNSUPPORTED_CAPABILITIES,
  };
}

export type PosPolicyPayload = ReturnType<typeof buildPosPolicyPayload>;
