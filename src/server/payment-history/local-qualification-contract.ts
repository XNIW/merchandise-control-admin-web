import {demandDigest,demandUuid} from "./ledger-contract";
import {closedHistoryObject as closed} from "./replica-contract";
export const LOCAL_QUALIFICATION_HEADER_FIELDS=["qualification_config_digest","qualification_resolver_fingerprint","qualification_evidence_ids"] as const;
export function validateLocalQualification(value:unknown){
 const q=closed(value,["config_digest","resolver_fingerprint","evidence_ids"]);
 if(typeof q.config_digest!=="string"||typeof q.resolver_fingerprint!=="string")throw Error("history_qualification_invalid");demandDigest(q.config_digest);demandDigest(q.resolver_fingerprint);
 if(!Array.isArray(q.evidence_ids)||q.evidence_ids.length<1||q.evidence_ids.length>200||new Set(q.evidence_ids).size!==q.evidence_ids.length||q.evidence_ids.some(id=>typeof id!=="string"||demandUuid(id)!==id||id==="00000000-0000-0000-0000-000000000000")||JSON.stringify(q.evidence_ids)!==JSON.stringify([...q.evidence_ids].sort()))throw Error("history_qualification_invalid");
 return q;
}
export function validateLocalQualificationHeader(fields:Record<string,unknown>){
 if(!LOCAL_QUALIFICATION_HEADER_FIELDS.some(k=>Object.hasOwn(fields,k)))return null;
 if(fields.operation_kind!=="Apply"||LOCAL_QUALIFICATION_HEADER_FIELDS.some(k=>typeof fields[k]!=="string")||String(fields.qualification_evidence_ids).length>8192)throw Error("history_qualification_invalid");
 const ids:unknown=JSON.parse(String(fields.qualification_evidence_ids)),q=validateLocalQualification({config_digest:fields.qualification_config_digest,resolver_fingerprint:fields.qualification_resolver_fingerprint,evidence_ids:ids});
 if(JSON.stringify(q.evidence_ids)!==fields.qualification_evidence_ids)throw Error("history_qualification_invalid");return q;
}
