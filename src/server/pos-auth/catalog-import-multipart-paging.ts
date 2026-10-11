import "server-only";
import { validateCatalogIdentityText } from "@/lib/catalog-text-policy";
import { businessOriginal, isHash, isUuid, parseLargeOriginal, record, sha256, hydrateOriginal, parseRecoveryPlan, type NormalizedChild, type Contributor, type PredecessorPart, type RecoveryTrust, type UploadManifest } from "./catalog-import-multipart-contract";
import { parseCatalogImportInput } from "./catalog-import-sync";
import { hasUnsupportedOriginalPrecision, parsePosCatalogImportCorrection } from "./catalog-import-recovery-contract";

// Raw upload, economic children and immutable ancestry are independent bounds.
export const MAX_PAGED_TOTAL_BYTES = 512 * 1024 * 1024;
export const MAX_UPLOAD_CHUNKS = 2048;
export const MAX_PLAN_CHILDREN = 1024;
export const MAX_ANCESTRY = 128;
export const MAX_DESCRIPTOR_PAGE = 256;
export const MAX_PAGE_ITEMS = 1000;
export const MAX_PAGE_JSON_BYTES = 256 * 1024;
export const MAX_COMPATIBILITY_BYTES = 4 * 1024 * 1024;
export const MAX_PRIVATE_FRAME_BYTES=2*1024*1024;
export const MAX_HEADER_BYTES=16*1024;
type Descriptor = UploadManifest["parts"][number];
type Header = Omit<UploadManifest, "parts"> & {verifiedOriginalId?:string};
const SENSITIVE = /mcpos_|token|secret|password|credential|bearer|eyJ/i;
const LEGACY_ID_SENSITIVE = /(mcpos_(?:device|session)_|bearer\s+|token|secret|password|credential|pin|access[_-]?token|refresh[_-]?token|eyJ|SUPABASE_SERVICE_ROLE_KEY)/i;

export function parseManifestRegistration(input:Record<string,unknown>) {
  if (!isUuid(input.uploadId) || !["original","plan"].includes(String(input.mode)) || !isHash(input.rawSha256) || !isHash(input.manifestSha256) ||
    !Number.isInteger(input.totalByteLength) || Number(input.totalByteLength)<1 || Number(input.totalByteLength)>MAX_PAGED_TOTAL_BYTES ||
    !Number.isInteger(input.partCount) || Number(input.partCount)<1 || Number(input.partCount)>MAX_UPLOAD_CHUNKS ||
    !Number.isInteger(input.offset) || Number(input.offset)<0 || !Array.isArray(input.parts) || !input.parts.length || input.parts.length>MAX_DESCRIPTOR_PAGE ||
    Number(input.offset)+input.parts.length>Number(input.partCount)) return null;
  if (input.mode==="original" && (!["ordinary","correction"].includes(String(input.originalKind)) || typeof input.declaredPayloadHash!=="string" ||
    !/^[A-Za-z0-9:_-]{16,128}$/.test(input.declaredPayloadHash) || SENSITIVE.test(input.declaredPayloadHash))) return null;
  if (input.mode==="plan" && (input.originalKind!==undefined || input.declaredPayloadHash!==undefined || !isUuid(input.verifiedOriginalId)) ||
    input.mode==="original" && input.verifiedOriginalId!==undefined) return null;
  const parts:Descriptor[]=[];
  for (let at=0;at<input.parts.length;at++) {
    const part=input.parts[at];
    if (!record(part) || Object.keys(part).length!==3 || part.index!==Number(input.offset)+at || !Number.isInteger(part.byteLength) ||
      Number(part.byteLength)<1 || Number(part.byteLength)>262144 || !isHash(part.sha256)) return null;
    parts.push({index:Number(part.index),byteLength:Number(part.byteLength),sha256:part.sha256});
  }
  const header:Header={mode:input.mode as Header["mode"],...(input.mode==="original"?{originalKind:input.originalKind as "ordinary"|"correction",declaredPayloadHash:input.declaredPayloadHash as string}:{verifiedOriginalId:input.verifiedOriginalId as string}),totalByteLength:Number(input.totalByteLength),rawSha256:input.rawSha256};
  // Exact strings are generated only by the server. PostgreSQL concatenates
  // them after validating every page, preserving existing JSON.stringify order.
  const headerJson=JSON.stringify(header);
  return {uploadId:input.uploadId,manifestSha256:input.manifestSha256,header,partCount:Number(input.partCount),offset:Number(input.offset),parts,
    canonicalPrefix:headerJson.slice(0,-1)+',"parts":[',canonicalPartsJson:JSON.stringify(parts)};
}

export function parsePagedBytes(input:Record<string,unknown>) {
  if (!isUuid(input.uploadId) || !isHash(input.manifestSha256) || !Number.isInteger(input.partIndex) || Number(input.partIndex)<0 || Number(input.partIndex)>=MAX_UPLOAD_CHUNKS ||
    !isHash(input.sha256) || typeof input.contentBase64!=="string" || input.contentBase64.length>Math.ceil(262144/3)*4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64)) return null;
  const bytes=Buffer.from(input.contentBase64,"base64");
  if (!bytes.length || bytes.length>262144 || bytes.toString("base64")!==input.contentBase64 || sha256(bytes)!==input.sha256) return null;
  return {uploadId:input.uploadId,manifestSha256:input.manifestSha256,partIndex:Number(input.partIndex),sha256:input.sha256,contentBase64:input.contentBase64};
}

function stringField(value:Record<string,unknown>,...keys:string[]) {
  for(const key of keys) if(typeof value[key]==="string") return value[key] as string;
  return "";
}
function optionalText(value:string,max:number) {
  const normalized=value.replace(/[\u0000-\u001F\u007F]/g," ").trim().replace(/\s+/g," ").slice(0,max);
  return normalized.length?normalized:null;
}
function hasExplicitSafeId(item:Record<string,unknown>) {
  const checked=validateCatalogIdentityText(stringField(item,"clientItemId","client_item_id"),{maxLength:200,required:false});
  return checked.status!=="rejected" && /^[A-Za-z0-9][A-Za-z0-9_.:@-]*$/.test(checked.value) && !LEGACY_ID_SENSITIVE.test(checked.value);
}
function hasExplicitInteger(item:Record<string,unknown>,...keys:string[]) {
  for(const key of keys) {
    const value=item[key];
    if(typeof value==="number" && Number.isFinite(value)) return Number.isInteger(value);
    if(typeof value==="string" && /^-?\d+(?:[.,]\d+)?$/.test(value.trim())) {
      const number=Number(value.trim().replace(",","."));if(Number.isFinite(number)) return Number.isInteger(number);
    }
  }
  return false;
}

export function normalizeOriginalPage(packet:unknown,trust:RecoveryTrust,strictApply=false) {
  if(!boundedFrame(packet) || !record(packet) || !record(packet.header) || Buffer.byteLength(JSON.stringify(packet.header),"utf8")>MAX_HEADER_BYTES || !Array.isArray(packet.items) || !packet.items.length || packet.items.length>MAX_PAGE_ITEMS ||
    !packet.items.every(record) || !Number.isInteger(packet.offset) || Number(packet.offset)<0 || typeof packet.declaredPayloadHash!=="string" ||
    Buffer.byteLength(JSON.stringify(packet.items),"utf8")>MAX_PAGE_JSON_BYTES || hasUnsupportedOriginalPrecision(packet.header) || hasUnsupportedOriginalPrecision(packet.items)) return null;
  const offset=Number(packet.offset);
  const adjusted=packet.items.map((item,at)=>({...item,
    ...(!hasExplicitSafeId(item)?{clientItemId:`row-${offset+at+1}`}:{ }),
    ...(!hasExplicitInteger(item,"rowNumber","row_number")?{rowNumber:offset+at+1}:{ })}));
  const saved={...packet.header,items:adjusted};
  const parsed=strictApply?parseCatalogImportInput({...saved,...trust}):parseLargeOriginal(saved,trust,packet.declaredPayloadHash);
  if(!parsed) return null;
  const batch=record(packet.header.batch)?packet.header.batch:{};
  const canonical={appVersion:parsed.appVersion,batch:{clientImportId:parsed.clientImportId,createdAt:parsed.batchCreatedAt,idempotencyKey:parsed.idempotencyKey,
    previewFingerprint:optionalText(stringField(batch,"previewFingerprint","preview_fingerprint"),128),sourceFileName:parsed.sourceFileName},
    items:[],schemaVersion:parsed.schemaVersion,source:parsed.source,summary:parsed.summary};
  const canonicalJson=JSON.stringify(canonical);const marker=',"items":[]';const at=canonicalJson.indexOf(marker);
  if(at<0) return null;
  const business=businessOriginal(parsed);const {items:_items,payloadHash:_hash,...normalizedHeader}=business;void _items;void _hash;
  return {offset,itemCount:parsed.items.length,normalizedHeader,items:parsed.items,rawItems:packet.items,
    canonicalPrefix:canonicalJson.slice(0,at)+',"items":[',canonicalSuffix:"]"+canonicalJson.slice(at+marker.length),canonicalItemsJson:JSON.stringify(parsed.items)};
}

export function boundedFrame(packet:unknown):boolean {
  try {return Buffer.byteLength(JSON.stringify(packet),"utf8")<=MAX_PRIVATE_FRAME_BYTES;} catch {return false;}
}
// Produce a server-only serialization template. Literal metadata cannot be
// mistaken for a slot: choose tokens absent from its complete serialized value.
export function canonicalTemplate(value:unknown,itemArrays:unknown[],hash:string):Array<string|{slot:"items"|"hash"}> {
  const serialized=JSON.stringify(value);let token="POS_INTERNAL_ITEMS_SLOT";
  while(serialized.includes(token))token+="X";
  let hashToken=token+"HASH";while(serialized.includes(hashToken))hashToken+="X";
  const arrays=itemArrays.filter(Array.isArray);
  const holders=[value,record(value)?value.normalized:null];
  const marked=JSON.stringify(value,function(key,current){return arrays.includes(current)?token:key==="payloadHash" && current===hash && holders.includes(this)?hashToken:current;});
  const pattern=new RegExp(`(${JSON.stringify(token)}|${JSON.stringify(hashToken)})`,"g");
  return marked.split(pattern).filter(Boolean).map(part=>part===JSON.stringify(token)?{slot:"items"}:part===JSON.stringify(hashToken)?{slot:"hash"}:part);
}

export function normalizeChildPage(packet:unknown,trust:RecoveryTrust) {
  if(!boundedFrame(packet) || !record(packet) || !record(packet.header) || !record(packet.root) || !isUuid(packet.verifiedOriginalId) ||
    !Number.isInteger(packet.partIndex) || Number(packet.partIndex)<0 || Number(packet.partIndex)>=MAX_PLAN_CHILDREN ||
    !Number.isInteger(packet.offset) || Number(packet.offset)<0 || !Array.isArray(packet.items) || !packet.items.length || packet.items.length>1000 ||
    Buffer.byteLength(JSON.stringify(packet.header),"utf8")>MAX_HEADER_BYTES || Buffer.byteLength(JSON.stringify(packet.items),"utf8")>MAX_PAGE_JSON_BYTES ||
    Buffer.byteLength(JSON.stringify(packet.root),"utf8")>MAX_PAGE_JSON_BYTES) return null;
  const original=hydrateOriginal(packet.root,trust);if(!original) return null;
  let child:NormalizedChild;let canonicalPrefix:string;let canonicalSuffix:string;let canonicalItemsJson:string;
  if(packet.mode==="replacement") {
    const batch=record(packet.header.batch)?packet.header.batch:{};
    if(typeof packet.header.payloadHash!=="string")return null;
    const page=normalizeOriginalPage({header:packet.header,items:packet.items,offset:packet.offset,declaredPayloadHash:packet.header.payloadHash},trust,true);
    if(!page)return null;
    const parsed=parseCatalogImportInput({...packet.header,items:page.items,...trust});if(!parsed || !parsed.declaredPayloadHash ||
      parsed.clientImportId===original.clientImportId || parsed.idempotencyKey===original.idempotencyKey || !batch) return null;
    child={index:Number(packet.partIndex),kind:"ordinary",clientImportId:parsed.clientImportId,idempotencyKey:parsed.idempotencyKey,payloadHash:parsed.payloadHash,
      declaredPayloadHash:parsed.declaredPayloadHash,createdAt:parsed.batchCreatedAt,items:page.items,summary:parsed.summary,normalized:businessOriginal({...parsed,items:page.items})};
    canonicalPrefix=page.canonicalPrefix;canonicalSuffix=page.canonicalSuffix;canonicalItemsJson=page.canonicalItemsJson;
  } else if(packet.mode==="correction") {
    if(!record(packet.header.recoveryOf) || !record(packet.header.correction) || packet.forensic!==true && (Object.keys(packet.header.recoveryOf).length!==1 || packet.header.recoveryOf.verifiedOriginalId!==packet.verifiedOriginalId)) return null;
    if(packet.forensic===true && (packet.header.shopDeviceId!==undefined && packet.header.shopDeviceId!==trust.shopDeviceId || packet.header.shopCode!==undefined && packet.header.shopCode!==trust.shopCode || typeof packet.declaredPayloadHash!=="string" || packet.header.correction.payloadHash!==undefined && packet.header.correction.payloadHash!==packet.declaredPayloadHash))return null;
    const parsed=parsePosCatalogImportCorrection({...packet.header,correction:{...packet.header.correction,...(packet.forensic===true?{payloadHash:packet.declaredPayloadHash}:{}),items:packet.items},...trust},original);
    if(!parsed)return null;
    const canonical={schemaVersion:"pos-catalog-import-correction-v1",recoveryOf:{clientImportId:original.clientImportId,idempotencyKey:original.idempotencyKey,canonicalPayloadHash:original.payloadHash},
      correction:{clientImportId:parsed.clientImportId,idempotencyKey:parsed.idempotencyKey,createdAt:parsed.createdAt,items:[]}};
    const json=JSON.stringify(canonical);const marker='"items":[]';const at=json.indexOf(marker);
    canonicalPrefix=json.slice(0,at)+'"items":[';canonicalSuffix="]"+json.slice(at+marker.length);canonicalItemsJson=JSON.stringify(parsed.items);
    child={index:Number(packet.partIndex),kind:"correction",clientImportId:parsed.clientImportId,idempotencyKey:parsed.idempotencyKey,payloadHash:parsed.canonicalPayloadHash,
      declaredPayloadHash:parsed.payloadHash,createdAt:parsed.createdAt,items:parsed.items,summary:null,normalized:{verifiedOriginalId:packet.verifiedOriginalId,originalCanonicalPayloadHash:original.payloadHash}};
  } else return null;
  const transportHeader=packet.mode==="replacement"?{...packet.header,...trust,items:[]}:{...packet.header,...trust,correction:{...(packet.header.correction as object),items:[]}};
  const fullHttpHeaderBytes=Buffer.byteLength(JSON.stringify(transportHeader),"utf8");
  const rawRowByteLengths=packet.items.map(item=>Buffer.byteLength(JSON.stringify(item),"utf8"));
  const planTemplate=canonicalTemplate(child,[child.items,record(child.normalized)?child.normalized.items:undefined],child.payloadHash);
  return {partIndex:child.index,offset:Number(packet.offset),itemCount:child.items.length,childHeader:{...child,items:[],...(child.kind==="ordinary"?{normalized:{...(child.normalized as object),items:[]}}:{})},
    items:child.items,canonicalPrefix,canonicalSuffix,canonicalItemsJson,planTemplate,rawRowByteLengths,fullHttpHeaderBytes};
}

export function normalizeCoveragePage(packet:unknown,trust:RecoveryTrust,contributors:Map<string,Contributor>,predecessorParts:Map<string,PredecessorPart>) {
  if(!boundedFrame(packet) || !record(packet) || !record(packet.header) || !record(packet.root) || !isUuid(packet.header.verifiedOriginalId) ||
    !Array.isArray(packet.items) || !packet.items.length || packet.items.length>1000 || !Array.isArray(packet.children) || packet.children.length>1000 ||
    Buffer.byteLength(JSON.stringify(packet.items),"utf8")>MAX_PAGE_JSON_BYTES || Buffer.byteLength(JSON.stringify(packet.root),"utf8")>MAX_PAGE_JSON_BYTES ||
    Buffer.byteLength(JSON.stringify(packet.header),"utf8")>MAX_HEADER_BYTES) return null;
  const original=hydrateOriginal(packet.root,trust);if(!original)return null;
  const children=packet.children as NormalizedChild[];
  if(children.some(child=>!record(child) || !Array.isArray(child.items) || child.items.length>1000))return null;
  const plan=parseRecoveryPlan({...packet.header,parts:[],coverage:packet.items},original,packet.header.verifiedOriginalId,trust,contributors,predecessorParts,children);
  return plan?{items:plan.coverage,canonicalItemsJson:JSON.stringify(plan.coverage)}:null;
}
