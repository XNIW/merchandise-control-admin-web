// An owned disposable Supabase replay, actual HTTP gateway route and actual
// dedicated Worker artifact. No RPC, parser, Storage or staging-engine stub.
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {Readable,Transform} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,copyFileSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
import {build} from 'esbuild';
import {syntheticBaselineVolume} from '../../tests/foundation/helpers/payment-history-volume-fixture.mjs';
const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--owned-workdir','--evidence-dir'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('history_volume_arguments');options[args[i]]=args[i+1];}
const demand=(ok,code)=>{if(!ok)throw Error(code);},sha=v=>createHash('sha256').update(v).digest('hex'),root=process.cwd();
demand(process.platform==='linux'&&process.versions.node.startsWith('24.')&&isAbsolute(options['--owned-workdir']??'')&&isAbsolute(options['--evidence-dir']??''),'history_volume_runtime');
const evidence=resolve(options['--evidence-dir']);demand(!existsSync(evidence)&&!evidence.startsWith(root+'/'),'history_volume_fresh_evidence');process.umask(0o077);mkdirSync(evidence,{mode:0o700});
const save=(name,value)=>{const p=join(evidence,name),t=p+'.tmp';writeFileSync(t,JSON.stringify(value),{mode:0o600});renameSync(t,p);};
const command=(program,argv,env=process.env)=>{const r=spawnSync(program,argv,{cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});demand(r.status===0&&!r.error,'history_volume_command_failed');return r.stdout;};
let phase='ownership',child,server;const report={status:'FAIL',syntheticOnly:true,realPostgres:true,realStorage:true,realGateway:true,realGatewayRoute:true,gatewayRuntime:'node24-native-route-adapter',sqlRuntime:'postgres-postgrest-owned-fixture',realWorkerArtifact:true,financialApply:false};
const counters={gatewayRequests:0,vectorRequests:0,encodedStagingBytes:0,chargedStagingBytes:0,roundTripMs:[],sqlOriginalMs:[],lostAckInjected:false};
try{
 const runtime=JSON.parse(command('python3',['-B','scripts/ci/asus019-history-local-runtime.py','--workdir',options['--owned-workdir']]));
 demand(runtime.url==='http://127.0.0.1:54321'&&/^[0-9a-f]{64}$/.test(runtime.containerID)&&/^r4-ci-preflight-[0-9a-f]{12}$/.test(runtime.project),'history_volume_owned_runtime');
 report.serverSha=command('git',['rev-parse','HEAD']).trim();demand(runtime.head===report.serverSha&&command('git',['status','--porcelain']).trim()==='','history_volume_frozen_source');
 const sql=text=>{const r=spawnSync('docker',['exec','-i',runtime.containerID,'/nix/var/nix/profiles/default/bin/psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],{input:"SET statement_timeout='8s';SET lock_timeout='6s';\n"+text,encoding:'utf8',timeout:20000,maxBuffer:65536});if(r.status!==0){writeFileSync(join(evidence,'sql-error.private.log'),r.stderr??'',{mode:0o600});throw Error('history_volume_fixture_sql_failed');}return r.stdout.trim();};
 const q=v=>"'"+String(v).replaceAll("'","''")+"'";
 demand(sql("SELECT (SELECT count(*) FROM public.payment_history_jobs WHERE state IN('queued','analysing'))+(SELECT count(*) FROM public.payment_history_migration_runs WHERE state IN('queued','analysing'))+(SELECT count(*) FROM public.payment_history_uploads WHERE state IN('uploaded','verifying'));" )==='0','history_volume_queue_not_exclusive');
 phase='fixture';const shop='10000000-0000-4000-8000-000000693019',staff='30000000-0000-4000-8000-000000693019';
 const fixture=await syntheticBaselineVolume({shopId:shop}),m=fixture.manifest,device=m.deviceId,credential=randomUUID(),session=randomUUID(),deviceHash='sha256:'+sha(randomBytes(32)),sessionHash='sha256:'+sha(randomBytes(32));
 demand(m.shopId===shop&&fixture.metadata.rows===25947&&fixture.metadata.movementBytes===20274917,'history_volume_exact_payload');report.payload=fixture.metadata;
 const encodedLinkFactor=Math.max(1,869952/fixture.archive.length);
 report.representativeness={aggregateReferenceArchiveBytes:869952,syntheticArchiveBytes:fixture.archive.length,encodedLinkChargeFactor:encodedLinkFactor,
  limitation:'Synthetic field entropy differs from the original. Archive-size ratio charges additional network time; it does not qualify live-cloud completion.',liveCloudQualified:false};
 sql(`BEGIN;INSERT INTO public.shops(shop_id,shop_code,shop_name,shop_status) VALUES(${q(shop)},'VOLUME019','Synthetic full-volume baseline','active');
 INSERT INTO public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status) VALUES(${q(staff)},${q(shop)},'1001','Synthetic volume operator','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),null,false,7,'active');
 INSERT INTO public.staff_role_permissions(shop_id,role_key,permission_key,enabled) VALUES(${q(shop)},'pos_admin','shop_admin.full_access',true) on conflict(shop_id,role_key,permission_key) do update set enabled=true;
 INSERT INTO public.payment_history_role_permissions(shop_id,role_key,capability,enabled) VALUES(${q(shop)},'pos_admin','migrate',true);
 INSERT INTO public.payment_history_runtime(shop_id) VALUES(${q(shop)});
 INSERT INTO public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status) VALUES(${q(device)},${q(shop)},'SYNTHETIC-VOLUME-POS','Synthetic volume POS','pos','active');
 INSERT INTO public.pos_device_credentials(pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,expires_at) VALUES(${q(credential)},${q(shop)},${q(device)},${q(staff)},${q(deviceHash)},7,'9999-12-31 23:59:59.999999+00'::timestamptz);
 INSERT INTO public.pos_sessions(pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,issued_at,expires_at) VALUES(${q(session)},${q(shop)},${q(device)},${q(staff)},${q(credential)},${q(sessionHash)},7,clock_timestamp(),'9999-12-31 23:59:59.999999+00'::timestamptz);COMMIT;NOTIFY pgrst,'reload schema';`);
 const db=createClient(runtime.url,runtime.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}),secret=randomBytes(32).toString('hex');
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:runtime.url,SUPABASE_SERVICE_ROLE_KEY:runtime.serviceKey,PAYMENT_HISTORY_WORKER_GATEWAY_SECRET:secret});
 phase='bundle';const migrationSource=readFileSync('src/server/payment-history/migration-worker.ts','utf8'),transportSource=readFileSync('tools/PaymentHistoryWorker/gateway-port.ts','utf8');
 demand(migrationSource.includes('setTimeout(expire,120000)')&&migrationSource.includes('chunks.length===4')&&migrationSource.includes('pending.length>=200')&&transportSource.includes('AbortSignal.timeout(15000)'),'history_volume_product_limits');
 report.limits={analysisBudgetMs:120000,requestBudgetMs:15000,canonicalRowLimit:200,vectorChunkLimit:4};
 command(process.execPath,['scripts/build-payment-history-worker.mjs',join(evidence,'history-worker.cjs')]);report.workerSha256=sha(readFileSync(join(evidence,'history-worker.cjs')));
 await build({entryPoints:['src/app/api/internal/payment-history/worker/route.ts'],bundle:true,platform:'node',target:'node24',format:'cjs',conditions:['react-server'],outfile:join(evidence,'gateway-route.cjs'),logLevel:'silent'});
 const route=createRequire(import.meta.url)(join(evidence,'gateway-route.cjs'));report.gatewayRouteSha256=sha(readFileSync(join(evidence,'gateway-route.cjs')));
 server=createServer(async(req,res)=>{try{
  if(req.method!=='POST'||req.url!=='/api/internal/payment-history/worker'){res.writeHead(404);res.end();return;}
  counters.gatewayRequests++;const start=performance.now();let encoded=0;
  const throttle=new Transform({transform(bytes,_encoding,done){encoded+=bytes.length;setTimeout(()=>done(null,bytes),Math.ceil(bytes.length*encodedLinkFactor/51200*1000));}});
  // Shape only the Worker staging link; Storage remains the actual local service.
  const abort=new AbortController();req.once('aborted',()=>abort.abort());
  await delay(300,undefined,{signal:abort.signal});
  const body=req.pipe(throttle);
  const response=await route.POST(new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers,body:Readable.toWeb(body),duplex:'half',signal:abort.signal}));
  const bytes=Buffer.from(await response.arrayBuffer());let result;try{result=JSON.parse(bytes);}catch{}
  if(result?.data?.phase&&['stage_objects','stage_movements'].includes(result.data.phase)){
   counters.vectorRequests++;counters.encodedStagingBytes+=encoded;counters.chargedStagingBytes+=encoded*encodedLinkFactor;counters.roundTripMs.push(performance.now()-start);counters.sqlOriginalMs.push(result.data.sql_elapsed_ms);
   if(!counters.lostAckInjected){counters.lostAckInjected=true;res.destroy();return;}
  }
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);
 }catch{res.writeHead(503,{'content-type':'application/json'});res.end('{"ok":false}');}});
 await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});const endpoint=`http://127.0.0.1:${server.address().port}/api/internal/payment-history/worker`;
 async function worker(label,timeout=130000){
  const stdout=openSync(join(evidence,label+'.private.log'),'wx',0o600),diagnostic=join(evidence,label+'.diagnostics.private.jsonl'),started=performance.now();
  // The privileged gateway key stays in the supervisor/HTTP route. The
  // dedicated Worker receives only OS paths and its own gateway credential.
  const osEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TEMP','TMP','LANG','LC_ALL','TZ','SystemRoot','WINDIR'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]]]));
  child=spawn(process.execPath,['--max-old-space-size=640',join(evidence,'history-worker.cjs'),'--once'],{cwd:root,env:{...osEnv,PAYMENT_HISTORY_WORKER_GATEWAY_SECRET:secret,PAYMENT_HISTORY_WORKER_GATEWAY_URL:endpoint,PAYMENT_HISTORY_ALLOW_LOOPBACK:'yes',HISTORY_WORKER_DIAGNOSTICS_FILE:diagnostic},stdio:['ignore',stdout,stdout]});closeSync(stdout);
  let peak=0;const monitor=setInterval(()=>{try{const line=readFileSync('/proc/'+child.pid+'/status','utf8').match(/^VmRSS:\s+(\d+)\s+kB/m);if(line){peak=Math.max(peak,Number(line[1])*1024);if(peak>1073741824)child.kill('SIGTERM');}}catch{}},100),timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
  let exit;try{exit=await new Promise((yes,no)=>{child.once('error',no);child.once('close',(code,signal)=>yes({code,signal}));});}finally{clearInterval(monitor);clearTimeout(timer);}
  const elapsedMs=performance.now()-started,bytes=readFileSync(diagnostic),events=bytes.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);report.lastWorkerRuntime={label,elapsedMs,peakRssBytes:peak,exit,diagnosticsSha256:sha(bytes),diagnosticsBytes:bytes.length};demand(bytes.length<=524288&&exit.code===0&&exit.signal===null&&peak<=939524096,'history_volume_worker_runtime_failed');
  return {elapsedMs,peakRssBytes:peak,exit,diagnosticsSha256:sha(bytes),diagnosticsBytes:bytes.length,events};
 }
 await worker('warm',30000);
 const scope={p_shop_id:shop,p_shop_device_id:device,p_staff_id:staff,p_pos_session_id:session,p_device_token_hash:deviceHash,p_session_token_hash:sessionHash,p_credential_version:7};
 async function deviceRequest(operation,payload){const r=await db.rpc('payment_history_device_http_v2',{...scope,p_operation:operation,p_payload:payload});demand(!r.error&&r.data?.ok===true&&r.data.shop_id===shop&&r.data.device_id===device,'history_volume_device_admission_failed');return r.data.result;}
 phase='source';const context=await deviceRequest('baseline_context',{local_dataset_id:m.localDatasetId,data_revision:m.dataRevision,restore_epoch:m.restoreEpoch,restore_lineage_id:m.restoreLineageId});
 const upload=await deviceRequest('baseline_upload_create',{request_key:randomUUID(),file_name:'synthetic-volume.w7history.zip',sha256:sha(fixture.archive),byte_length:String(fixture.archive.length)});
 demand(upload.object_key===`history/${shop}/${upload.upload_id}`,'history_volume_source_scope');const stored=await db.storage.from('payment-history-sources').upload(upload.object_key,fixture.archive,{upsert:false,contentType:'application/zip'});demand(!stored.error,'history_volume_storage_failed');
 await deviceRequest('baseline_upload_ready',{upload_id:upload.upload_id});await worker('source-verify',30000);const verified=await deviceRequest('baseline_upload_status',{upload_id:upload.upload_id});demand(verified.state==='verified','history_volume_source_not_verified');
 phase='analysis';const run=await deviceRequest('baseline_start',{request_key:randomUUID(),upload_id:upload.upload_id,local_dataset_id:m.localDatasetId,data_revision:m.dataRevision,restore_epoch:m.restoreEpoch,restore_lineage_id:m.restoreLineageId,writer_epoch:context.writer_epoch});
 const measured=await worker('full-volume');report.measurement={...measured,events:undefined};report.events=measured.events;
 const state=JSON.parse(sql(`SELECT jsonb_build_object('state',state,'error_code',error_code,'processed_objects',processed_objects,'processed_movements',processed_movements,'summary',summary) FROM public.payment_history_migration_runs WHERE shop_id=${q(shop)} AND run_id=${q(run.run_id)};`));report.canonical=state;
 demand(state.state==='review_ready'&&state.processed_objects===25955&&state.processed_movements===25947&&state.summary?.movements===25947&&state.summary?.activeGrossClp==='25947000'&&state.summary?.knownActiveNetClp==='25687530','history_volume_canonical_result_failed');
 demand(measured.elapsedMs<120000&&counters.vectorRequests===67&&counters.lostAckInjected,'history_volume_budget_or_replay_failed');
 const additiveFloorMs=counters.chargedStagingBytes/51200*1000+counters.vectorRequests*300;
 demand(measured.elapsedMs>=additiveFloorMs,'history_volume_additive_network_floor_failed');
 report.representativeness.additiveNetworkFloorMs=additiveFloorMs;
 demand(sql(`SELECT count(*) FROM public.payment_history_batches WHERE shop_id=${q(shop)};`)==='0','history_volume_published_without_apply');
 report.counters=counters;report.transport={latencyMsPerGatewayRequest:300,encodedWorkerLinkBytesPerSecond:51200,storageLink:'actual-loopback',identityComparator:'NOT_RUN_THIS_GATE',heapMiB:640,processRssLimitBytes:1073741824};
 report.representativeness.encodedWireToMovementRatio=counters.encodedStagingBytes/fixture.metadata.movementBytes;
 report.status='PASS_REAL_GATEWAY_SQL_FULL_VOLUME';save('complete.json',report);
 const sqlBytes=readFileSync(join(resolve(options['--owned-workdir']),'.replay/complete.json')),sqlEvidence=JSON.parse(sqlBytes);
 demand(sqlEvidence.status==='LOCAL_CANONICAL_BYTE_EXACT_AND_PGTAP_PASS'&&sqlEvidence.head===report.serverSha&&sqlEvidence.operatorSQLByteExactReplay===true&&sqlEvidence.pgTAPFiles===sqlEvidence.databaseTestFiles.length&&sqlEvidence.pgTAPTests>=4375&&['supabase/tests/asus019_history_qualified_configuration.sql','supabase/tests/asus019_history_migration_stage_vector.sql'].every(p=>sqlEvidence.databaseTestFiles.includes(p)),'history_volume_own_sql_evidence');
 const artifact=join(evidence,'qualified-artifact');mkdirSync(artifact,{mode:0o700});
 copyFileSync(join(evidence,'history-worker.cjs'),join(artifact,'history-worker.cjs'));copyFileSync(join(evidence,'complete.json'),join(artifact,'volume-complete.json'));writeFileSync(join(artifact,'sql-complete.json'),sqlBytes,{mode:0o600});
 const manifest={schema:'asus019-worker-volume-source-v2',serverSha:report.serverSha,sourceTree:command('git',['rev-parse','HEAD^{tree}']).trim(),lockSha256:sha(readFileSync('package-lock.json')),workerSha256:report.workerSha256,nodeVersion:process.version,sqlEvidenceSha256:sha(sqlBytes),volumeEvidenceSha256:sha(readFileSync(join(evidence,'complete.json')))};
 writeFileSync(join(artifact,'source-manifest.json'),JSON.stringify(manifest),{mode:0o600});
 process.stdout.write(JSON.stringify({status:report.status,workerSha256:report.workerSha256,evidenceSha256:sha(readFileSync(join(evidence,'complete.json'))),elapsedMs:measured.elapsedMs})+'\n');
}catch(error){report.status='FAIL';report.phase=phase;report.code=error instanceof Error&&/^history_volume_[a-z_]+$/.test(error.message)?error.message:'history_volume_failed';save('complete.json',report);process.stderr.write(JSON.stringify({status:'FAIL',phase,code:report.code})+'\n');process.exitCode=1;}
finally{if(child?.exitCode===null&&child?.signalCode===null)child.kill('SIGTERM');if(server)await new Promise(yes=>server.close(yes));}
