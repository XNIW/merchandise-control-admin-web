import {createHash} from "node:crypto";

export const closedClientCode=value=>typeof value==="string"&&value.length<=102&&!/[\r\n]/.test(value)&&/^(?:(?:history|historical|auth)_[a-z0-9_]{1,90}|http_(?:[0-9]{3}|5xx)|success|invalid_response|io_error|network_error|dns|tls|timeout|cancelled|response_too_large|rate_limited|db_failure)$/.test(value);
const record=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const phase=value=>typeof value==="string"&&/^[a-z_]{1,40}$/.test(value)&&!/[\r\n]/.test(value)?value:null;

export function projectClientFailure(state){
 const r=state.requestFailure,d=state.localDiagnostics;
 return {phase:phase(state.phase)??"unknown",exception:typeof state.exception==="string"&&/^[A-Za-z]{1,80}Exception$/.test(state.exception)&&!/[\r\n]/.test(state.exception)?state.exception:"Exception",
  codes:[state.code,state.lastCode].filter(closedClientCode),
  ...(record(r)?{requestFailure:{phase:phase(r.phase),actor:["A","B","other_test_actor"].includes(r.actor)?r.actor:null,operation:phase(r.operation),code:closedClientCode(r.code)?r.code:null,httpStatus:Number.isInteger(r.httpStatus)&&r.httpStatus>=100&&r.httpStatus<=599?r.httpStatus:null,transportDenied:r.transportDenied===true,retryable:r.retryable===true}}:{}),
  ...(record(d)?{localDiagnostics:{actor:["A","B"].includes(d.actor)?d.actor:null,baselineState:phase(d.baselineState),baselineReason:typeof d.baselineReason==="string"&&/^(history|baseline)_[a-z_]{1,90}$/.test(d.baselineReason)&&!/[\r\n]/.test(d.baselineReason)?d.baselineReason:null,baselineUploadPresent:d.baselineUploadPresent===true,baselineRunPresent:d.baselineRunPresent===true,baselineReviewPresent:d.baselineReviewPresent===true}}:{})};
}

export function logClosedReport(receipt,logger=console){
 const bytes=JSON.stringify(receipt);
 if(Buffer.byteLength(bytes,"utf8")>65536){logger.error("authenticated_history_closed_report_capacity");return false;}
 logger.log("ASUS019_CLOSED_REPORT:"+bytes);
 logger.log("ASUS019_CLOSED_REPORT_SHA256:"+createHash("sha256").update(bytes).digest("hex"));
 return true;
}
