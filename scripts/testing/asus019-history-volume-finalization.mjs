// Called only by the existing owned volume gate; never a standalone runner.
// Responses are validated in memory; evidence contains metadata, not source rows.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const demand=(ok,code)=>{if(!ok)throw Error('history_volume_'+code);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

export function verifyFinalizationSqlBudget(metadata){
 demand(metadata?.authenticator==='8s'&&metadata.authenticated==='8s'&&metadata.serviceRole===null&&metadata.databaseOverrides===0&&metadata.functionOverrides===0,'finalization_sql_budget');
 return {statementTimeoutMs:8000,requestTimeoutMs:15000,metadataVerified:true,basis:'authenticator8s_service_role_inherited_no_database_or_function_override'};
}

// One request, including on 57014/HTTP500. The original upstream status/code is
// retained before throwing; neither an abort nor the outer catch overwrites it.
export async function measuredDeviceRequest({db,scope,operation,payload,steps}){
 const started=performance.now();let reply;
 try{reply=await db.rpc('payment_history_device_http_v2',{...scope,p_operation:operation,p_payload:payload}).abortSignal(AbortSignal.timeout(15000));}
 catch{steps.push({operation,status:'FAIL',elapsedMs:performance.now()-started,httpStatus:null,sqlState:null,kind:'transport_unavailable'});throw Error('history_volume_finalization_transport');}
 const elapsedMs=performance.now()-started,ok=!reply.error&&reply.data?.ok===true&&reply.data.shop_id===scope.p_shop_id&&reply.data.device_id===scope.p_shop_device_id;
 steps.push({operation,status:ok?'PASS':'FAIL',elapsedMs,httpStatus:Number.isInteger(reply.status)?reply.status:null,
  sqlState:typeof reply.error?.code==='string'&&/^[0-9A-Z]{5}$/.test(reply.error.code)?reply.error.code:null,kind:ok?'response':reply.error?'rpc_error':'admission_rejected'});
 demand(ok,'finalization_rpc_failed');demand(elapsedMs<15000,'finalization_request_budget');return reply.data.result;
}

// Exactly one bounded read after the attempt, including RED. A secondary read
// failure never replaces the original phase or upstream SQLSTATE.
export function observeFinalizationCanonical({read,report,originalError}){
 const started=performance.now();
 try{const value=read();
  demand(value&&['review_ready','applied','failed','cancelled'].includes(value.state)&&typeof value.applyKeyPresent==='boolean'&&typeof value.receiptPresent==='boolean'&&typeof value.runtimeRevision==='string'&&/^(0|[1-9][0-9]*)$/.test(value.runtimeRevision)&&
   ['movements','batches','sourceSnapshots','replicaEvents','changeSets','acks','ackCount'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0),'finalization_readback_shape');
  report.canonical={status:'OBSERVED',...value};}
 catch{report.canonical={status:'UNAVAILABLE',code:'history_volume_finalization_readback_unavailable'};if(!originalError)throw Error(report.canonical.code);}
 finally{report.canonicalReadElapsedMs=performance.now()-started;}
 if(originalError)throw originalError;return report.canonical;
}

export async function finalizeVolumeBaseline({request,manifest,shop,runId,context,applyKey,snapshotKey,clientSha,validateBaseline,validateReplica,report}){
 const started=performance.now(),rows=25947,batches=1,pageSize=500;
 Object.assign(report,{status:'RUNNING',syntheticOnly:true,clientSha,clientShaPurpose:'ACK metadata and frozen reference only; no CLR or WPF execution in this gate',rows,applyAttempts:0,applyOutcome:'NOT_RUN',phase:'baseline_review',receipt:'NOT_RUN',replica:'NOT_RUN'});
 demand(/^[0-9a-f]{40}$/.test(clientSha)&&uuid(applyKey)&&uuid(snapshotKey)&&uuid(runId),'finalization_scope');
 const scope={shopId:shop,deviceId:manifest.deviceId,runId,datasetId:context.dataset_id,writerEpoch:context.writer_epoch,
  localDatasetId:manifest.localDatasetId,localRevision:manifest.dataRevision,restoreEpoch:manifest.restoreEpoch,restoreLineageId:manifest.restoreLineageId};
 try{
  const review=await request('baseline_review',{run_id:runId});validateBaseline('baseline_review',review,scope);
  demand(review.can_apply===true&&digest(review.review_digest),'finalization_review_blocked');report.reviewDigest=review.review_digest;
  report.phase='baseline_apply';report.applyAttempts++;report.applyOutcome='OUTCOME_UNKNOWN';
  const receipt=await request('baseline_apply',{run_id:runId,request_key:applyKey,review_digest:review.review_digest});validateBaseline('baseline_apply',receipt,scope);
  demand(receipt.new_active===rows&&receipt.new_inactive===0&&receipt.duplicates===0&&receipt.new_batches===batches,'finalization_receipt_counts');
  report.applyOutcome='ACKNOWLEDGED';
  report.phase='baseline_receipt';const repeated=await request('baseline_receipt',{request_key:applyKey});validateBaseline('baseline_receipt',repeated,scope);
  demand(isDeepStrictEqual(receipt,repeated.receipt),'finalization_receipt_mismatch');
  report.receipt={status:'PASS',sha256:sha(JSON.stringify(receipt)),readbackSha256:sha(JSON.stringify(repeated.receipt)),
   sourceRunId:receipt.source_run_id,sourceSnapshotId:receipt.source_snapshot_id,datasetId:receipt.dataset_id,revision:receipt.revision,writerEpoch:receipt.writer_epoch,operationId:receipt.operation_id};
  report.phase='snapshot_start';const snapshot=await request('snapshot_start',{request_key:snapshotKey,page_size:pageSize});validateReplica('snapshot_start',snapshot,shop);
  demand(snapshot.dataset_id===receipt.dataset_id&&snapshot.revision===receipt.revision&&snapshot.writer_epoch===receipt.writer_epoch&&snapshot.movements===rows&&snapshot.batches===batches,'finalization_snapshot_scope');
  const checksum=createHash('sha256').update(['history-replica-snapshot-v1',shop,snapshot.dataset_id,snapshot.revision,snapshot.writer_epoch,''].join('\n'));
  const seen=new Set();let previous='',cursor=snapshot.cursor,movements=0,batchCount=0,pages=0,done=false;
  report.phase='page';
  while(!done){
   demand(++pages<=Math.ceil((rows+batches)/pageSize),'finalization_page_bound');
   const page=await request('page',{cursor});validateReplica('page',page,shop);
   demand(page.cursor===cursor&&page.dataset_id===snapshot.dataset_id&&page.revision===snapshot.revision&&page.writer_epoch===snapshot.writer_epoch&&page.checksum===snapshot.checksum&&page.movements===rows&&page.batches===batches&&page.entities.length>0&&page.entities.length<=pageSize,'finalization_page_scope');
   for(const entity of page.entities){
    const key=entity.kind+'|'+entity.id;
    demand(!seen.has(key)&&key>previous,'finalization_entity_order');seen.add(key);previous=key;
    checksum.update(key+'|'+entity.digest+'\n');if(entity.kind==='movement')movements++;else if(entity.kind==='batch')batchCount++;else demand(false,'finalization_entity_kind');
   }
   done=page.done;if(!done)cursor=page.next_cursor;
  }
  const observedChecksum=checksum.digest('hex');
  demand(movements===rows&&batchCount===batches&&observedChecksum===snapshot.checksum,'finalization_replica_checksum');
  report.phase='replica_ack';const ack=await request('replica_ack',{cursor,checksum:observedChecksum,protocol_version:1,client_build_sha:clientSha});validateReplica('replica_ack',ack,shop);
  demand(ack.acknowledged===true&&ack.revision===snapshot.revision&&ack.writer_epoch===snapshot.writer_epoch,'finalization_replica_ack');
  report.replica={status:'PASS',mode:snapshot.mode,movements,batches:batchCount,pages,pageSize,datasetId:snapshot.dataset_id,revision:snapshot.revision,writerEpoch:snapshot.writer_epoch,checksum:observedChecksum,protocolVersion:1,clientBuildSha:clientSha,acknowledged:true};
  report.status='PASS_FULL_VOLUME_FINALIZATION';report.phase='complete';
 }catch(error){report.status='FAIL';report.code=error instanceof Error&&/^history_volume_[a-z_]+$/.test(error.message)?error.message:'history_volume_finalization_validation';throw error;}
 finally{report.elapsedMs=performance.now()-started;}
}
