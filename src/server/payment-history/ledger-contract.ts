import {createHash} from "node:crypto";
import type {GetnetMerchant,GetnetTransaction} from "./getnet-contract";
import {commercialDateTimeTicks} from "./time-rules";
import {normalizeHeader,parseClp} from "./value-rules";

export const LEDGER_SCHEMA_VERSION="payment-history-ledger-v1";
export type HistoryCapability="read"|"import"|"cancel"|"export"|"migrate";
export type EvidenceLevel="unverified"|"operator_attested"|"provider_verified";
export type WriterAuthority="local"|"frozen"|"web";
export type HistoryActor={kind:"personal_account"|"pos_staff_manager";id:string;sessionId:string;credentialVersion:number|null};
export type LedgerRuntime={shopId:string;datasetId:string;revision:string;writerEpoch:string;writerAuthority:WriterAuthority;inventoryVerified:boolean};
export type EconomicValue={businessTicks:string;grossClp:string;commissionClp:string|null;commissionVatClp:string|null;netClp:string|null;movementKind:"Sale"|"Cancellation";transactionState:string};
export type LedgerMovement=EconomicValue&{versionId:string;identityKey:string;ownerBatchId:string;active:boolean;economicDigest:string};
export type MerchantBinding={aliasKey:string;aliasId:string;merchantId:string;evidenceId:string;evidenceLevel:EvidenceLevel;verified:boolean};
export type ReviewedPolicy={id:string;kind:"merchant_mapping"|"legacy_currency"|"modern_time"|"native_start"|"economic_correction";version:string;status:"draft"|"verified"|"revoked";level:EvidenceLevel;documentSha256:string|null;merchantId:string|null;fileSha256:string[];fromTicks:string;toTicks:string;interpretation?:"IsoUtc"|"ExportedLocal"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest=/^[0-9a-f]{64}$/;
export function demandUuid(value:string) {if(!uuid.test(value))throw Error("history_invalid_identity");return value;}
export function demandDigest(value:string) {if(!digest.test(value))throw Error("history_invalid_digest");return value;}
// Exact Windows protocol: UTF-16 code-unit length, colon, UTF-8 field bytes.
export function windowsFieldHash(fields:readonly (string|null)[]) {
    const hash=createHash("sha256");
    for(const field of fields){const value=field??"";hash.update(String(value.length)+":"+value,"utf8");}
    return hash.digest("hex");
}
export function merchantAliasKey(merchant:GetnetMerchant) {
    if(![merchant.local,merchant.seller,merchant.sellerId,merchant.localNumber,merchant.rut].some(Boolean))throw Error("history_merchant_missing");
    return windowsFieldHash(["getnet-merchant-alias-v1",merchant.local,merchant.seller,merchant.sellerId,merchant.localNumber,merchant.rut]);
}
export function globalMovementIdentity(shopId:string,merchantId:string,namespace:string,id:string) {
    demandUuid(shopId);demandUuid(merchantId);
    if(!["getnet.legacy.transaction","getnet.financial.movement"].includes(namespace)||!id||id.length>256||/\p{Cc}/u.test(id))throw Error("history_invalid_external_identity");
    return createHash("sha256").update([shopId,"getnet",merchantId,namespace,id].join("\u001f"),"utf8").digest("hex");
}
export function economics(row:GetnetTransaction):EconomicValue {
    if(!row.timestamp.businessDateTime)throw Error("history_time_unresolved");
    for(const value of [row.grossClp,row.commissionClp,row.commissionVatClp,row.netClp])if(value!==null&&parseClp(value).toString()!==value)throw Error("history_amount_not_canonical");
    return {businessTicks:commercialDateTimeTicks(row.timestamp.businessDateTime),grossClp:row.grossClp,commissionClp:row.commissionClp,commissionVatClp:row.commissionVatClp,netClp:row.netClp,movementKind:row.movementKind,transactionState:normalizeHeader(row.transactionStatus)};
}
export function economicDigest(value:EconomicValue) {
    return windowsFieldHash(["historical-economics-v1",value.businessTicks,value.grossClp,value.commissionClp??"null",value.commissionVatClp??"null",value.netClp??"null",value.movementKind,normalizeHeader(value.transactionState)]);
}
export function economicsConflict(a:EconomicValue,b:EconomicValue) {
    return a.businessTicks!==b.businessTicks||a.grossClp!==b.grossClp||a.movementKind!==b.movementKind||normalizeHeader(a.transactionState)!==normalizeHeader(b.transactionState)||
        (["commissionClp","commissionVatClp","netClp"] as const).some(key=>a[key]!==null&&b[key]!==null&&a[key]!==b[key]);
}
type CanonicalValue=null|boolean|string|number|readonly CanonicalValue[]|{[key:string]:CanonicalValue};
export function canonicalHistoryJson(value:CanonicalValue):string {
    if(value===null||typeof value==="boolean"||typeof value==="string")return JSON.stringify(value);
    if(typeof value==="number"){if(!Number.isSafeInteger(value))throw Error("history_noncanonical_number");return String(value);}
    if(Array.isArray(value))return "["+value.map(item=>canonicalHistoryJson(item)).join(",")+"]";
    if(typeof value!=="object")throw Error("history_noncanonical_value");
    return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonicalHistoryJson((value as {[key:string]:CanonicalValue})[key])).join(",")+"}";
}
export function historyRequestDigest(value:CanonicalValue) {return createHash("sha256").update(LEDGER_SCHEMA_VERSION+"\n"+canonicalHistoryJson(value)).digest("hex");}
export function verifiedPolicyCovers(policy:ReviewedPolicy|undefined,row:GetnetTransaction,merchantId:string,kind:ReviewedPolicy["kind"]) {
    if(!policy||policy.kind!==kind||policy.status!=="verified"||policy.level==="unverified"||policy.merchantId!==null&&policy.merchantId!==merchantId||policy.fileSha256.length>0&&!policy.fileSha256.includes(row.source.fileSha256))return false;
    if(kind==="modern_time"&&(policy.level!=="provider_verified"||!policy.documentSha256||policy.interpretation!==row.timestamp.interpretation||policy.version!==row.timestamp.policyVersion))return false;
    const ticks=kind==="modern_time"?commercialDateTimeTicks(row.timestamp.rawTimestamp):economics(row).businessTicks;
    return BigInt(ticks)>=BigInt(policy.fromTicks)&&BigInt(ticks)<BigInt(policy.toTicks);
}
