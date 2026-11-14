import {closedHistoryObject as closed,historyObject} from "./replica-contract";
import {demandDigest,demandUuid} from "./ledger-contract";

export const QUALIFIED_CONFIG_VERSION="getnet-qualified-input-v1";
export const QUALIFICATION_DEVICE_OPERATIONS=["qualified_config"] as const;
const zero="00000000-0000-0000-0000-000000000000";
const maxTicks=BigInt("3155378975999999999");
const invalid=():never=>{throw Error("history_qualification_invalid");};
function id(value:unknown){if(typeof value!=="string"||value===zero)return invalid();return demandUuid(value);}
function hash(value:unknown){if(typeof value!=="string")return invalid();return demandDigest(value);}
function text(value:unknown,max:number,empty=false){if(typeof value!=="string"||value.length>max||!empty&&!value.trim()||/\p{Cc}/u.test(value))return invalid();return value;}
function ticks(value:unknown,exclusive=false){if(typeof value!=="string"||!/^(0|[1-9][0-9]{0,18})$/.test(value)||BigInt(value)>maxTicks+(exclusive?BigInt("1"):BigInt("0")))return invalid();return BigInt(value);}
function oneOf(value:unknown,values:readonly string[]){if(typeof value!=="string"||!values.includes(value))return invalid();return value;}
export function validateQualifiedConfigRequest(value:unknown){return closed(value,[]);}
export function validateQualificationRequest(operation:string,value:unknown){
 if(operation==="read")return validateQualifiedConfigRequest(value);
 if(operation==="revoke"){const p=closed(value,["evidence_id"]);id(p.evidence_id);return p;}
 if(operation!=="qualify")return invalid();
 const p=closed(value,["request_key","kind","level","version","reference","document_upload_id","document_sha256","scope","mapping"]);
 id(p.request_key);id(p.document_upload_id);hash(p.document_sha256);text(p.version,160);text(p.reference,2048);
 oneOf(p.kind,["merchant_mapping","legacy_currency","modern_time","native_start"]);oneOf(p.level,["operator_attested","provider_verified"]);
 const s=closed(p.scope,["merchant_id","alias_key","profile","parser_version","file_sha256","from_ticks","to_ticks","interpretation","native_start_ticks"]);
 id(s.merchant_id);text(s.alias_key,64,true);if(s.alias_key!==""||p.kind==="merchant_mapping")hash(s.alias_key);
 oneOf(s.profile,["GetnetLegacy","GetnetModern"]);oneOf(s.parser_version,["getnet-ooxml-v1","getnet-ooxml-web-v1"]);
 if(!Array.isArray(s.file_sha256)||s.file_sha256.length<1||s.file_sha256.length>10||new Set(s.file_sha256).size!==s.file_sha256.length)return invalid();s.file_sha256.forEach(hash);
 if(ticks(s.from_ticks)>=ticks(s.to_ticks,true))return invalid();oneOf(s.interpretation,["Unresolved","IsoUtc","ExportedLocal"]);
 if(p.kind==="modern_time"&&(p.level!=="provider_verified"||s.profile!=="GetnetModern"||s.interpretation==="Unresolved"))return invalid();
 if(p.kind!=="modern_time"&&s.interpretation!=="Unresolved"||p.kind==="legacy_currency"&&s.profile!=="GetnetLegacy")return invalid();
 if(p.kind==="native_start"){if(ticks(s.native_start_ticks)<=BigInt("0"))return invalid();}else if(s.native_start_ticks!==null)return invalid();
 if(p.kind==="merchant_mapping"){
  const m=closed(p.mapping,["label","source_identity"]);text(m.label,256);
  const source=closed(m.source_identity,["local","seller","sellerId","localNumber","rut","hasEvidence"]);
  for(const k of ["local","seller","sellerId","localNumber","rut"])text(source[k],256,true);if(source.hasEvidence!==true)return invalid();
 }else if(p.mapping!==null)return invalid();
 return p;
}

export function validateQualifiedConfigResult(value:unknown,shopId:string){
 const result=closed(value,["schema_version","shop_id","config_digest","runtime","evidence","local_scope_bindings"]);
 if(result.schema_version!==QUALIFIED_CONFIG_VERSION||result.shop_id!==id(shopId))return invalid();hash(result.config_digest);
 if(result.runtime!==null){const runtime=closed(result.runtime,["dataset_id","writer_epoch","writer_authority"]);id(runtime.dataset_id);
  if(typeof runtime.writer_epoch!=="string"||!/^[1-9][0-9]{0,18}$/.test(runtime.writer_epoch)||BigInt(runtime.writer_epoch)>BigInt("9223372036854775807"))return invalid();
  oneOf(runtime.writer_authority,["local","frozen","web"]);
 }
 if(!Array.isArray(result.evidence)||result.evidence.length>200||Buffer.byteLength(JSON.stringify(result))>1048576)return invalid();
 if(!Array.isArray(result.local_scope_bindings)||result.local_scope_bindings.length>200)return invalid();
 const scopes=new Set<string>();
 for(const value of result.local_scope_bindings){const b=closed(value,["local_scope_id","merchant_id","source_run_id","witness_id"]);const local=text(b.local_scope_id,256);if(scopes.has(local))return invalid();scopes.add(local);id(b.merchant_id);id(b.source_run_id);id(b.witness_id);}
 const seen=new Set<string>();
 for(const value of result.evidence){
  const e=closed(value,["id","shop_id","kind","state","issuer","qualification_version","merchant_id","alias_key","profile","parser_version","files",
   "from_ticks","to_ticks","policy_version","reference","interpretation","native_start_ticks","provider_verified","document_sha256","document_upload_id"]);
  const evidenceId=id(e.id);if(seen.has(evidenceId)||e.shop_id!==shopId||e.qualification_version!==QUALIFIED_CONFIG_VERSION)return invalid();seen.add(evidenceId);
  id(e.merchant_id);oneOf(e.kind,["MerchantMapping","LegacyCurrency","ModernTime","NativeStart"]);
  oneOf(e.state,["Draft","Verified","Revoked"]);oneOf(e.issuer,["PlatformMaster","ExplicitShopDelegate"]);oneOf(e.profile,["GetnetLegacy","GetnetModern"]);
  text(e.parser_version,160);text(e.policy_version,160);text(e.reference,2048);text(e.alias_key,64,true);
  if(e.kind==="MerchantMapping")hash(e.alias_key);else if(e.alias_key!=="")hash(e.alias_key);
  if(!Array.isArray(e.files)||e.files.length===0||e.files.length>10||new Set(e.files).size!==e.files.length)return invalid();e.files.forEach(hash);
  if(ticks(e.from_ticks)>=ticks(e.to_ticks,true))return invalid();
  oneOf(e.interpretation,["Unresolved","IsoUtc","ExportedLocal"]);
  if(typeof e.provider_verified!=="boolean")return invalid();hash(e.document_sha256);id(e.document_upload_id);
  if(e.kind==="ModernTime"&&(e.profile!=="GetnetModern"||e.provider_verified!==true||e.interpretation==="Unresolved"))return invalid();
  if(e.kind!=="ModernTime"&&e.interpretation!=="Unresolved"||e.kind==="LegacyCurrency"&&e.profile!=="GetnetLegacy")return invalid();
  if(e.kind==="NativeStart"){if(ticks(e.native_start_ticks)<=BigInt("0"))return invalid();}else if(e.native_start_ticks!==null)return invalid();
 }
 return result;
}

export function validateTechnicalAccess(value:unknown){
 const result=closed(value,["can_manage","issuer"]);if(result.can_manage!==true)return invalid();
 oneOf(result.issuer,["PlatformMaster","ExplicitShopDelegate"]);return result;
}
export function validateQualificationResult(operation:string,value:unknown,shopId:string){
 if(operation==="read")return validateQualifiedConfigResult(value,shopId);
 if(!["qualify","revoke"].includes(operation)||!historyObject(value))return invalid();
 const result=closed(value,["evidence_id","status"]);id(result.evidence_id);oneOf(result.status,["verified","revoked"]);return result;
}
