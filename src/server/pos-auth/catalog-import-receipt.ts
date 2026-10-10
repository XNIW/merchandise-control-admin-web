import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import {
  getSupabaseForPosCatalogImport,
  parseAppliedCatalogImport,
  validatePosCatalogImportAuth,
  type PosCatalogImportRequestMeta,
} from "./catalog-import-sync";

import {hasUnsupportedForensicOriginalPrecision, parsePosCatalogImportReceipt, validCorrectionReceipt,
  POS_CATALOG_IMPORT_RECEIPT_SCHEMA_VERSION, POS_CATALOG_IMPORT_RETIREMENT_SCHEMA_VERSION} from "./catalog-import-recovery-contract";
export {hasUnsupportedOriginalPrecision, parsePosCatalogImportReceipt} from "./catalog-import-recovery-contract";
function record(value: unknown): value is Record<string, unknown> {return Boolean(value && typeof value === "object" && !Array.isArray(value));}
function failure(code: string, status: number) {return {body:{ok:false,code,message:"POS import receipt request failed."},status};}

export async function handlePosCatalogImportReceipt(
  input: unknown,
  meta: PosCatalogImportRequestMeta = {},
  retirement = false,
) {
  if (record(input) && hasUnsupportedForensicOriginalPrecision(input.originalRequest)) return failure("original_numeric_precision_unsupported", 400);
  const parsed = parsePosCatalogImportReceipt(input, retirement);
  if (!parsed) return failure("validation_failed", 400);
  const supabase = await getSupabaseForPosCatalogImport();
  if (!supabase) return failure("not_configured", 503);
  const auth = await validatePosCatalogImportAuth(supabase, parsed, meta, false);
  if (auth.result) return auth.result;
  const context = auth.context;
  const result = await supabase.rpc(retirement ? "pos_catalog_import_retire_v1" : "pos_catalog_import_receipt_v1", {
    p_shop_id: context.session.shop_id,
    p_shop_device_id: context.session.shop_device_id,
    p_staff_id: context.staff.staff_id,
    p_pos_session_id: context.session.pos_session_id,
    p_owner_user_id: context.ownerUserId,
    p_client_import_id: parsed.clientImportId,
    p_idempotency_key: parsed.idempotencyKey,
    p_payload_hash: parsed.payloadHash,
  });
  if (result.error || !record(result.data)) return failure("db_failure", 500);
  const data = result.data;
  if (data.ok !== true) {
    const code = data.code;
    return failure(typeof code === "string" ? code : "db_failure",
      code === "auth_denied" ? 401 : code === "scope_changed" || code === "quota_exceeded" || code === "identity_conflict" ? 409 : code === "not_configured" ? 503 : 500);
  }
  const status = data.status;
  if (!(status === "accepted" || status === "conflict" || (retirement ? status === "retired" : status === "not_found")) ||
    data.shopId !== context.session.shop_id || data.shopDeviceId !== context.session.shop_device_id ||
    data.clientImportId !== parsed.clientImportId || data.idempotencyKey !== parsed.idempotencyKey ||
    data.payloadHash !== parsed.payloadHash) return failure("db_failure", 500);
  if (status === "accepted") {
    if (!record(data.receipt) || data.receipt.ok !== true || !record(data.receipt.summary) ||
      !(parsed.correctionTarget ? validCorrectionReceipt(data.receipt, parsed.correctionTarget) :
        parseAppliedCatalogImport(data.receipt, data.receipt.summary, String(data.receipt.status), parsed))) {
      return failure("receipt_unavailable", 409);
    }
    const maps = data.receipt.remoteProductIds as Array<{clientItemId: string; remoteProductId: string}>;
    if (!Array.isArray(data.currentProductSnapshots) || data.currentProductSnapshots.length !== maps.length ||
      new Set(data.currentProductSnapshots.map((snapshot) => record(snapshot) ? snapshot.clientItemId : null)).size !== maps.length ||
      !data.currentProductSnapshots.every((snapshot) => record(snapshot) &&
        maps.some((mapping) => snapshot.clientItemId === mapping.clientItemId && snapshot.remoteProductId === mapping.remoteProductId) &&
        (snapshot.snapshotStatus === "available"
          ? typeof snapshot.baseRevision === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(snapshot.baseRevision) &&
            [snapshot.retailPrice,snapshot.purchasePrice,snapshot.stockQuantity].every((value) => value === null || (typeof value === "number" && Number.isFinite(value)))
          : snapshot.snapshotStatus === "unavailable" && [snapshot.baseRevision,snapshot.retailPrice,snapshot.purchasePrice,snapshot.stockQuantity].every((value) => value === null)))) {
      return failure("db_failure", 500);
    }
  }
  if (status === "retired" && (data.oldIdentityBlocked !== true || typeof data.retiredAt !== "string" || !Number.isFinite(Date.parse(data.retiredAt)))) {
    return failure("db_failure", 500);
  }
  return {
    body: {
      ok: true, code: "success", schemaVersion: retirement ? POS_CATALOG_IMPORT_RETIREMENT_SCHEMA_VERSION : POS_CATALOG_IMPORT_RECEIPT_SCHEMA_VERSION,
      status, originalSchemaVersion:parsed.originalSchemaVersion, shopId: context.session.shop_id, shopDeviceId: context.session.shop_device_id,
      clientImportId: parsed.clientImportId, idempotencyKey: parsed.idempotencyKey,
      payloadHash: parsed.declaredPayloadHash!, canonicalPayloadHash: parsed.payloadHash,
      ...(status === "accepted" ? { receipt: data.receipt as Json, currentProductSnapshots: data.currentProductSnapshots as Json } : {}),
      ...(status === "conflict" ? { reason: typeof data.reason === "string" ? data.reason : "identity_conflict" } : {}),
      ...(status === "not_found" ? { snapshotOnly: true, replacementAllowed: false } : {}),
      ...(status === "retired" ? { retiredAt: data.retiredAt as string, oldIdentityBlocked: true } : {}),
    },
    status: 200,
  };
}
