import "server-only";
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { validateCatalogIdentityText } from "@/lib/catalog-text-policy";
import { parseCatalogImportInput, type ParsedCatalogImportInput } from "./catalog-import-sync";
import { hasUnsupportedForensicOriginalPrecision, parseOriginalImportReceipt, parsePosCatalogImportCorrection, unwrapSavedForensicRequest } from "./catalog-import-recovery-contract";

export const MULTIPART_SCHEMA = "pos-catalog-import-recovery-multipart-v1";
export const PLAN_SCHEMA = "pos-catalog-import-recovery-plan-v1";
export const MAX_RAW_PART_BYTES = 256 * 1024;
export const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
export const MAX_PARTS = 128;
export const MAX_ITEMS = 60000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
export function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
export function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
export function isHash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
export function sha256(value: string | Buffer): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
export type RecoveryTrust = Pick<ParsedCatalogImportInput,"posSessionId"|"shopDeviceId"|"sessionToken"|"deviceToken"|"shopCode"|"appVersion">;
export function parseRecoveryTrust(input: unknown): RecoveryTrust | null {
  if (!record(input) || input.schemaVersion !== MULTIPART_SCHEMA || !isUuid(input.shopDeviceId) || !isUuid(input.posSessionId) ||
    typeof input.deviceToken !== "string" || !input.deviceToken.length || input.deviceToken.length > 256 ||
    typeof input.sessionToken !== "string" || !input.sessionToken.length || input.sessionToken.length > 256 ||
    input.shopCode!==undefined && input.shopCode!==null && typeof input.shopCode!=="string") return null;
  const shopCode=validateCatalogIdentityText(typeof input.shopCode==="string"?input.shopCode:"",{maxLength:80,required:false});
  if (shopCode.status==="rejected") return null;
  return {shopDeviceId:input.shopDeviceId,posSessionId:input.posSessionId,deviceToken:input.deviceToken,sessionToken:input.sessionToken,shopCode:shopCode.value||undefined};
}
export type UploadManifest = {mode:"original"|"plan"; originalKind?:"ordinary"|"correction";declaredPayloadHash?:string;totalByteLength:number; rawSha256:string; parts:Array<{index:number;byteLength:number;sha256:string}>};
export function parseUpload(input: Record<string, unknown>) {
  if (!isUuid(input.uploadId) || !["original","plan"].includes(String(input.mode)) || !isHash(input.rawSha256) ||
    !Number.isInteger(input.totalByteLength) || Number(input.totalByteLength)<1 || Number(input.totalByteLength)>MAX_TOTAL_BYTES ||
    !Array.isArray(input.parts) || input.parts.length<1 || input.parts.length>MAX_PARTS ||
    !Number.isInteger(input.partIndex) || typeof input.contentBase64!=="string" || input.contentBase64.length>Math.ceil(MAX_RAW_PART_BYTES/3)*4) return null;
  if (input.mode==="original" && (!["ordinary","correction"].includes(String(input.originalKind)) || typeof input.declaredPayloadHash!=="string" ||
    !/^[A-Za-z0-9:_-]{16,128}$/.test(input.declaredPayloadHash) || /mcpos_|token|secret|password|credential|bearer|eyJ/i.test(input.declaredPayloadHash))) return null;
  if (input.mode==="plan" && (input.originalKind!==undefined || input.declaredPayloadHash!==undefined)) return null;
  const parts=input.parts.map((part,index)=>record(part) && Object.keys(part).length===3 && part.index===index && Number.isInteger(part.byteLength) && Number(part.byteLength)>=1 && Number(part.byteLength)<=MAX_RAW_PART_BYTES && isHash(part.sha256)
    ? {index,byteLength:Number(part.byteLength),sha256:part.sha256}:null);
  if (parts.some(part=>!part) || parts.reduce((sum,part)=>sum+part!.byteLength,0)!==input.totalByteLength || Number(input.partIndex)<0 || Number(input.partIndex)>=parts.length) return null;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64)) return null;
  const bytes=Buffer.from(input.contentBase64,"base64");
  const part=parts[Number(input.partIndex)]!;
  if (bytes.toString("base64")!==input.contentBase64 || bytes.length!==part.byteLength || sha256(bytes)!==part.sha256) return null;
  const manifest:UploadManifest={mode:input.mode as UploadManifest["mode"],...(input.mode==="original"?{originalKind:input.originalKind as "ordinary"|"correction",declaredPayloadHash:input.declaredPayloadHash as string}:{}),totalByteLength:Number(input.totalByteLength),rawSha256:input.rawSha256,parts:parts as UploadManifest["parts"]};
  return {uploadId:input.uploadId,manifest,manifestSha256:sha256(JSON.stringify(manifest)),partIndex:Number(input.partIndex),contentBase64:input.contentBase64};
}
export function rebuildUpload(data: unknown): {raw:Buffer; value:unknown; manifest:UploadManifest} | null {
  if (!record(data) || !record(data.manifest) || !Array.isArray(data.parts)) return null;
  const manifest=data.manifest as unknown as UploadManifest;
  if (!Array.isArray(manifest.parts) || manifest.parts.length<1 || manifest.parts.length>MAX_PARTS || data.parts.length!==manifest.parts.length || !isHash(manifest.rawSha256)) return null;
  const buffers:Buffer[]=[];
  for (let index=0; index<manifest.parts.length;index++) {
    const part=data.parts[index];const expected=manifest.parts[index];
    if (!record(part) || part.index!==index || typeof part.contentBase64!=="string") return null;
    const bytes=Buffer.from(part.contentBase64,"base64");
    if (bytes.toString("base64")!==part.contentBase64 || bytes.length!==expected.byteLength || bytes.length>MAX_RAW_PART_BYTES || sha256(bytes)!==expected.sha256) return null;
    buffers.push(bytes);
  }
  const raw=Buffer.concat(buffers);
  if (raw.length!==manifest.totalByteLength || raw.length>MAX_TOTAL_BYTES || sha256(raw)!==manifest.rawSha256) return null;
  try {
    const value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
    // JSON.parse can round Int64. Reject every unsafe numeric integer before
    // normalization; exact bounded decimal text remains forensic text.
    if ((manifest.mode==="original" && hasUnsupportedForensicOriginalPrecision(value)) || nonFinite(value)) return null;
    return {raw,value,manifest};
  } catch {return null;}
}
function nonFinite(value:unknown):boolean {
  if (typeof value==="number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(nonFinite);
  return record(value) && Object.values(value).some(nonFinite);
}
export function originalEnvelope(value: unknown, trust: RecoveryTrust, declaredPayloadHash?:string) {
  value=unwrapSavedForensicRequest(value);
  if (!record(value) || !record(value.batch)) return null;
  return {...trust,schemaVersion:"pos-catalog-import-receipt-v1",clientImportId:value.batch.clientImportId,idempotencyKey:value.batch.idempotencyKey,payloadHash:declaredPayloadHash??value.payloadHash,originalRequest:value};
}
export function parseLargeOriginal(value: unknown, trust: RecoveryTrust, declaredPayloadHash?:string) {
  const envelope=originalEnvelope(value,trust,declaredPayloadHash);
  return envelope ? parseOriginalImportReceipt(envelope,false,MAX_ITEMS):null;
}
// Only business provenance is stored in normalized JSON. Current trust is
// reloaded and validated on every request; saved old trust never authorizes.
export function businessOriginal(parsed:ParsedCatalogImportInput) {
  const {deviceToken: _device,sessionToken: _session,posSessionId: _pos,shopDeviceId: _shopDevice,shopCode: _shop, ...business}=parsed;
  void _device;void _session;void _pos;void _shopDevice;void _shop;
  return business;
}
export type VerifiedBusiness = ReturnType<typeof businessOriginal>;
export function hydrateOriginal(value:unknown,trust:RecoveryTrust):ParsedCatalogImportInput|null {
  if (!record(value) || !Array.isArray(value.items) || !isHash(value.payloadHash) || typeof value.clientImportId!=="string" || typeof value.idempotencyKey!=="string" ||
    !value.items.length || value.items.length>MAX_ITEMS || !record(value.summary)) return null;
  return {...value,...trust} as unknown as ParsedCatalogImportInput;
}
export type NormalizedChild = {index:number;kind:"ordinary"|"correction";clientImportId:string;idempotencyKey:string;payloadHash:string;declaredPayloadHash:string;createdAt:string;items:unknown[];summary:unknown;normalized:unknown};
export type Contributor = {rawItems:Array<Record<string,unknown>>;receiptSha256:string;productByClientId:Map<string,string>};
export type PredecessorPart = {receiptSha256:string;canonicalPayloadHash:string;productByClientId:Map<string,{remoteProductId:string|null;barcode:string;originalClientItemId:string;itemStatus:"accepted"|"duplicate"|"skipped"}>};
function intentKey(item:Record<string,unknown>) {
  // Omitted fields and explicit null remain distinct. Correlation IDs and row
  // positions differ between historical imports, but every business input must
  // match the exact immutable contributor request; no current preview values.
  const excluded=new Set(["clientItemId","client_item_id","rowNumber","row_number"]);
  return JSON.stringify(Object.fromEntries(Object.keys(item).filter(key=>!excluded.has(key)).sort().map(key=>[key,item[key]])));
}
export function parseRecoveryPlan(value: unknown, original:ParsedCatalogImportInput, verifiedOriginalId:string, trust:RecoveryTrust, contributors:Map<string,Contributor>=new Map(),predecessorParts:Map<string,PredecessorPart>=new Map(), selectedChildren?:NormalizedChild[]) {
  if (!record(value) || value.schemaVersion!==PLAN_SCHEMA || !isUuid(value.planId) || value.verifiedOriginalId!==verifiedOriginalId ||
    !["replacement","correction"].includes(String(value.mode)) || !Array.isArray(value.parts) || value.parts.length>(selectedChildren?1024:MAX_PARTS) || !Array.isArray(value.coverage)) return null;
  let supersedes:{planId:string;retiredChildren:Array<{partIndex:number;canonicalPayloadHash:string}>}|undefined;
  if(value.supersedes!==undefined) {
    if(!record(value.supersedes) || Object.keys(value.supersedes).length!==2 || !isUuid(value.supersedes.planId) || value.supersedes.planId===value.planId ||
      !Array.isArray(value.supersedes.retiredChildren) || value.supersedes.retiredChildren.length>(selectedChildren?1024:MAX_PARTS)) return null;
    const retiredChildren=value.supersedes.retiredChildren.map(entry=>record(entry) && Object.keys(entry).length===2 &&
      Number.isInteger(entry.partIndex) && Number(entry.partIndex)>=0 && Number(entry.partIndex)<(selectedChildren?1024:MAX_PARTS) && isHash(entry.canonicalPayloadHash)
      ?{partIndex:Number(entry.partIndex),canonicalPayloadHash:entry.canonicalPayloadHash}:null);
    if(retiredChildren.some(entry=>!entry) || new Set(retiredChildren.map(entry=>entry!.partIndex)).size!==retiredChildren.length) return null;
    supersedes={planId:value.supersedes.planId,retiredChildren:retiredChildren as NonNullable<typeof retiredChildren[number]>[]};
  }
  const contributorRaw=new Map(Array.from(contributors,([id,proof])=>[id,new Map(proof.rawItems.map(item=>[item.clientItemId,item]))]));
  const children:NormalizedChild[]=selectedChildren??[];
  for (let index=0;!selectedChildren && index<value.parts.length;index++) {
    const part=value.parts[index];
    if (!record(part) || Object.keys(part).length!==2 || part.index!==index || !record(part.request) || Buffer.byteLength(JSON.stringify(part.request),"utf8")>512*1024) return null;
    if (value.mode==="replacement") {
      const parsed=parseCatalogImportInput({...part.request,...trust});
      if (!parsed || !parsed.declaredPayloadHash || parsed.clientImportId===original.clientImportId || parsed.idempotencyKey===original.idempotencyKey) return null;
      children.push({index,kind:"ordinary",clientImportId:parsed.clientImportId,idempotencyKey:parsed.idempotencyKey,payloadHash:parsed.payloadHash,declaredPayloadHash:parsed.declaredPayloadHash,createdAt:parsed.batchCreatedAt,items:parsed.items,summary:parsed.summary,normalized:businessOriginal(parsed)});
    } else {
      if (!record(part.request.recoveryOf) || Object.keys(part.request.recoveryOf).length!==1 || part.request.recoveryOf.verifiedOriginalId!==verifiedOriginalId) return null;
      const parsed=parsePosCatalogImportCorrection({...part.request,...trust},original);
      if (!parsed) return null;
      children.push({index,kind:"correction",clientImportId:parsed.clientImportId,idempotencyKey:parsed.idempotencyKey,payloadHash:parsed.canonicalPayloadHash,declaredPayloadHash:parsed.payloadHash,createdAt:parsed.createdAt,items:parsed.items,summary:null,normalized:{verifiedOriginalId,originalCanonicalPayloadHash:original.payloadHash}});
    }
  }
  const items=children.flatMap(child=>child.items as Record<string,unknown>[]);
  if (items.length>MAX_ITEMS || new Set(children.map(child=>child.clientImportId)).size!==children.length || new Set(children.map(child=>child.idempotencyKey)).size!==children.length ||
    new Set(items.map(item=>item.clientItemId)).size!==items.length) return null;
  const originalIds=new Set(original.items.map(item=>item.clientItemId));
  const originalById=new Map(original.items.map(item=>[item.clientItemId,item]));
  const coverage:Record<string,unknown>[]=[];
  const coveredChildren=new Set<string>();
  const contributorBarcodes:string[]=[];const contributorProducts:string[]=[];
  for (const entry of value.coverage) {
    if (!record(entry) || typeof entry.clientItemId!=="string" || !originalIds.has(entry.clientItemId)) return null;
    if (entry.kind==="child") {
      const child=children.find(child=>child.index===Number(entry.partIndex));
      const childItem=child?.items.find(item=>record(item) && item.clientItemId===entry.childClientItemId);
      if (Object.keys(entry).length!==4 || !Number.isInteger(entry.partIndex) || !child || !record(childItem) ||
        (child.kind==="correction" && entry.childClientItemId!==entry.clientItemId)) return null;
      const key=`${entry.partIndex}:${entry.childClientItemId}`;
      if (coveredChildren.has(key)) return null;coveredChildren.add(key);coverage.push({...entry});
    } else if (entry.kind==="accepted_contributor") {
      if (Object.keys(entry).length!==5 || !isUuid(entry.verifiedContributorId) || typeof entry.contributorClientItemId!=="string" || !record(entry.desiredItem)) return null;
      const contributor=contributors.get(entry.verifiedContributorId);
      const raw=contributorRaw.get(entry.verifiedContributorId)?.get(entry.contributorClientItemId);
      if (!contributor || !raw || entry.desiredItem.clientItemId!==entry.clientItemId || intentKey(raw)!==intentKey(entry.desiredItem)) return null;
      const desired=parseCatalogImportInput({schemaVersion:"pos-catalog-import-v1",source:"supplier_excel",...trust,
        batch:{clientImportId:"proof-intent",idempotencyKey:"proof-intent-idem",createdAt:original.batchCreatedAt,attemptCount:1},
        payloadHash:"fixture-intent-proof",summary:{newProducts:1,updatedProducts:1},items:[entry.desiredItem]});
      if (!desired || !["new","updated"].includes(desired.items[0].changeKind) || desired.items[0].barcode!==originalById.get(entry.clientItemId)?.barcode) return null;
      const remoteProductId=contributor.productByClientId.get(entry.contributorClientItemId);
      if (!remoteProductId) return null;
      contributorBarcodes.push(desired.items[0].barcode);contributorProducts.push(remoteProductId);
      // Legacy raw prices that normalization rejected cannot prove that desired
      // price was ever applied merely because the batch has an accepted ACK.
      for (const [field,alias] of [["retailPrice","retail_price"],["purchasePrice","purchase_price"],["quantity","stockQuantity"]] as const) {
        const inputValue=entry.desiredItem[field]??entry.desiredItem[alias];
        if (inputValue!==undefined && inputValue!==null && desired.items[0][field]===null) return null;
      }
      coverage.push({...entry,contributorReceiptSha256:contributor.receiptSha256,contributorRemoteProductId:remoteProductId});
    } else if(entry.kind==="accepted_plan_part") {
      if(!supersedes || ![4,5].includes(Object.keys(entry).length) || !Number.isInteger(entry.contributorPartIndex) || typeof entry.contributorClientItemId!=="string" ||
        entry.contributorPlanId!==undefined && !isUuid(entry.contributorPlanId)) return null;
      const contributorPlanId=typeof entry.contributorPlanId==="string"?entry.contributorPlanId:supersedes.planId;
      const proof=predecessorParts.get(`${contributorPlanId}:${entry.contributorPartIndex}`);const product=proof?.productByClientId.get(entry.contributorClientItemId);
      if(!proof || !product || product.originalClientItemId!==entry.clientItemId) return null;
      // A skipped row is membership in this exact immutable ancestor child,
      // never evidence that any economic intent was applied.
      if(product.remoteProductId!==null) {contributorBarcodes.push(product.barcode);contributorProducts.push(product.remoteProductId);}
      coverage.push({...entry,contributorPlanId,contributorReceiptSha256:proof.receiptSha256,contributorCanonicalPayloadHash:proof.canonicalPayloadHash,contributorItemStatus:product.itemStatus,contributorRemoteProductId:product.remoteProductId});
    } else if (entry.kind==="original_accepted" && value.mode==="correction" && Object.keys(entry).length===2) coverage.push({...entry});
    else return null;
  }
  if (coverage.length!==originalIds.size || new Set(coverage.map(entry=>entry.clientItemId)).size!==originalIds.size || coveredChildren.size!==items.length) return null;
  if (value.mode==="replacement") {
    if (new Set(items.filter(item=>item.changeKind==="new"||item.changeKind==="updated").map(item=>item.barcode)).size!==items.filter(item=>item.changeKind==="new"||item.changeKind==="updated").length) return null;
    const barcodes=[...items.filter(item=>item.changeKind==="new"||item.changeKind==="updated").map(item=>String(item.barcode)),...contributorBarcodes];
    if (new Set(barcodes).size!==barcodes.length || new Set(contributorProducts).size!==contributorProducts.length) return null;
  } else {
    const products=[...items.map(item=>String(item.remoteProductId)),...contributorProducts];
    if (new Set(products).size!==products.length) return null;
  }
  const canonical={schemaVersion:PLAN_SCHEMA,planId:value.planId,verifiedOriginalId,mode:value.mode,...(supersedes?{supersedes}:{}),parts:children,coverage};
  return {...canonical,planCanonicalHash:sha256(JSON.stringify(canonical)),itemCount:items.length};
}
