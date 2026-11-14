import {closedHistoryObject as closed} from "./replica-contract";
import {demandUuid,demandDigest} from "./ledger-contract";
import {validateHistoryResult} from "./wire-contract";
export const DEVICE_WEB_OPERATIONS=["web_upload_create","web_upload_ready","web_upload_status","web_start","web_status","web_configure","web_review","web_commit","web_receipt","web_cancel_job","web_resume_job"] as const;
const fail=():never=>{throw Error("history_input_invalid");};
const id=(v:unknown)=>typeof v==="string"?demandUuid(v):fail();
const text=(v:unknown,max:number,empty=false)=>{if(typeof v!=="string"||v.length>max||!empty&&!v.trim()||/\p{Cc}/u.test(v))fail();};
export function validateDeviceWebRequest(operation:string,value:unknown){
 const op=operation.slice(4);if(!(DEVICE_WEB_OPERATIONS as readonly string[]).includes(operation))return fail();
 let p:Record<string,unknown>;
 if(op==="upload_create"){
  p=closed(value,["file_name","sha256","byte_length"]);text(p.file_name,256);if(!/\.xlsx$/i.test(String(p.file_name)))return fail();
  if(typeof p.sha256!=="string")return fail();demandDigest(p.sha256);
  if(typeof p.byte_length!=="string"||!/^[1-9][0-9]{0,7}$/.test(p.byte_length)||BigInt(p.byte_length)>BigInt(20971520))return fail();
 }else if(op.startsWith("upload_")){p=closed(value,["upload_id"]);id(p.upload_id);}
 else if(op==="start"){
  p=closed(value,["request_key","upload_ids","configuration"]);id(p.request_key);
  if(!Array.isArray(p.upload_ids)||p.upload_ids.length<1||p.upload_ids.length>10||new Set(p.upload_ids).size!==p.upload_ids.length)return fail();p.upload_ids.forEach(id);
  const c=closed(p.configuration,["legacyAmountsAreClp","modernTimeInterpretation","temporalPolicyVersion","temporalEvidenceReference"]);
  if(typeof c.legacyAmountsAreClp!=="boolean"||!["Unresolved","IsoUtc","ExportedLocal"].includes(String(c.modernTimeInterpretation)))return fail();
  text(c.temporalPolicyVersion,160);text(c.temporalEvidenceReference,2048,true);
 }else if(op==="configure"){
  p=closed(value,["job_id","evidence_ids","corrections"]);id(p.job_id);
  if(!Array.isArray(p.evidence_ids)||p.evidence_ids.length>200||new Set(p.evidence_ids).size!==p.evidence_ids.length||!Array.isArray(p.corrections)||p.corrections.length!==0)return fail();p.evidence_ids.forEach(id);
 }else if(op==="commit"){p=closed(value,["job_id","request_key","review_digest"]);id(p.job_id);id(p.request_key);if(typeof p.review_digest!=="string")return fail();demandDigest(p.review_digest);}
 else if(op==="receipt"){p=closed(value,["request_key"]);id(p.request_key);}
 else{p=closed(value,["job_id"]);id(p.job_id);}
 return p;
}
export function projectDeviceWebResult(operation:string,value:unknown,payload:Record<string,unknown>){
 const op=operation.slice(4),result=validateHistoryResult(op,value,payload);
 if(payload.job_id&&result.job_id&&result.job_id!==payload.job_id||payload.upload_id&&result.upload_id!==payload.upload_id)throw Error("history_response_invalid");
 return result;
}
