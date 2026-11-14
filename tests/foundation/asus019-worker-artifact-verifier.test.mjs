import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {zip} from './helpers/payment-history-harness.mjs';
import {verifyWorkerArtifactMetadata,verifyWorkerArtifactArchive,workerSqlQualificationContract,workerArtifactRepository,workerArtifactName} from '../../scripts/testing/asus019-verify-worker-artifact.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// All objects/bytes below are in-memory unit inputs. They never become a CI
// artifact, qualification receipt or installable package and never run a worker.
function fixture(){
 const sourceSha='a'.repeat(40),sourceTree='b'.repeat(40),lockSha256='c'.repeat(64),runnerSha256='d'.repeat(64),concurrencySha256='e'.repeat(64),worker=Buffer.from('// synthetic unit input only\n');
 const files=['supabase/tests/asus019_history_qualified_configuration.sql','supabase/tests/asus019_history_migration_stage_vector.sql',...Array.from({length:67},(_,i)=>`supabase/tests/base_${i}.sql`)].sort();
 const runnerSource="REVIEWED_EXTENSIONS = {\n 'one': {'additionalAssertions':36,'testFile':'supabase/tests/asus019_history_qualified_configuration.sql'},\n 'two': {'additionalAssertions':23,'testFile':'supabase/tests/asus019_history_migration_stage_vector.sql'},\n}\nexpected_assertions = 4375 + sum(x)\nlen(tests) == 67 + len(extension_tests)";
 const sqlContract=workerSqlQualificationContract({runnerSource,runnerSha256,concurrencySha256,files}),source={runId:'123',artifactId:'456',sourceSha,sourceTree,lockSha256,sqlContract};
 const sql={status:'LOCAL_CANONICAL_BYTE_EXACT_AND_PGTAP_PASS',head:sourceSha,CLI:'2.109.0',profile:'ci',operatorSQLByteExactReplay:true,runnerSHA256:runnerSha256,pgTAPFiles:files.length,pgTAPTests:4434,databaseTestFiles:files,historicalConcurrency:{status:'PASS',cases:3,receiptSHA256:'f'.repeat(64),harnessSHA256:concurrencySha256},pgtapStdoutSHA256:'1'.repeat(64)};
 const volume={status:'PASS_REAL_GATEWAY_SQL_FULL_VOLUME',serverSha:sourceSha,workerSha256:hash(worker),realGateway:true,gatewayRuntime:'node24-native-route-adapter',sqlRuntime:'postgres-postgrest-owned-fixture',payload:{rows:25947,movementBytes:20274917},canonical:{state:'review_ready',processed_objects:25955,processed_movements:25947},limits:{analysisBudgetMs:120000,requestBudgetMs:15000,canonicalRowLimit:200,vectorChunkLimit:4},measurement:{elapsedMs:100000,exit:{code:0,signal:null},peakRssBytes:1000000,diagnosticsSha256:'2'.repeat(64),diagnosticsBytes:4000},transport:{latencyMsPerGatewayRequest:300,encodedWorkerLinkBytesPerSecond:51200,storageLink:'actual-loopback',heapMiB:640,processRssLimitBytes:1073741824},counters:{vectorRequests:67,lostAckInjected:true}};
 volume.payload.archiveBytes=486290;volume.counters.encodedStagingBytes=1800000;volume.counters.chargedStagingBytes=1800000*Math.max(1,869952/486290);
 volume.representativeness={aggregateReferenceArchiveBytes:869952,syntheticArchiveBytes:486290,encodedLinkChargeFactor:Math.max(1,869952/486290),encodedWireToMovementRatio:1800000/20274917,liveCloudQualified:false};
 volume.representativeness.additiveNetworkFloorMs=volume.counters.chargedStagingBytes/51200*1000+67*300;
 const metadata={run:{id:123,status:'completed',conclusion:'success',event:'workflow_dispatch',path:'.github/workflows/ci.yml',head_sha:sourceSha,workflow_id:55,repository:{id:66,full_name:workerArtifactRepository},head_repository:{id:66,full_name:workerArtifactRepository}},workflow:{id:55,path:'.github/workflows/ci.yml'},artifact:{id:456,name:workerArtifactName,expired:false,created_at:'2026-11-14T03:00:30Z',workflow_run:{id:123,head_sha:sourceSha,repository_id:66,head_repository_id:66}},jobs:{total_count:1,jobs:[{name:'ASUS019 owned authenticated history services',run_id:123,status:'completed',conclusion:'success',started_at:'2026-11-14T03:00:00Z',completed_at:'2026-11-14T03:01:00Z',steps:['Canonical owned replay without changed SQL budgets','Full-volume actual gateway SQL and dedicated Worker','Authenticated service and browser roundtrip'].map(name=>({name,status:'completed',conclusion:'success'}))}]}};
 function archive({extra=[],changeManifest=()=>{}}={}){
  const sqlBytes=Buffer.from(JSON.stringify(sql)),volumeBytes=Buffer.from(JSON.stringify(volume)),manifest={schema:'asus019-worker-volume-source-v2',serverSha:sourceSha,sourceTree,lockSha256,workerSha256:hash(worker),nodeVersion:'v24.18.0',sqlEvidenceSha256:hash(sqlBytes),volumeEvidenceSha256:hash(volumeBytes)};changeManifest(manifest);
  const bytes=zip([{name:'history-worker.cjs',bytes:worker},{name:'source-manifest.json',bytes:Buffer.from(JSON.stringify(manifest))},{name:'sql-complete.json',bytes:sqlBytes},{name:'volume-complete.json',bytes:volumeBytes},...extra]);
  metadata.artifact.size_in_bytes=bytes.length;metadata.artifact.digest='sha256:'+hash(bytes);return bytes;
 }
 return {source,sql,volume,metadata,archive};
}
test('verified artifact yields a deterministic source-bound receipt without inventing a workerd volume claim',async()=>{
 const x=fixture(),bytes=x.archive(),one=await verifyWorkerArtifactArchive(bytes,x.metadata,x.source),two=await verifyWorkerArtifactArchive(bytes,x.metadata,x.source);
 assert.deepEqual(one.receiptBytes,two.receiptBytes);assert.equal(one.receipt.artifactArchiveSha256,hash(bytes));assert.equal(one.receipt.realVolume.realGateway,true);assert.equal(one.receipt.realVolume.gatewayRuntime,'node24-native-route-adapter');assert.equal(Object.hasOwn(one.receipt.realVolume,'nativeGateway'),false);
});
const bindingChanges={
 'failed run':x=>x.metadata.run.conclusion='failure','unfinished run':x=>x.metadata.run.status='in_progress','foreign repository':x=>x.metadata.run.repository.full_name='other/repo','fork head':x=>x.metadata.run.head_repository.id=77,'different source':x=>x.metadata.run.head_sha='0'.repeat(40),'other workflow':x=>x.metadata.workflow.path='.github/workflows/other.yml','expired artifact':x=>x.metadata.artifact.expired=true,'other artifact':x=>x.metadata.artifact.name='free-pass-file','wrong run':x=>x.metadata.artifact.workflow_run.id=999,'fork artifact':x=>x.metadata.artifact.workflow_run.head_repository_id=77,'failed volume step':x=>x.metadata.jobs.jobs[0].steps[1].conclusion='failure','skipped auth':x=>x.metadata.jobs.jobs[0].steps[2].status='queued','old attempt artifact':x=>x.metadata.artifact.created_at='2026-11-13T00:00:00Z','missing job page':x=>x.metadata.jobs.total_count=2
};
for(const [name,change] of Object.entries(bindingChanges))test('GitHub binding rejects '+name,()=>{const x=fixture();x.archive();change(x);assert.throws(()=>verifyWorkerArtifactMetadata(x.metadata,x.source),/^Error: history_worker_artifact_/);});
const reportChanges={
 'SQL partial count':x=>x.sql.pgTAPTests--,'SQL foreign source':x=>x.sql.head='0'.repeat(40),'SQL missing file':x=>x.sql.databaseTestFiles.pop(),'SQL concurrency failure':x=>x.sql.historicalConcurrency.status='FAIL','volume timeout':x=>x.volume.measurement.elapsedMs=120000,'volume budget increase':x=>x.volume.limits.analysisBudgetMs=180000,'larger canonical chunk':x=>x.volume.limits.canonicalRowLimit=800,'larger vector':x=>x.volume.limits.vectorChunkLimit=5,'partial volume':x=>x.volume.canonical.processed_movements=1000,'stub gateway':x=>x.volume.realGateway=false,'workerd mislabel':x=>x.volume.gatewayRuntime='workerd','wrong heap':x=>x.volume.transport.heapMiB=1024,'failed child':x=>x.volume.measurement.exit.code=1,'missing diagnostics':x=>x.volume.measurement.diagnosticsBytes=0,'missing lost ACK':x=>x.volume.counters.lostAckInjected=false
};
for(const [name,change] of Object.entries(reportChanges))test('artifact evidence rejects '+name,async()=>{const x=fixture();change(x);await assert.rejects(()=>verifyWorkerArtifactArchive(x.archive(),x.metadata,x.source),/^Error: history_worker_artifact_/);});
const chargeChanges={
 'missing charge model':x=>delete x.volume.representativeness,'missing archive byte count':x=>delete x.volume.payload.archiveBytes,'different reference archive':x=>x.volume.representativeness.aggregateReferenceArchiveBytes=100,'different synthetic archive':x=>x.volume.representativeness.syntheticArchiveBytes++,'discounted factor':x=>x.volume.representativeness.encodedLinkChargeFactor=1,'fractional encoded byte count':x=>x.volume.counters.encodedStagingBytes+=0.5,'undercharged one byte':x=>x.volume.counters.chargedStagingBytes-=1,'missing charge':x=>delete x.volume.counters.chargedStagingBytes,'wrong wire ratio':x=>x.volume.representativeness.encodedWireToMovementRatio/=2,'invented live cloud qualification':x=>x.volume.representativeness.liveCloudQualified=true
};
for(const [name,change] of Object.entries(chargeChanges))test('representativeness binding rejects '+name,async()=>{const x=fixture();change(x);await assert.rejects(()=>verifyWorkerArtifactArchive(x.archive(),x.metadata,x.source),/^Error: history_worker_artifact_volume_(representativeness|charge_model)_rejected/);});
test('charge arithmetic accepts only67-term roundoff and never discounts a larger synthetic archive',async()=>{
 const x=fixture(),factor=x.volume.representativeness.encodedLinkChargeFactor;
 x.volume.counters.encodedStagingBytes=Array.from({length:67},(_,i)=>10000+i).reduce((n,v)=>n+v,0);
 x.volume.counters.chargedStagingBytes=Array.from({length:67},(_,i)=>(10000+i)*factor).reduce((n,v)=>n+v,0);x.volume.representativeness.encodedWireToMovementRatio=x.volume.counters.encodedStagingBytes/20274917;
 x.volume.representativeness.additiveNetworkFloorMs=x.volume.counters.chargedStagingBytes/51200*1000+67*300;
 await verifyWorkerArtifactArchive(x.archive(),x.metadata,x.source);
 const y=fixture();y.volume.payload.archiveBytes=900000;y.volume.representativeness.syntheticArchiveBytes=900000;y.volume.representativeness.encodedLinkChargeFactor=1;y.volume.counters.chargedStagingBytes=y.volume.counters.encodedStagingBytes;
 y.volume.representativeness.additiveNetworkFloorMs=y.volume.counters.chargedStagingBytes/51200*1000+67*300;
 await verifyWorkerArtifactArchive(y.archive(),y.metadata,y.source);
});
test('sequential additive charge requires elapsed at or above latency plus charged byte time',async()=>{
 const x=fixture(),floor=x.volume.counters.chargedStagingBytes/x.volume.transport.encodedWorkerLinkBytesPerSecond*1000+x.volume.counters.vectorRequests*x.volume.transport.latencyMsPerGatewayRequest;
 x.volume.measurement.elapsedMs=floor-0.001;
 await assert.rejects(()=>verifyWorkerArtifactArchive(x.archive(),x.metadata,x.source),/^Error: history_worker_artifact_volume_additive_time_rejected$/);
 x.volume.measurement.elapsedMs=floor;
 await verifyWorkerArtifactArchive(x.archive(),x.metadata,x.source);
 x.volume.representativeness.additiveNetworkFloorMs=floor-1;
 await assert.rejects(()=>verifyWorkerArtifactArchive(x.archive(),x.metadata,x.source),/^Error: history_worker_artifact_volume_additive_time_rejected$/);
});
test('ZIP digest, member hashes, extra files and traversal paths are rejected before package writes',async()=>{
 const x=fixture(),bytes=x.archive();bytes[10]^=1;await assert.rejects(()=>verifyWorkerArtifactArchive(bytes,x.metadata,x.source),/archive_digest_rejected/);
 for(const name of ['arbitrary-pass.json','../history-worker.cjs']){const y=fixture();await assert.rejects(()=>verifyWorkerArtifactArchive(y.archive({extra:[{name,bytes:Buffer.from('PASS')}]}),y.metadata,y.source),/archive_members_rejected/);}
 const z=fixture();await assert.rejects(()=>verifyWorkerArtifactArchive(z.archive({changeManifest:m=>m.workerSha256='0'.repeat(64)}),z.metadata,z.source),/member_digest_rejected/);
});
test('workflow takes only opaque IDs and the externally verified receipt hash, never a PASS file or command',()=>{
 const text=readFileSync('.github/workflows/asus019-worker-host.yml','utf8');
 for(const field of ['qualified_run_id','qualified_artifact_id','expected_receipt_sha256'])assert.match(text,new RegExp(field+':'));
 assert.match(text,/GH_TOKEN: \$\{\{ github.token \}\}/);assert.match(text,/actions: read/);assert.match(text,/asus019-verify-worker-artifact\.mjs/);assert.match(text,/-RuntimeQualificationReceiptSha256 \$env:EXPECTED_RECEIPT_SHA256/);
 for(const block of text.matchAll(/        run: \|\r?\n([\s\S]*?)(?=\r?\n      - name:|$)/g))assert.equal(block[1].includes('${{ inputs.'),false);
});
