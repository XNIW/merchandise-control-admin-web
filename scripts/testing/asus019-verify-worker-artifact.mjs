import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,isAbsolute,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Open} from 'unzipper-esm';

export const workerArtifactRepository='XNIW/merchandise-control-admin-web';
export const workerArtifactName='asus019-history-worker-v2-qualified';
const members=['history-worker.cjs','source-manifest.json','volume-complete.json','sql-complete.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const identifier=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const requireValue=(condition,code)=>{if(!condition)throw Error('history_worker_artifact_'+code);};
const closed=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const idEquals=(value,expected)=>Number.isSafeInteger(value)&&String(value)===expected;

export function verifyWorkerArtifactMetadata({run,artifact,workflow,jobs},{runId,artifactId,sourceSha}){
 requireValue(identifier(runId)&&identifier(artifactId)&&/^[0-9a-f]{40}$/.test(sourceSha),'input_invalid');
 requireValue(object(run)&&idEquals(run.id,runId)&&run.status==='completed'&&run.conclusion==='success'&&run.event==='workflow_dispatch'&&run.path==='.github/workflows/ci.yml'&&run.head_sha===sourceSha,'run_rejected');
 requireValue(run.repository?.full_name===workerArtifactRepository&&run.head_repository?.full_name===workerArtifactRepository&&Number.isSafeInteger(run.repository.id)&&run.repository.id>0&&run.repository.id===run.head_repository.id,'repository_rejected');
 requireValue(workflow?.path==='.github/workflows/ci.yml'&&Number.isSafeInteger(run.workflow_id)&&run.workflow_id>0&&workflow.id===run.workflow_id,'workflow_rejected');
 requireValue(object(artifact)&&idEquals(artifact.id,artifactId)&&artifact.name===workerArtifactName&&artifact.expired===false&&Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=32*1024*1024&&/^sha256:[0-9a-f]{64}$/.test(artifact.digest),'metadata_rejected');
 requireValue(artifact.workflow_run?.id===run.id&&artifact.workflow_run.head_sha===sourceSha&&artifact.workflow_run.repository_id===run.repository.id&&artifact.workflow_run.head_repository_id===run.repository.id,'artifact_source_rejected');
 requireValue(Array.isArray(jobs?.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.total_count<=100,'jobs_rejected');
 const selected=jobs.jobs.filter(j=>j.name==='ASUS019 owned authenticated history services');
 requireValue(selected.length===1,'job_rejected');const job=selected[0];
 requireValue(job.run_id===run.id&&job.status==='completed'&&job.conclusion==='success'&&Array.isArray(job.steps),'job_rejected');
 for(const name of ['Canonical owned replay without changed SQL budgets','Full-volume actual gateway SQL and dedicated Worker','Authenticated service and browser roundtrip'])requireValue(job.steps.some(step=>step.name===name&&step.status==='completed'&&step.conclusion==='success'),'step_rejected');
 const created=Date.parse(artifact.created_at),started=Date.parse(job.started_at),completed=Date.parse(job.completed_at);
 requireValue([created,started,completed].every(Number.isFinite)&&created>=started-1000&&created<=completed+1000,'artifact_attempt_rejected');
 return true;
}

export function workerSqlQualificationContract({runnerSource,runnerSha256,concurrencySha256,files}){
 const extensions=runnerSource.match(/REVIEWED_EXTENSIONS\s*=\s*\{([\s\S]*?)\n\}/)?.[1],base=runnerSource.match(/expected_assertions\s*=\s*(\d+)\s*\+\s*sum/)?.[1],baseFiles=runnerSource.match(/len\(tests\)\s*==\s*(\d+)\s*\+\s*len\(extension_tests\)/)?.[1];
 requireValue(extensions&&base&&baseFiles&&digest(runnerSha256)&&digest(concurrencySha256)&&Array.isArray(files),'sql_contract_invalid');
 const assertions=[...extensions.matchAll(/['"]additionalAssertions['"]\s*:\s*(\d+)/g)].map(m=>Number(m[1])),tests=[...extensions.matchAll(/['"]testFile['"]\s*:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
 requireValue(assertions.length===tests.length&&new Set(tests).size===tests.length&&new Set(files).size===files.length&&files.length===Number(baseFiles)+tests.length&&tests.every(file=>files.includes(file)),'sql_contract_invalid');
 for(const name of ['asus019_history_qualified_configuration.sql','asus019_history_migration_stage_vector.sql'])requireValue(files.includes('supabase/tests/'+name),'sql_contract_incomplete');
 return {runnerSha256,concurrencySha256,files:[...files].sort(),assertions:Number(base)+assertions.reduce((n,v)=>n+v,0)};
}

export async function verifyWorkerArtifactArchive(bytes,metadata,source){
 verifyWorkerArtifactMetadata(metadata,source);
 requireValue(bytes.length===metadata.artifact.size_in_bytes&&sha(bytes)===metadata.artifact.digest.slice(7),'archive_digest_rejected');
 const archive=await Open.buffer(bytes);
 requireValue(archive.files.length===4&&new Set(archive.files.map(f=>f.path)).size===4&&archive.files.every(f=>members.includes(f.path)&&!(f.flags&1)&&[0,8].includes(f.compressionMethod)&&f.uncompressedSize<=16*1024*1024)&&archive.files.reduce((n,f)=>n+f.uncompressedSize,0)<=24*1024*1024,'archive_members_rejected');
 const files={};for(const file of archive.files){const buffer=await file.buffer();requireValue(buffer.length===file.uncompressedSize,'archive_members_rejected');files[file.path]=buffer;}
 let manifest,sql,volume;try{manifest=JSON.parse(files['source-manifest.json']);sql=JSON.parse(files['sql-complete.json']);volume=JSON.parse(files['volume-complete.json']);}catch{throw Error('history_worker_artifact_json_rejected');}
 requireValue(closed(manifest,['schema','serverSha','sourceTree','lockSha256','workerSha256','nodeVersion','sqlEvidenceSha256','volumeEvidenceSha256'])&&manifest.schema==='asus019-worker-volume-source-v2'&&manifest.serverSha===source.sourceSha&&manifest.sourceTree===source.sourceTree&&manifest.lockSha256===source.lockSha256&&manifest.nodeVersion==='v24.18.0','manifest_rejected');
 requireValue(manifest.workerSha256===sha(files['history-worker.cjs'])&&manifest.sqlEvidenceSha256===sha(files['sql-complete.json'])&&manifest.volumeEvidenceSha256===sha(files['volume-complete.json']),'member_digest_rejected');
 const contract=source.sqlContract;
 requireValue(sql.status==='LOCAL_CANONICAL_BYTE_EXACT_AND_PGTAP_PASS'&&sql.head===source.sourceSha&&sql.CLI==='2.109.0'&&sql.profile==='ci'&&sql.operatorSQLByteExactReplay===true&&sql.runnerSHA256===contract.runnerSha256&&sql.pgTAPFiles===contract.files.length&&sql.pgTAPTests===contract.assertions&&JSON.stringify(sql.databaseTestFiles)===JSON.stringify(contract.files),'sql_gate_rejected');
 requireValue(sql.historicalConcurrency?.status==='PASS'&&sql.historicalConcurrency.cases===3&&digest(sql.historicalConcurrency.receiptSHA256)&&sql.historicalConcurrency.harnessSHA256===contract.concurrencySha256&&digest(sql.pgtapStdoutSHA256),'sql_concurrency_rejected');
 requireValue(volume.status==='PASS_REAL_GATEWAY_SQL_FULL_VOLUME'&&volume.serverSha===source.sourceSha&&volume.workerSha256===manifest.workerSha256&&volume.realGateway===true&&volume.gatewayRuntime==='node24-native-route-adapter'&&volume.sqlRuntime==='postgres-postgrest-owned-fixture','volume_gate_rejected');
 requireValue(volume.payload?.rows===25947&&volume.payload.movementBytes===20274917&&volume.canonical?.state==='review_ready'&&volume.canonical.processed_objects===25955&&volume.canonical.processed_movements===25947,'volume_counts_rejected');
 requireValue(volume.limits?.analysisBudgetMs===120000&&volume.limits.requestBudgetMs===15000&&volume.limits.canonicalRowLimit===200&&volume.limits.vectorChunkLimit===4,'volume_limits_rejected');
 const measured=volume.measurement,transport=volume.transport;
 requireValue(number(measured?.elapsedMs)&&measured.elapsedMs>0&&measured.elapsedMs<120000&&measured.exit?.code===0&&measured.exit.signal===null&&number(measured.peakRssBytes)&&measured.peakRssBytes<=896*1024*1024&&digest(measured.diagnosticsSha256)&&measured.diagnosticsBytes>0&&measured.diagnosticsBytes<=512*1024,'volume_measurement_rejected');
 requireValue(transport?.latencyMsPerGatewayRequest===300&&transport.encodedWorkerLinkBytesPerSecond===51200&&transport.storageLink==='actual-loopback'&&transport.heapMiB===640&&transport.processRssLimitBytes===1073741824&&volume.counters?.vectorRequests===67&&volume.counters.lostAckInjected===true,'volume_transport_rejected');
 const receipt={schema:'history-worker-runtime-qualification-v2',protocol:'stage_vector_v2',nodeVersion:'v24.18.0',sourceSha:source.sourceSha,sourceTree:source.sourceTree,workerSha256:manifest.workerSha256,artifactId:source.artifactId,artifactArchiveSha256:sha(bytes),canonicalSql:{status:'PASS',sourceSha:source.sourceSha,runId:source.runId,reportSha256:manifest.sqlEvidenceSha256},realVolume:{status:'PASS',sourceSha:source.sourceSha,runId:source.runId,reportSha256:manifest.volumeEvidenceSha256,workerSha256:manifest.workerSha256,syntheticOnly:true,sqlReal:true,realGateway:true,gatewayRuntime:volume.gatewayRuntime,sqlRuntime:volume.sqlRuntime,rows:25947,movementBytes:20274917,analysisBudgetMs:120000,requestBudgetMs:15000,canonicalRowLimit:200,vectorChunkLimit:4,elapsedMs:measured.elapsedMs}};
 const receiptBytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
 return {files,receipt,receiptBytes,receiptSha256:sha(receiptBytes)};
}

async function main(){
 const args={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];requireValue(['--run-id','--artifact-id','--output-directory','--expected-receipt-sha256'].includes(key)&&process.argv[i+1]&&!Object.hasOwn(args,key),'input_invalid');args[key]=process.argv[i+1];}
 requireValue(identifier(args['--run-id'])&&identifier(args['--artifact-id'])&&isAbsolute(args['--output-directory']??'')&&(!args['--expected-receipt-sha256']||digest(args['--expected-receipt-sha256'])),'input_invalid');
 const root=resolve(process.cwd()),output=resolve(args['--output-directory']),normalize=path=>process.platform==='win32'?path.toLowerCase():path;
 requireValue(normalize(output)!==normalize(root)&&!normalize(output).startsWith(normalize(root)+sep)&&!existsSync(output),'fresh_output_required');
 const git=(...argv)=>execFileSync('git',argv,{maxBuffer:8*1024*1024,stdio:['ignore','pipe','ignore']});
 requireValue(git('status','--porcelain').length===0,'immutable_source_required');
 const blob=path=>git('show','HEAD:'+path),sourceSha=git('rev-parse','HEAD').toString().trim(),sourceTree=git('rev-parse','HEAD^{tree}').toString().trim();
 const sqlContract=workerSqlQualificationContract({runnerSource:blob('scripts/ci/mobile-recovery-local-replay.py').toString(),runnerSha256:sha(blob('scripts/ci/mobile-recovery-local-replay.py')),concurrencySha256:sha(blob('scripts/ci/asus019-history-concurrency.py')),files:git('ls-tree','-r','--name-only','HEAD','--','supabase/tests').toString().split(/\r?\n/).filter(file=>file.endsWith('.sql')).sort()});
 const source={runId:args['--run-id'],artifactId:args['--artifact-id'],sourceSha,sourceTree,lockSha256:sha(blob('package-lock.json')),sqlContract};
 const api=endpoint=>execFileSync('gh',['api','--hostname','github.com','--method','GET','-H','Accept: application/vnd.github+json','-H','X-GitHub-Api-Version: 2026-03-10','repos/'+workerArtifactRepository+'/'+endpoint],{maxBuffer:32*1024*1024,timeout:90000,stdio:['ignore','pipe','ignore']});
 const metadata={run:JSON.parse(api('actions/runs/'+source.runId)),artifact:JSON.parse(api('actions/artifacts/'+source.artifactId)),workflow:JSON.parse(api('actions/workflows/ci.yml')),jobs:JSON.parse(api('actions/runs/'+source.runId+'/jobs?filter=latest&per_page=100'))};
 verifyWorkerArtifactMetadata(metadata,source);
 const result=await verifyWorkerArtifactArchive(api('actions/artifacts/'+source.artifactId+'/zip'),metadata,source);
 if(args['--expected-receipt-sha256'])requireValue(result.receiptSha256===args['--expected-receipt-sha256'],'receipt_digest_rejected');
 mkdirSync(output);for(const name of members)writeFileSync(join(output,name),result.files[name],{flag:'wx'});writeFileSync(join(output,'runtime-qualification.json'),result.receiptBytes,{flag:'wx'});
 process.stdout.write(JSON.stringify({event:'history_worker_artifact_verified',sourceSha,artifactId:source.artifactId,receiptSha256:result.receiptSha256,workerSha256:result.receipt.workerSha256})+'\n');
}
if(process.argv[1]&&resolve(fileURLToPath(import.meta.url))===resolve(process.argv[1]))main().catch(error=>{process.stderr.write(/^history_worker_artifact_[a-z_]+$/.test(error?.message??'')?error.message+'\n':'history_worker_artifact_verification_failed\n');process.exitCode=1;});
