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
  return config.status === "configured"
    ? createSupabaseAdminClient(config)
    : null;
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

export function callStaffWebRevisionGuardedProductUpdate(
  context: StaffWebLeaseBoundContext,
  expectedUpdatedAt: string,
  payload: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("staff_web_catalog_update_product_if_revision_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_expected_updated_at: expectedUpdatedAt,
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebRevisionGuardedProductArchivedState(
  context: StaffWebLeaseBoundContext,
  expectedUpdatedAt: string,
  archived: boolean,
  payload: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("staff_web_catalog_set_product_archived_if_revision_v1", {
    p_archived: archived,
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_expected_updated_at: expectedUpdatedAt,
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callCatalogImportReceiptClaim(input: {
  actorId: string;
  actorKind: "personal_account" | "pos_staff_manager";
  requestFingerprint: string;
  requestKey: string;
  shopId: string;
}) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_catalog_import_receipt_claim_v1", {
    p_actor_id: input.actorId,
    p_actor_kind: input.actorKind,
    p_request_fingerprint: input.requestFingerprint,
    p_request_key: input.requestKey,
    p_shop_id: input.shopId,
  });
}

export function callCatalogImportReceiptLookup(input: {
  actorId: string;
  actorKind: "personal_account" | "pos_staff_manager";
  requestFingerprint: string;
  requestKey: string;
  shopId: string;
}) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_catalog_import_receipt_lookup_v1", {
    p_actor_id: input.actorId,
    p_actor_kind: input.actorKind,
    p_request_fingerprint: input.requestFingerprint,
    p_request_key: input.requestKey,
    p_shop_id: input.shopId,
  });
}

export function callCatalogImportReceiptComplete(input: {
  claimToken: string;
  receiptId: string;
  requestFingerprint: string;
  result: JsonRecord;
}) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_catalog_import_receipt_complete_v1", {
    p_claim_token: input.claimToken,
    p_receipt_id: input.receiptId,
    p_request_fingerprint: input.requestFingerprint,
    p_result: input.result,
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
  operation: "archive" | "hide" | "publish" | "save_draft" | "schedule",
  payload: JsonRecord,
  idempotencyKey: string,
  expectedVersion: number,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("storefront_publication_authoring_mutate_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_expected_version: expectedVersion,
    p_idempotency_key: idempotencyKey,
    p_operation: operation,
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebStorefrontBulkMutation(
  context: StaffWebLeaseBoundContext,
  operation: "bulk_hide" | "bulk_publish",
  items: Json,
  idempotencyKey: string,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_publication_bulk_mutate_v2", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_idempotency_key: idempotencyKey,
    p_items: items,
    p_operation: operation,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebStorefrontAuthoringRead(
  context: StaffWebLeaseBoundContext,
  sourceProductIds: readonly string[],
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("storefront_publications_authoring_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_page: 1,
    p_page_size: 100,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_source_product_ids: [...sourceProductIds],
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebStorefrontFulfillmentRead(
  context: StaffWebLeaseBoundContext,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_fulfillment_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebStorefrontFulfillmentMutation(
  context: StaffWebLeaseBoundContext,
  operation: "pickup_upsert" | "settings_upsert" | "slot_upsert" | "zone_upsert",
  payload: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_fulfillment_mutate_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_operation: operation,
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebStorefrontPaymentRead(
  context: StaffWebLeaseBoundContext,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_payment_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebStorefrontPaymentMutation(
  context: StaffWebLeaseBoundContext,
  payload: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_payment_mutate_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebStorefrontPromotionsRead(
  context: StaffWebLeaseBoundContext,
  request: {
    page: number;
    pageSize: number;
    query?: string | null;
    status?: string | null;
  },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_promotions_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_page: request.page,
    p_page_size: request.pageSize,
    p_query: request.query,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
    p_status: request.status,
  });
}

export function callStaffWebStorefrontPromotionMutation(
  context: StaffWebLeaseBoundContext,
  payload: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_promotion_mutate_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_operation: "upsert",
    p_payload: payload,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebStorefrontImagesRead(
  context: StaffWebLeaseBoundContext,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_storefront_images_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebCustomerOrdersRead(
  context: StaffWebLeaseBoundContext,
  operation: "detail" | "queue",
  request: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_customer_orders_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_operation: operation,
    p_request: request,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebCustomerOrderTransition(
  context: StaffWebLeaseBoundContext,
  input: {
    correlationId: string;
    expectedStatusVersion: number;
    idempotencyKey: string;
    operation:
      | "accept"
      | "cancel"
      | "complete"
      | "out_for_delivery"
      | "preparing"
      | "ready"
      | "reject";
    orderId: string;
    reasonCode?: string;
  },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_customer_order_transition_v1", {
    p_correlation_id: input.correlationId,
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_expected_status_version: input.expectedStatusVersion,
    p_idempotency_key: input.idempotencyKey,
    p_operation: input.operation,
    p_order_id: input.orderId,
    p_reason_code: input.reasonCode,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebAfterSalesRead(
  context: StaffWebLeaseBoundContext,
  input: { page: number; pageSize: number; status?: string | null },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_customer_after_sales_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_page: input.page,
    p_page_size: input.pageSize,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
    p_status: input.status,
  });
}

export function callStaffWebAfterSalesEvidenceRead(
  context: StaffWebLeaseBoundContext,
  evidenceId: string,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_customer_after_sales_evidence_read_v1", {
    p_evidence_id: evidenceId,
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebAfterSalesTransition(
  context: StaffWebLeaseBoundContext,
  input: {
    caseId: string;
    expectedVersion: number;
    noteKey?: string;
    targetStatus: string;
  },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_customer_after_sales_transition_v1", {
    p_case_id: input.caseId,
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_expected_version: input.expectedVersion,
    p_note_key: input.noteKey,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
    p_target_status: input.targetStatus,
  });
}

export function callStaffWebCustomerReviewsRead(
  context: StaffWebLeaseBoundContext,
  input: { page: number; pageSize: number; status: string },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_customer_reviews_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_page: input.page,
    p_page_size: input.pageSize,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
    p_status: input.status,
  });
}

export function callStaffWebCustomerReviewModeration(
  context: StaffWebLeaseBoundContext,
  input: {
    expectedVersion: number;
    reason?: string;
    reviewId: string;
    targetStatus: "published" | "rejected";
  },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_customer_review_moderate_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_expected_version: input.expectedVersion,
    p_reason: input.reason,
    p_review_id: input.reviewId,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
    p_target_status: input.targetStatus,
  });
}

export function callStaffWebDeliveryTrackingRead(
  context: StaffWebLeaseBoundContext,
  operation: "detail" | "queue",
  request: JsonRecord,
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_delivery_tracking_read_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_operation: operation,
    p_request: request,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebDeliveryTrackingManage(
  context: StaffWebLeaseBoundContext,
  input: {
    idempotencyKey: string;
    operation:
      | "assign"
      | "configure_external"
      | "configure_live"
      | "configure_status"
      | "start"
      | "terminate";
    orderId: string;
    request: JsonRecord;
  },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("admin_delivery_tracking_manage_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_idempotency_key: input.idempotencyKey,
    p_operation: input.operation,
    p_order_id: input.orderId,
    p_request: input.request,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebCourierTrackingControl(
  context: StaffWebLeaseBoundContext,
  input: {
    idempotencyKey: string;
    operation: "pause" | "start" | "stop";
    orderId: string;
  },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("storefront_courier_tracking_control_v1", {
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_idempotency_key: input.idempotencyKey,
    p_operation: input.operation,
    p_order_id: input.orderId,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}

export function callStaffWebCourierLocationUpsert(
  context: StaffWebLeaseBoundContext,
  input: {
    bearingDegrees?: number;
    horizontalAccuracyMeters: number;
    idempotencyKey: string;
    latitude: number;
    longitude: number;
    observedAt: string;
    orderId: string;
    speedMetersPerSecond?: number;
  },
) {
  const supabase = staffLeaseBoundAdminClient();
  if (!supabase) return unavailableRpcResult();

  return supabase.rpc("storefront_courier_location_upsert_v1", {
    p_bearing_degrees: input.bearingDegrees,
    p_expected_credential_version: context.staffWebSession.credentialVersion,
    p_horizontal_accuracy_meters: input.horizontalAccuracyMeters,
    p_idempotency_key: input.idempotencyKey,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_observed_at: input.observedAt,
    p_order_id: input.orderId,
    p_session_token_hash: context.staffWebSession.sessionTokenHash,
    p_shop_id: context.selectedShop.shopId,
    p_speed_meters_per_second: input.speedMetersPerSecond,
    p_staff_id: context.actorStaffId,
    p_staff_web_session_id: context.staffWebSession.sessionId,
  });
}
