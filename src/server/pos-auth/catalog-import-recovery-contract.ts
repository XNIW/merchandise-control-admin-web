import "server-only";
import { createHash } from "node:crypto";
import { parseForensicCatalogImportInput, type ParsedCatalogImportInput } from "./catalog-import-sync";

export const POS_CATALOG_IMPORT_RECEIPT_SCHEMA_VERSION = "pos-catalog-import-receipt-v1";
export const POS_CATALOG_IMPORT_RETIREMENT_SCHEMA_VERSION = "pos-catalog-import-retirement-v1";

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function hasUnsupportedOriginalPrecision(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && !Number.isSafeInteger(value);
  if (typeof value === "string") return /^-?\d{65,}$/.test(value);
  if (Array.isArray(value)) return value.some(hasUnsupportedOriginalPrecision);
  return record(value) && Object.values(value).some(hasUnsupportedOriginalPrecision);
}

// A correction's baseSnapshot is a DB double, not a forensic Int64 literal.
// Only its saved original import requires lossless legacy numeric provenance.
export function hasUnsupportedForensicOriginalPrecision(original: unknown): boolean {
  const request=unwrapSavedForensicRequest(original);
  return record(request) && request.schemaVersion === POS_CATALOG_IMPORT_CORRECTION_SCHEMA_VERSION && record(request.recoveryOf)
    ? hasUnsupportedOriginalPrecision(request.recoveryOf.originalRequest)
    : hasUnsupportedOriginalPrecision(request);
}

// Persisted correction storage wraps the immutable request with a saved receipt.
// That receipt is local evidence only; authoritative lookup still comes from DB.
export function unwrapSavedForensicRequest(value:unknown):unknown {
  return record(value) && record(value.request) && Object.keys(value).every(key=>key==="request"||key==="originalReceipt")
    ? value.request:value;
}

export function parseOriginalImportReceipt(input: unknown, retirement = false, maxItems = 1000): ParsedCatalogImportInput | null {
  if (!record(input) || !record(input.originalRequest) ||
    input.schemaVersion !== (retirement ? POS_CATALOG_IMPORT_RETIREMENT_SCHEMA_VERSION : POS_CATALOG_IMPORT_RECEIPT_SCHEMA_VERSION)) return null;
  const saved = unwrapSavedForensicRequest(input.originalRequest);
  if (!record(saved)) return null;
  // The C# saved PayloadJson omits its outbox payloadHash. Supply that separate
  // immutable metadata only in this transient parser view, never in saved JSON.
  const original: Record<string,unknown> = {...saved,payloadHash:saved.payloadHash ?? input.payloadHash};
  if (hasUnsupportedOriginalPrecision(original)) return null;
  if ((original.shopDeviceId !== undefined && original.shopDeviceId !== input.shopDeviceId) ||
    (original.shopCode !== undefined && original.shopCode !== input.shopCode)) return null;
  if (!record(original.batch) || original.batch.clientImportId !== input.clientImportId ||
    original.batch.idempotencyKey !== input.idempotencyKey || original.payloadHash !== input.payloadHash ||
    typeof input.payloadHash !== "string") return null;
  // Recalculate the original import canonical hash; current outer trust is the
  // sole authorization source. These fields are excluded from the import hash.
  const parsed = parseForensicCatalogImportInput({
    ...original,
    deviceToken: input.deviceToken,
    sessionToken: input.sessionToken,
    posSessionId: input.posSessionId,
    shopDeviceId: input.shopDeviceId,
    shopCode: input.shopCode,
  }, maxItems);
  return parsed && parsed.clientImportId === input.clientImportId &&
    parsed.idempotencyKey === input.idempotencyKey && parsed.declaredPayloadHash === input.payloadHash
    ? parsed : null;
}

export const POS_CATALOG_IMPORT_CORRECTION_SCHEMA_VERSION = "pos-catalog-import-correction-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REVISION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const HASH = /^[A-Za-z0-9:_-]{16,128}$/;
const SENSITIVE = /mcpos_|token|secret|password|credential|bearer|eyJ/i;
const FIELDS = ["purchasePrice", "retailPrice", "quantityDelta"] as const;
function safeId(value: unknown): value is string { return typeof value === "string" && ID.test(value) && !SENSITIVE.test(value); }
function safeHash(value: unknown): value is string { return typeof value === "string" && HASH.test(value) && !SENSITIVE.test(value); }
export function parsePosCatalogImportCorrection(input: unknown, verifiedOriginal?: ParsedCatalogImportInput) {
  if (!record(input) || input.schemaVersion !== POS_CATALOG_IMPORT_CORRECTION_SCHEMA_VERSION || !record(input.recoveryOf) || !record(input.correction)) return null;
  const original = verifiedOriginal ?? parseOriginalImportReceipt({...input.recoveryOf, schemaVersion:POS_CATALOG_IMPORT_RECEIPT_SCHEMA_VERSION,
    shopDeviceId:input.shopDeviceId,posSessionId:input.posSessionId,deviceToken:input.deviceToken,sessionToken:input.sessionToken,shopCode:input.shopCode});
  const correction = input.correction;
  if (!original || !safeId(correction.clientImportId) || !safeId(correction.idempotencyKey) || !safeHash(correction.payloadHash) ||
    correction.clientImportId === original.clientImportId || correction.idempotencyKey === original.idempotencyKey ||
    typeof correction.createdAt !== "string" || !Number.isFinite(Date.parse(correction.createdAt)) ||
    !Array.isArray(correction.items) || correction.items.length < 1 || correction.items.length > Math.min(1000,original.items.length)) return null;
  const originalItemIds = new Set(original.items.map(item=>item.clientItemId));
  const items = correction.items.map((item) => {
    if (!record(item) || Object.keys(item).some((key)=>!["clientItemId","remoteProductId","baseRevision","baseSnapshot","fieldMask","changes"].includes(key)) ||
      !safeId(item.clientItemId) || !originalItemIds.has(item.clientItemId) ||
      typeof item.remoteProductId!=="string" || !UUID.test(item.remoteProductId) || typeof item.baseRevision!=="string" || !REVISION.test(item.baseRevision) ||
      !Array.isArray(item.fieldMask) || item.fieldMask.length<1 || item.fieldMask.length>3 || !record(item.changes) || !record(item.baseSnapshot)) return null;
    const mask = item.fieldMask;
    const changes = item.changes;
    const snapshot = item.baseSnapshot;
    if (new Set(mask).size!==mask.length || mask.some((key)=>!FIELDS.includes(key as typeof FIELDS[number])) ||
      Object.keys(changes).length!==mask.length || Object.keys(changes).some((key)=>!mask.includes(key))) return null;
    const snapshotFields = mask.map((field)=>field==="quantityDelta"?"stockQuantity":field);
    if (Object.keys(snapshot).length!==snapshotFields.length || Object.keys(snapshot).some((key)=>!snapshotFields.includes(key)) ||
      Object.values(snapshot).some((value)=>value!==null && (typeof value!=="number" || !Number.isFinite(value)))) return null;
    const normalized: Record<string, number> = {};
    for (const field of [...mask].sort() as string[]) {
      const value=changes[field];
      if (typeof value!=="number" || !Number.isFinite(value) || Math.abs(value*1000-Math.round(value*1000))>0.000001 || (field==="quantityDelta"
        ? value===0 || Math.abs(value)>1_000_000_000 || Math.abs(value*1000-Math.round(value*1000))>0.000001
        : value<0 || value>999_999_999)) return null;
      normalized[field]=value;
    }
    const baseSnapshot = Object.fromEntries(Object.keys(snapshot).sort().map((key)=>[key,snapshot[key]])) as Record<string,number|null>;
    return {clientItemId:item.clientItemId,remoteProductId:item.remoteProductId,baseRevision:item.baseRevision,baseSnapshot,fieldMask:[...mask].sort() as string[],changes:normalized};
  });
  if (items.some((item)=>item===null)) return null;
  const valid = items as NonNullable<typeof items[number]>[];
  if (new Set(valid.map((item)=>item.clientItemId)).size!==valid.length || new Set(valid.map((item)=>item.remoteProductId)).size!==valid.length) return null;
  valid.sort((a,b)=>a.remoteProductId.localeCompare(b.remoteProductId));
  const canonical = {schemaVersion:POS_CATALOG_IMPORT_CORRECTION_SCHEMA_VERSION,recoveryOf:{clientImportId:original.clientImportId,idempotencyKey:original.idempotencyKey,canonicalPayloadHash:original.payloadHash},
    correction:{clientImportId:correction.clientImportId,idempotencyKey:correction.idempotencyKey,createdAt:new Date(correction.createdAt).toISOString(),items:valid}};
  return {original,...canonical.correction,payloadHash:correction.payloadHash,canonicalPayloadHash:`sha256:${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`};
}
export function validCorrectionReceipt(receipt: unknown, parsed: NonNullable<ReturnType<typeof parsePosCatalogImportCorrection>>): boolean {
    if (!record(receipt) || receipt.ok!==true || typeof receipt.batchId!=="string" || !UUID.test(receipt.batchId) ||
      receipt.status!=="accepted" || !Array.isArray(receipt.items) || receipt.items.length!==parsed.items.length ||
      !Array.isArray(receipt.remoteProductIds) || receipt.remoteProductIds.length!==parsed.items.length || !Array.isArray(receipt.remotePriceIds) ||
      !record(receipt.summary) || receipt.summary.acceptedItemCount!==parsed.items.length || receipt.summary.duplicateItemCount!==0 || receipt.summary.productCount!==parsed.items.length ||
      !receipt.items.every((item)=>record(item) && item.status==="accepted" && typeof item.authoritativeRevision==="string" && REVISION.test(item.authoritativeRevision) &&
        Array.isArray(item.unchangedFields) && new Set(item.unchangedFields).size===item.unchangedFields.length &&
        parsed.items.some((expected)=>item.clientItemId===expected.clientItemId && item.remoteProductId===expected.remoteProductId &&
          (item.unchangedFields as unknown[]).every((field)=>typeof field==="string" && ["retailPrice","purchasePrice"].includes(field) &&
            expected.fieldMask.includes(field) && expected.changes[field]===expected.baseSnapshot[field]))) ||
      new Set(receipt.items.map((item)=>record(item)?item.clientItemId:null)).size!==parsed.items.length ||
      !receipt.remoteProductIds.every((mapping)=>record(mapping) && parsed.items.some((expected)=>mapping.clientItemId===expected.clientItemId && mapping.remoteProductId===expected.remoteProductId) &&
        (receipt as Record<string, unknown[]>).items.some((item)=>record(item) && item.clientItemId===mapping.clientItemId && item.authoritativeRevision===mapping.authoritativeRevision)) ||
      new Set(receipt.remoteProductIds.map((mapping)=>record(mapping)?mapping.clientItemId:null)).size!==parsed.items.length ||
      !receipt.remotePriceIds.every((mapping)=>record(mapping) && typeof mapping.remotePriceId==="string" && UUID.test(mapping.remotePriceId) &&
        parsed.items.some((expected)=>mapping.clientItemId===expected.clientItemId && mapping.remoteProductId===expected.remoteProductId &&
          expected.fieldMask.includes(mapping.priceType==="purchase"?"purchasePrice":mapping.priceType==="retail"?"retailPrice":"invalid"))) ||
      new Set(receipt.remotePriceIds.map((mapping)=>record(mapping)?`${mapping.clientItemId}:${mapping.priceType}`:null)).size!==receipt.remotePriceIds.length ||
      new Set(receipt.remotePriceIds.map((mapping)=>record(mapping)?mapping.remotePriceId:null)).size!==receipt.remotePriceIds.length ||
      !parsed.items.every((expected)=>expected.fieldMask.filter((field)=>field!=="quantityDelta").every((field)=>{
        const item=(receipt.items as Record<string,unknown>[]).find((entry)=>entry.clientItemId===expected.clientItemId)!;
        const noEffect=(item.unchangedFields as string[]).includes(field);
        const priceMapped=(receipt.remotePriceIds as Record<string,unknown>[]).some((mapping)=>mapping.clientItemId===expected.clientItemId &&
          mapping.priceType===(field==="retailPrice"?"retail":"purchase"));
        return noEffect !== priceMapped;
      }))) return false;
  return true;
}

export function parsePosCatalogImportReceipt(input: unknown, retirement = false) {
  if (!record(input) || !record(input.originalRequest) ||
    input.schemaVersion !== (retirement ? POS_CATALOG_IMPORT_RETIREMENT_SCHEMA_VERSION : POS_CATALOG_IMPORT_RECEIPT_SCHEMA_VERSION)) return null;
  const original = unwrapSavedForensicRequest(input.originalRequest);
  if (!record(original)) return null;
  if (original.schemaVersion !== POS_CATALOG_IMPORT_CORRECTION_SCHEMA_VERSION) {
    const parsed = parseOriginalImportReceipt({...input,originalRequest:original}, retirement);
    return parsed ? {...parsed, originalSchemaVersion: "pos-catalog-import-v1" as const, correctionTarget: null} : null;
  }
  if ((original.shopDeviceId !== undefined && original.shopDeviceId !== input.shopDeviceId) ||
    (original.shopCode !== undefined && original.shopCode !== input.shopCode)) return null;
  const correction = parsePosCatalogImportCorrection({...original,
    shopDeviceId:input.shopDeviceId,posSessionId:input.posSessionId,deviceToken:input.deviceToken,
    sessionToken:input.sessionToken,shopCode:input.shopCode});
  if (!correction || correction.clientImportId !== input.clientImportId ||
    correction.idempotencyKey !== input.idempotencyKey || correction.payloadHash !== input.payloadHash) return null;
  return {...correction.original,clientImportId:correction.clientImportId,idempotencyKey:correction.idempotencyKey,
    payloadHash:correction.canonicalPayloadHash,declaredPayloadHash:correction.payloadHash,
    originalSchemaVersion:POS_CATALOG_IMPORT_CORRECTION_SCHEMA_VERSION,correctionTarget:correction};
}
