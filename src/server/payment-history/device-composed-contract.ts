import {demandDigest,demandUuid} from "./ledger-contract";
import {DEVICE_HISTORY_OPERATIONS,validateDeviceHistoryRequest,validateDeviceHistoryResult,type DeviceHistoryOperation} from "./replica-contract";
import {LOCAL_COMMIT_OPERATIONS,validateLocalCommitRequest,validateLocalCommitResult,type LocalCommitOperation} from "./local-commit-contract";
import {LOCAL_OUTCOME_OPERATIONS,validateLocalOutcomeDelivery,validateLocalOutcomeAbort,validateLocalOutcomeAbortResult} from "./local-outcome-delivery-contract";
import {BASELINE_OPERATIONS,validateBaselineRequest,projectBaselineSqlResult,type BaselineOperation} from "./local-baseline-contract";

export type DeviceHistoryScope={shopId:string;deviceId:string;staffId:string;sessionId:string;credentialVersion:number};
const commits=LOCAL_COMMIT_OPERATIONS.filter(op=>op!=="local_deliver");
export const COMPOSED_DEVICE_OPERATIONS=[...DEVICE_HISTORY_OPERATIONS,...commits,...LOCAL_OUTCOME_OPERATIONS,...BASELINE_OPERATIONS] as readonly string[];
export const isComposedHistoryV2=(op:string)=>!DEVICE_HISTORY_OPERATIONS.includes(op as DeviceHistoryOperation)&&COMPOSED_DEVICE_OPERATIONS.includes(op);
function localScope(p:Record<string,unknown>,scope:DeviceHistoryScope){
 if(typeof p.operation_id!=="string"||typeof p.content_digest!=="string")throw Error("history_input_invalid");
 demandUuid(p.operation_id);demandDigest(p.content_digest);
 return {...scope,operationId:p.operation_id,contentDigest:p.content_digest};
}
export function validateComposedDeviceRequest(op:string,value:unknown,scope:DeviceHistoryScope):Record<string,unknown>{
 if(BASELINE_OPERATIONS.includes(op as BaselineOperation))return validateBaselineRequest(op as BaselineOperation,value);
 if(LOCAL_OUTCOME_OPERATIONS.includes(op as "local_abort"|"local_reconcile")){
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("history_input_invalid");
  const p=value as Record<string,unknown>,bound=localScope(p,scope);
  return op==="local_abort"?validateLocalOutcomeAbort(p,bound):validateLocalOutcomeDelivery(p,bound);
 }
 if(commits.includes(op as typeof commits[number]))return validateLocalCommitRequest(op as LocalCommitOperation,value);
 if(DEVICE_HISTORY_OPERATIONS.includes(op as DeviceHistoryOperation))return validateDeviceHistoryRequest(op as DeviceHistoryOperation,value);
 throw Error("history_input_invalid");
}
export function projectComposedDeviceResult(op:string,value:unknown,payload:Record<string,unknown>,scope:DeviceHistoryScope){
 if(BASELINE_OPERATIONS.includes(op as BaselineOperation))return projectBaselineSqlResult(op as BaselineOperation,value,{...scope,
  runId:typeof payload.run_id==="string"?payload.run_id:undefined,recoveryRequestKey:payload.recovery_request_key as string|undefined,
  applyRequestKey:payload.apply_request_key as string|undefined,previousReviewDigest:payload.previous_review_digest as string|undefined});
 if(op==="local_abort")return validateLocalOutcomeAbortResult(value,localScope(payload,scope),payload.witness_json as string);
 if(op==="local_reconcile")return validateLocalCommitResult("local_deliver",value,localScope(payload,scope));
 if(commits.includes(op as typeof commits[number]))return validateLocalCommitResult(op as LocalCommitOperation,value,localScope(payload,scope));
 if(DEVICE_HISTORY_OPERATIONS.includes(op as DeviceHistoryOperation))return validateDeviceHistoryResult(op as DeviceHistoryOperation,value,scope.shopId);
 throw Error("history_response_invalid");
}
