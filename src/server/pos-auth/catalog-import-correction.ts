import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseForPosCatalogImport, validatePosCatalogImportAuth, type PosCatalogImportRequestMeta } from "./catalog-import-sync";

import {hasUnsupportedOriginalPrecision,parsePosCatalogImportCorrection,validCorrectionReceipt,
  POS_CATALOG_IMPORT_CORRECTION_SCHEMA_VERSION} from "./catalog-import-recovery-contract";
export {parsePosCatalogImportCorrection} from "./catalog-import-recovery-contract";
function record(value: unknown): value is Record<string, unknown> {return Boolean(value && typeof value === "object" && !Array.isArray(value));}
function failure(code: string, status: number) {return {body:{ok:false,code,message:"POS import correction request failed."},status};}

export async function handlePosCatalogImportCorrection(input: unknown, meta: PosCatalogImportRequestMeta = {}) {
  if (record(input) && record(input.recoveryOf) && hasUnsupportedOriginalPrecision(input.recoveryOf.originalRequest)) return failure("original_numeric_precision_unsupported",400);
  const parsed=parsePosCatalogImportCorrection(input);
  if (!parsed) return failure("validation_failed",400);
  const supabase=await getSupabaseForPosCatalogImport();
  if (!supabase) return failure("not_configured",503);
  const auth=await validatePosCatalogImportAuth(supabase,parsed.original,meta,false);
  if (auth.result) return auth.result;
  const {context}=auth;
  const result=await supabase.rpc("pos_catalog_import_correct_v1",{
    p_shop_id:context.session.shop_id,p_shop_device_id:context.session.shop_device_id,p_staff_id:context.staff.staff_id,
    p_pos_session_id:context.session.pos_session_id,p_owner_user_id:context.ownerUserId,
    p_original_client_import_id:parsed.original.clientImportId,p_original_idempotency_key:parsed.original.idempotencyKey,p_original_payload_hash:parsed.original.payloadHash,
    p_client_import_id:parsed.clientImportId,p_idempotency_key:parsed.idempotencyKey,p_payload_hash:parsed.canonicalPayloadHash,p_created_at:parsed.createdAt,p_items:parsed.items as unknown as Json,
  });
  if (result.error || !record(result.data)) return failure("db_failure",500);
  const data=result.data;
  if (data.ok!==true) return failure(typeof data.code==="string"?data.code:"db_failure",data.code==="auth_denied"?401:data.code==="not_configured"?503:data.code==="validation_failed"?400:data.code==="scope_changed"?409:500);
  if (!["accepted","duplicate","conflict"].includes(String(data.status)) || data.shopId!==context.session.shop_id || data.shopDeviceId!==context.session.shop_device_id ||
    data.clientImportId!==parsed.clientImportId || data.idempotencyKey!==parsed.idempotencyKey || data.payloadHash!==parsed.canonicalPayloadHash) return failure("db_failure",500);
  if (data.status!=="conflict" && !validCorrectionReceipt(data.receipt,parsed)) return failure("db_failure",500);
  return {body:{ok:true,code:"success",schemaVersion:POS_CATALOG_IMPORT_CORRECTION_SCHEMA_VERSION,status:data.status,
    shopId:context.session.shop_id,shopDeviceId:context.session.shop_device_id,clientImportId:parsed.clientImportId,idempotencyKey:parsed.idempotencyKey,
    payloadHash:parsed.payloadHash,canonicalPayloadHash:parsed.canonicalPayloadHash,
    ...(data.status==="conflict"?{reason:typeof data.reason==="string"?data.reason:"identity_conflict"}:{receipt:data.receipt as Json})},status:200};
}
