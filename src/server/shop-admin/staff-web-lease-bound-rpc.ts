import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { ShopAdminShellShop } from "./shop-access";

type StaffWebLeaseBoundContext = {
  actorStaffId: string;
  selectedShop: ShopAdminShellShop;
  staffWebSession: {
    credentialVersion: number;
    sessionId: string;
    sessionTokenHash: string;
  };
};

type JsonRecord = { [key: string]: Json | undefined };
export type StaffWebCatalogReadOperation =
  | "entity_page"
  | "options"
  | "product_detail"
  | "products_by_codes"
  | "products_page"
  | "snapshot_page";

function unavailableRpcResult() {
  return {
    data: null,
    error: new Error("Staff lease-bound RPC runtime is not configured."),
  };
}

function staffLeaseBoundAdminClient() {
  const config = resolveSupabaseAdminConfig();
  return config.status === "configured" ? createSupabaseAdminClient(config) : null;
}

/**
 * The service-role client is deliberately contained in this module. Callers
 * receive only named RPC operations whose SQL implementations reacquire and
 * publish the staff lease in the same transaction; no table/query surface is
 * exposed to the staff web request path.
 */
export function callStaffWebCatalogMutation(
  context: StaffWebLeaseBoundContext,
  operation: string,
  payload: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("staff_web_catalog_mutate_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_operation: operation,
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

/**
 * Lease-bound catalog read boundary. The SQL RPC validates the staff lease
 * before resolving scope and once more immediately before it publishes a
 * payload; callers receive the result only, never a general table client.
 */
export function callStaffWebCatalogRead(
  context: StaffWebLeaseBoundContext,
  operation: StaffWebCatalogReadOperation,
  request: JsonRecord,
  signal?: AbortSignal,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  const rpc = supabase.rpc("shop_catalog_admin_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_operation: operation,
    p_request: request,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
  return signal ? rpc.abortSignal(signal) : rpc;
}

export function callStaffWebLifecycleMutation(
  context: StaffWebLeaseBoundContext,
  operation: string,
  payload: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("staff_web_lifecycle_mutate_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_operation: operation,
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebAuditEvent(
  context: StaffWebLeaseBoundContext,
  input: {
    code: string;
    eventKey: string;
    metadata: JsonRecord;
    requiredPermission: "catalog.export" | "catalog.import" | "catalog.write";
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
    targetId: string | null;
    targetType: string;
  },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("staff_web_audit_event_v1", {
    p_code: input.code,
    p_event_key: input.eventKey,
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_metadata: input.metadata,
    p_required_permission: input.requiredPermission,
    p_result: input.result,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_severity: input.severity,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
    p_target_id: input.targetId,
    p_target_type: input.targetType,
  });
}

export function callStaffWebHistoryMutation(
  context: StaffWebLeaseBoundContext,
  operation: string,
  payload: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("staff_web_history_mutate_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_operation: operation,
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebStorefrontRead(
  context: StaffWebLeaseBoundContext,
  request: {
    availability?: string | null;
    categoryId?: string | null;
    discounted?: boolean | null;
    missingImage?: boolean | null;
    page: number;
    pageSize: number;
    query?: string | null;
    sort: string;
    status?: string | null;
  },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_publications_read_v1", {
    p_availability: request.availability,
    p_category_id: request.categoryId,
    p_discounted: request.discounted,
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_missing_image: request.missingImage,
    p_page: request.page,
    p_page_size: request.pageSize,
    p_query: request.query,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_sort: request.sort,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
    p_status: request.status,
  });
}

export function callStaffWebStorefrontMutation(
  context: StaffWebLeaseBoundContext,
  operation: "bulk_pause" | "bulk_publish" | "upsert",
  payload: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_publication_mutate_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_operation: operation,
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}
