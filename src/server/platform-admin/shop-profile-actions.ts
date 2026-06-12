import "server-only";

import type {
  PlatformShopActionCode,
  PlatformShopActionResult,
  UpdateShopProfileInput,
} from "./action-types";
import { platformShopActionResult } from "./action-types";
import {
  resolvePlatformAdminForRequest,
  type PlatformProvisioningRequestAuthDiagnostics,
} from "./provisioning-request-auth";
import { createPlatformProvisioningRpcClient } from "./provisioning-rpc-client";
import { validateUpdateShopProfileInput } from "./shop-action-validation";

type PlatformShopProfileAuthContext = {
  authorizationHeader?: string | null;
  browserSupabaseHost?: string | null;
  diagnostics?: PlatformProvisioningRequestAuthDiagnostics;
  formMode?: string | null;
  requestContentType?: string | null;
};

type RpcResult = {
  audit_event_id?: unknown;
  code?: unknown;
  ok?: unknown;
  shop_id?: unknown;
};

const SHOP_PROFILE_UPDATE_CONFIRMATION = "UPDATE SHOP PROFILE" as const;

function mapRpcCode(value: unknown): PlatformShopActionCode {
  const code = typeof value === "string" ? value : "db_failure";

  if (
    [
      "success",
      "auth_mismatch",
      "unauthorized",
      "not_configured",
      "validation_failed",
      "audit_write_failed",
      "duplicate_company_rut",
      "shop_not_found",
      "conflict",
      "db_failure",
    ].includes(code)
  ) {
    return code as PlatformShopActionCode;
  }

  return "db_failure";
}

function mapRpcResult(data: unknown): PlatformShopActionResult {
  const payload = data && typeof data === "object" ? (data as RpcResult) : {};
  const code = mapRpcCode(payload.code);

  return platformShopActionResult(code, {
    auditEventId:
      typeof payload.audit_event_id === "string"
        ? payload.audit_event_id
        : undefined,
    ok: payload.ok === true && code === "success",
    shopId: typeof payload.shop_id === "string" ? payload.shop_id : undefined,
  });
}

export async function updatePlatformShopProfile(
  input: UpdateShopProfileInput,
  authContext: PlatformShopProfileAuthContext = {},
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateUpdateShopProfileInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return platformShopActionResult("validation_failed", {
      fieldErrors,
      ok: false,
      shopId: normalized.shopId,
    });
  }

  const auth = await resolvePlatformAdminForRequest(authContext);

  if (auth.status !== "authorized") {
    return platformShopActionResult(auth.code, {
      ok: false,
      shopId: normalized.shopId,
    });
  }

  const rpcClient = createPlatformProvisioningRpcClient(auth.actorAccessToken);

  if (!rpcClient) {
    return platformShopActionResult("not_configured", {
      ok: false,
      shopId: normalized.shopId,
    });
  }

  const { data, error } = await rpcClient.rpc("platform_update_shop_profile", {
    p_business_address: normalized.businessAddress,
    p_business_city: normalized.businessCity,
    p_business_giro: normalized.businessGiro,
    p_company_rut: normalized.companyRut,
    p_confirmation: SHOP_PROFILE_UPDATE_CONFIRMATION,
    p_legal_representative_rut: normalized.legalRepresentativeRut,
    p_reason: normalized.reason,
    p_shop_id: normalized.shopId,
    p_shop_name: normalized.shopName,
  });

  if (error) {
    return platformShopActionResult("db_failure", {
      ok: false,
      shopId: normalized.shopId,
    });
  }

  return mapRpcResult(data);
}
