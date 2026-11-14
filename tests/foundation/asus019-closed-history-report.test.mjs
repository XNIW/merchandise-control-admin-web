import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {closedClientCode,projectClientFailure,logClosedReport} from "../../scripts/testing/asus019-closed-history-report.mjs";

for(const code of ["history_cloud_writer_closed","auth_denied","history_cloud_access_denied","history_cloud_unavailable","history_response_invalid","invalid_response","http_503","http_5xx","history_v2_conflict"]){
 test("preserves closed machine code "+code,()=>{
  const value=projectClientFailure({phase:"conflict_preparation",exception:"HistoricalCloudRequestException",code,lastCode:"success",requestFailure:{phase:"conflict_preparation",actor:"B",operation:"local_review",code,httpStatus:code==="auth_denied"?403:409,transportDenied:code==="auth_denied",retryable:code==="history_cloud_unavailable"}});
  assert.equal(closedClientCode(code),true);assert.equal(value.codes[0],code);assert.equal(value.requestFailure.code,code);
  assert.equal(value.requestFailure.operation,"local_review");assert.equal(value.requestFailure.transportDenied,code==="auth_denied");
  assert.equal(value.requestFailure.retryable,code==="history_cloud_unavailable");assert.notEqual(value.requestFailure.code==="history_cloud_writer_closed",code!=="history_cloud_writer_closed");
 });
}
test("redacts arbitrary values, raw bodies, identifiers and malformed fields",()=>{
 const secret="secret-value-that-must-not-appear";
 const projected=projectClientFailure({phase:secret,exception:secret,code:secret,lastCode:"history_cloud_writer_closed\n",message:secret,body:secret,
  requestFailure:{phase:secret,actor:secret,operation:secret,code:secret,httpStatus:999,transportDenied:secret,retryable:secret,body:secret,token:secret,deviceId:secret},
  localDiagnostics:{actor:secret,baselineState:secret,baselineReason:secret,baselineUploadPresent:secret,baselineRunPresent:secret,baselineReviewPresent:secret}});
 assert.equal(JSON.stringify(projected).includes(secret),false);assert.deepEqual(projected.codes,[]);assert.equal(projected.exception,"Exception");
 assert.equal(projected.requestFailure.httpStatus,null);assert.equal(projected.requestFailure.transportDenied,false);assert.equal(projected.requestFailure.retryable,false);
 for(const code of ["history_cloud_writer_closed\n","history_cloud_writer_closed\r",secret,"https://private.invalid/token",null,[],"history_"+"x".repeat(91)])assert.equal(closedClientCode(code),false);
 assert.equal("requestFailure" in projectClientFailure({requestFailure:[],localDiagnostics:"raw"}),false);
});
test("stdout exports exactly artifact JSON bytes with matching digest",()=>{
 const receipt={status:"FAIL",clientFailure:projectClientFailure({phase:"conflict_preparation",code:"auth_denied"})},artifact=JSON.stringify(receipt),lines=[],errors=[];
 assert.equal(logClosedReport(receipt,{log:value=>lines.push(value),error:value=>errors.push(value)}),true);
 assert.deepEqual(lines,["ASUS019_CLOSED_REPORT:"+artifact,"ASUS019_CLOSED_REPORT_SHA256:"+createHash("sha256").update(artifact).digest("hex")]);assert.deepEqual(errors,[]);assert.equal(receipt.status,"FAIL");
});
test("secondary size cap preserves primary outcome and emits no partial report",()=>{
 const receipt={status:"FAIL",bounded:"é".repeat(33000)},lines=[],errors=[];
 assert.equal(logClosedReport(receipt,{log:value=>lines.push(value),error:value=>errors.push(value)}),false);assert.deepEqual(lines,[]);assert.deepEqual(errors,["authenticated_history_closed_report_capacity"]);assert.equal(receipt.status,"FAIL");
});
