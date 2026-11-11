// Real loopback Next routes, PostgreSQL, private Storage, Worker and CLR clients.
// The canonical replay owns the disposable environment. No linked target,
// HTTP interception, service-role browser session or mocked receipt is accepted.
import {spawn,spawnSync} from "node:child_process";
import {createHash,randomBytes,randomUUID,scryptSync} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync,renameSync,realpathSync,statSync} from "node:fs";
import {resolve,join,isAbsolute,dirname,basename} from "node:path";
import {fileURLToPath} from "node:url";
import {setTimeout as delay} from "node:timers/promises";
import {chromium} from "playwright";
import {createClient} from "@supabase/supabase-js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!["--owned-workdir","--client-repo","--evidence-dir"].includes(args[i])||!args[i+1]||options[args[i]])throw Error("history_test_arguments");options[args[i]]=args[i+1];}
const demand=(ok,code)=>{if(!ok)throw Error(code);};
for(const name of ["--owned-workdir","--client-repo","--evidence-dir"])demand(isAbsolute(options[name]??""),"history_test_absolute_path");
const evidence=resolve(options["--evidence-dir"]),clientRoot=realpathSync(options["--client-repo"]);
demand(process.platform==="linux"&&!existsSync(evidence),"history_test_fresh_linux_required");
process.umask(0o077);mkdirSync(evidence,{mode:0o700});
const sha=value=>createHash("sha256").update(value).digest("hex");
const rowKey=r=>[r.external_namespace,r.external_id,r.business_ticks,r.gross_clp,r.fee_clp??"null",r.fee_vat_clp??"null",r.net_clp??"null"].join("|");
const save=(file,value)=>{const path=join(evidence,file),temporary=path+".tmp";writeFileSync(temporary,JSON.stringify(value),{mode:0o600});renameSync(temporary,path);};
let phase="ownership",browser,inspectFailure;const children=[];
const receipt={status:"FAIL",syntheticOnly:true,loopbackOnly:true,coverage:"authenticated Core/Data HTTP services and real Admin browser; WPF hardware not claimed",cases:[]};
function command(program,argv,cwd=root,env=process.env,timeout=120000){
 const result=spawnSync(program,argv,{cwd,env,encoding:"utf8",timeout,maxBuffer:8*1024*1024});
 demand(result.status===0&&!result.error,"history_test_command_failed");return result.stdout;
}
function start(name,program,argv,env){
 const output=openSync(join(evidence,name+".private.log"),"wx",0o600);
 const child=spawn(program,argv,{cwd:name.startsWith("client")?clientRoot:root,env,stdio:["ignore",output,output],detached:true});closeSync(output);
 child.closed=new Promise(resolve=>child.once("close",(code,signal)=>resolve({code,signal})));
 child.once("error",()=>{});children.push({name,child});return child;
}
async function stopChildren(){
 let natural=true;
 for(const {child} of children.toReversed()){
  if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,"SIGTERM");}catch(error){if(error.code!=="ESRCH")natural=false;}}
  const result=await Promise.race([child.closed,delay(10000).then(()=>null)]);
  if(!result){natural=false;try{process.kill(-child.pid,"SIGKILL");}catch{}await child.closed;}
 }
 receipt.naturalProcessCleanup=natural;return natural;
}
async function until(read,timeout=60000){
 const end=Date.now()+timeout;
 while(Date.now()<end){const result=await read();if(result)return result;await delay(150);}
 throw Error("history_test_wait_timeout");
}
try{
 const runtime=JSON.parse(command("python3",["-B",join(root,"scripts/ci/asus019-history-local-runtime.py"),"--workdir",options["--owned-workdir"]]));
 demand(/^[0-9a-f]{64}$/.test(runtime.containerID)&&/^r4-ci-preflight-[0-9a-f]{12}$/.test(runtime.project)&&runtime.url==="http://127.0.0.1:54321","history_test_owned_runtime");
 receipt.serverSha=command("git",["rev-parse","HEAD"]).trim();receipt.clientSha=command("git",["rev-parse","HEAD"],clientRoot).trim();
 demand(/^[0-9a-f]{40}$/.test(receipt.clientSha)&&receipt.clientSha===process.env.ASUS019_CLIENT_SHA&&runtime.head===receipt.serverSha&&command("git",["status","--porcelain"]).trim()===""&&command("git",["status","--porcelain"],clientRoot).trim()==="","history_test_frozen_sources");
 const sql=text=>{
  const result=spawnSync("docker",["exec","-i",runtime.containerID,"/nix/var/nix/profiles/default/bin/psql","-X","-qAt","-v","ON_ERROR_STOP=1","-v","VERBOSITY=sqlstate","-U","postgres","-d","postgres"],{input:"SET statement_timeout='8s';SET lock_timeout='6s';\n"+text,encoding:"utf8",timeout:20000,maxBuffer:65536});
  if(result.status!==0){receipt.sqlStates=[...new Set([...(result.stderr??"").matchAll(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})(?:\s|$)/g)].map(m=>m[1]))].slice(0,8);writeFileSync(join(evidence,"sql-error.private.log"),result.stderr??"",{mode:0o600});throw Error("history_test_fixture_sql_failed");}return result.stdout.trim();
 };
 const q=value=>"'"+String(value).replaceAll("'","''")+"'";
 const shopId="10000000-0000-4000-8000-000000003019",staffId="30000000-0000-4000-8000-000000003019",shopCode="AUTHHISTORY019",staffCode="1001",password=randomBytes(24).toString("base64url"),nonce=randomUUID().replaceAll("-","");
 const salt=randomBytes(16),key=scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
 const credentialHash=["","scrypt-v1","n=16384,r=8,p=1,l=64",salt.toString("base64url"),key.toString("base64url")].join("$");
 const actor=()=>({deviceId:randomUUID(),sessionId:randomUUID(),credentialId:randomUUID(),deviceToken:"mcpos_device_"+randomBytes(32).toString("hex"),sessionToken:"mcpos_session_"+randomBytes(32).toString("hex")});
 const actorA=actor(),actorB=actor();
 const recoveryGroup=()=>{const original=actor(),fresh=()=>({...actor(),deviceId:original.deviceId,credentialId:original.credentialId,deviceToken:original.deviceToken});return {original,fresh:fresh(),later:fresh()};};
 const recoveryActors={apply_recovery:recoveryGroup(),two_recoveries:recoveryGroup()},recoveryApplyActor=recoveryActors.apply_recovery.original,recoverySessionsActor=recoveryActors.two_recoveries.original;
 const original=JSON.parse(readFileSync(join(root,"tests/fixtures/payment-history/local-export-v1/sql-payload.json"),"utf8"));
 const aliases=[...new Set(original.movements.map(m=>m.aliasKey))];demand(aliases.length>0&&aliases.length<=3&&aliases.every(a=>typeof a==="string"&&a.length<300),"history_test_checked_fixture");
 phase="synthetic_setup";
 let setup=`BEGIN;INSERT INTO public.shops(shop_id,shop_code,shop_name,shop_status) VALUES(${q(shopId)},${q(shopCode)},'Synthetic authenticated history','active');
 INSERT INTO public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
 VALUES(${q(staffId)},${q(shopId)},${q(staffCode)},'Synthetic history operator','pos_admin','active','password',${q(credentialHash)},clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
 INSERT INTO public.staff_role_permissions(shop_id,role_key,permission_key,enabled) VALUES(${q(shopId)},'pos_admin','shop_admin.full_access',true) ON CONFLICT(shop_id,role_key,permission_key) DO UPDATE SET enabled=true;
 INSERT INTO public.payment_history_runtime(shop_id) VALUES(${q(shopId)});`;
 for(const [index,a] of [actorA,actorB,recoveryApplyActor,recoverySessionsActor].entries())setup+=`
 INSERT INTO public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status) VALUES(${q(a.deviceId)},${q(shopId)},'AUTH-HISTORY-${index}','Synthetic POS ${index}','pos','active');
 INSERT INTO public.pos_device_credentials(pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,expires_at) VALUES(${q(a.credentialId)},${q(shopId)},${q(a.deviceId)},${q(staffId)},${q('sha256:'+sha(a.deviceToken))},7,clock_timestamp()+interval '1 hour');
 INSERT INTO public.pos_sessions(pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,issued_at,expires_at) VALUES(${q(a.sessionId)},${q(shopId)},${q(a.deviceId)},${q(staffId)},${q(a.credentialId)},${q('sha256:'+sha(a.sessionToken))},7,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes');`;
 for(const a of Object.values(recoveryActors).flatMap(g=>[g.fresh,g.later]))setup+=`
 INSERT INTO public.pos_sessions(pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,issued_at,expires_at) VALUES(${q(a.sessionId)},${q(shopId)},${q(a.deviceId)},${q(staffId)},${q(a.credentialId)},${q('sha256:'+sha(a.sessionToken))},7,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes');`;
 for(const alias of aliases){const merchant=randomUUID(),proof=randomUUID();setup+=`
 INSERT INTO public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at) VALUES(${q(proof)},${q(shopId)},'merchant_mapping','operator_attested','verified','synthetic-auth-v1','Synthetic independent mapping',jsonb_build_object('merchant_id',${q(merchant)},'alias_key',${q(alias)}),'pos_staff_manager',${q(staffId)},clock_timestamp());
 INSERT INTO public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) VALUES(${q(merchant)},${q(shopId)},'Synthetic evidenced merchant',${q(proof)});
 INSERT INTO public.payment_history_merchant_aliases(shop_id,merchant_id,alias_key,source_identity,evidence_id) VALUES(${q(shopId)},${q(merchant)},${q(alias)},'{"synthetic":true}',${q(proof)});`;}
 sql(setup+"COMMIT; NOTIFY pgrst,'reload schema';");
 // NextRequest canonicalizes numeric loopback hosts to localhost. Use that
 // canonical configured origin; the POS retains its exact-origin check.
 const endpoint="http://localhost:3019",secret=randomBytes(32).toString("hex");
 const canonicalOrigin=command(process.execPath,["-e","const {NextRequest}=require('next/server');process.stdout.write(new URL(new NextRequest('http://localhost:3019/api/pos/payment-history').url).origin)"]).trim();
 demand(canonicalOrigin===endpoint,"history_test_framework_origin_mismatch");receipt.canonicalAppOrigin=true;
 const env={...process.env,NEXT_TELEMETRY_DISABLED:"1",NEXT_PUBLIC_SUPABASE_URL:runtime.url,NEXT_PUBLIC_SUPABASE_ANON_KEY:runtime.anonKey,SUPABASE_SERVICE_ROLE_KEY:runtime.serviceKey,PAYMENT_HISTORY_WORKER_GATEWAY_SECRET:secret};
 phase="build";
 const build=command("dotnet",["build","tests/Win7POS.Core.Tests/Win7POS.Core.Tests.csproj","-c","Release","-p:AuthenticatedHistoryHarness=true","--nologo","-v:q"],clientRoot,process.env);
 writeFileSync(join(evidence,"build.private.log"),build,{mode:0o600});
 command(process.execPath,["scripts/build-payment-history-worker.mjs",join(evidence,"history-worker.cjs")]);
 receipt.workerSha256=sha(readFileSync(join(evidence,"history-worker.cjs")));
 phase="next_start";start("next",process.execPath,[join(root,"node_modules/next/dist/bin/next"),"dev","--hostname","localhost","--port","3019"],env);
 await until(async()=>{try{return(await fetch(endpoint+"/auth/login",{signal:AbortSignal.timeout(5000)})).ok;}catch{return false;}},90000);
 // Read-only probes retain only protocol shape/status in closed evidence.
 // They neither prepare an upload nor create a writer context or receipt.
 const storageProbe=await createClient(runtime.url,runtime.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from("payment-history-sources").info(`history/${shopId}/${randomUUID()}`);
 receipt.storageMissingProbe={status:storageProbe.error?.status??null,statusCode:/^\d{3}$/.test(String(storageProbe.error?.statusCode??""))?String(storageProbe.error.statusCode):null,errorName:storageProbe.error?.name==="StorageApiError"?"StorageApiError":"other",objectNotFound:storageProbe.error?.message==="Object not found",dataPresent:storageProbe.data!==null};
 const baselineProbeResponse=await fetch(endpoint+"/api/pos/payment-history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId:actorA.deviceId,sessionId:actorA.sessionId,deviceToken:actorA.deviceToken,sessionToken:actorA.sessionToken,operation:"baseline_context",payload:{local_dataset_id:"synthetic-probe",data_revision:"0",restore_epoch:"0",restore_lineage_id:randomUUID()}}),signal:AbortSignal.timeout(15000)});
 const baselineProbe=await baselineProbeResponse.json();
 receipt.baselineContextProbe={status:baselineProbeResponse.status,code:/^history_[a-z_]+$/.test(baselineProbe.code??"")?baselineProbe.code:null,resultKeys:baselineProbe.ok===true?Object.keys(baselineProbe.result).filter(k=>/^[a-z_]{1,48}$/.test(k)):[],baselineKeys:baselineProbe.ok===true&&baselineProbe.result?.baseline?Object.keys(baselineProbe.result.baseline).filter(k=>/^[a-z_]{1,48}$/.test(k)):[]};
 const ownedWorker=start("worker",process.execPath,[join(evidence,"history-worker.cjs")],{...process.env,PAYMENT_HISTORY_WORKER_GATEWAY_SECRET:secret,PAYMENT_HISTORY_ALLOW_LOOPBACK:"yes",PAYMENT_HISTORY_WORKER_GATEWAY_URL:endpoint+"/api/internal/payment-history/worker"});
 inspectFailure=()=>({
  runs:JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('state',state,'errorCode',CASE WHEN error_code ~ '^(history|getnet)_[a-z_]{1,90}$' THEN error_code ELSE NULL END)),'[]') FROM public.payment_history_migration_runs WHERE shop_id=${q(shopId)};`)),
  uploads:JSON.parse(sql(`SELECT coalesce(jsonb_agg(s),'[]') FROM (SELECT state,count(*)::int count FROM public.payment_history_uploads WHERE shop_id=${q(shopId)} GROUP BY state) s;`)),
  workerExit:ownedWorker.exitCode,
  workerEvents:readFileSync(join(evidence,"worker.private.log"),"utf8").split("\n").flatMap(line=>{try{const e=JSON.parse(line);return /^[a-z_]{1,64}$/.test(e.event)&&(!e.code||/^(history|getnet)_[a-z_]{1,90}$/.test(e.code))?[{event:e.event,...(e.code?{code:e.code}:{})}]:[];}catch{return[];}}).slice(-8)
 });
 const clientContext={schema:"asus019-authenticated-history-v2",nonce,endpoint:endpoint+"/",clientSha:receipt.clientSha,shopId,staffId,credentialVersion:7,actorA,actorB,recoveryActors,recoveryApplyActor,recoverySessionsActor,extendedCases:true,faultCases:true,adminOrigin:true,conflictCases:true,recoveryRaces:true};
 save("context.private.json",clientContext);
 const clientArgs=[join(clientRoot,"tests/Win7POS.Core.Tests/bin/Release/net10.0/Win7POS.Core.Tests.dll"),join(evidence,"context.private.json")];
 phase="client_baselines";let client=start("client","dotnet",clientArgs,process.env);
 async function state(wanted){return until(async()=>{
  if(existsSync(join(evidence,"client-state.private.json"))){const state=JSON.parse(readFileSync(join(evidence,"client-state.private.json"),"utf8"));demand(state.nonce===nonce,"history_test_state_nonce");if(state.status==="FAIL"){const d=state.localDiagnostics;receipt.clientFailure={phase:/^[a-z_]+$/.test(state.phase)?state.phase:"unknown",exception:/^[A-Za-z]+Exception$/.test(state.exception)?state.exception:"Exception",codes:[state.code,state.lastCode].filter(c=>/^(history|historical)_[a-z_]+$/.test(c)),...(d?{localDiagnostics:{actor:["A","B"].includes(d.actor)?d.actor:null,baselineState:/^[a-z_]{1,40}$/.test(d.baselineState)?d.baselineState:null,baselineReason:/^(history|baseline)_[a-z_]{1,90}$/.test(d.baselineReason)?d.baselineReason:null,baselineUploadPresent:d.baselineUploadPresent===true,baselineRunPresent:d.baselineRunPresent===true,baselineReviewPresent:d.baselineReviewPresent===true}}:{})};throw Error("history_test_client_rejected");}if(state.phase===wanted)return state;}
  demand(client.exitCode===null,"history_test_client_early_exit");return null;
 },150000);}
 for(const [ready,kind,suffix] of [["recovery_apply_ready","apply_recovery","apply"],["recovery_sessions_ready","two_recoveries","sessions"]]){
  phase=ready;const staged=await state(ready);demand(staged.descriptor?.nonce===nonce,"history_test_recovery_descriptor_scope");
  const descriptorFile=`baseline-lock-${suffix}.private.json`,closedFile=`baseline-recovery-${suffix}.json`;save(descriptorFile,{...staged.descriptor,kind});
  const raced=JSON.parse(command("python3",["-B",join(root,"scripts/ci/asus019-baseline-recovery-concurrency.py"),"--workdir",options["--owned-workdir"],"--context",join(evidence,"context.private.json"),"--descriptor",join(evidence,descriptorFile),"--output",join(evidence,closedFile)],root,process.env,60000));
  demand(raced.status==="PASS"&&raced.cases.length===1&&sha(readFileSync(join(evidence,closedFile)))===raced.evidenceSHA256,"history_test_recovery_race_evidence");
  receipt.cases.push(...raced.cases.map(c=>({...c,evidenceSHA256:raced.evidenceSHA256})));save("client-control.private.json",{nonce,phase:ready+"_observed"});
 }
 const retiredIds=[recoveryApplyActor.deviceId,recoverySessionsActor.deviceId],retiredSql=retiredIds.map(q).join(",");
 sql(`BEGIN;UPDATE public.pos_sessions SET status='revoked',revoked_at=clock_timestamp() WHERE shop_id=${q(shopId)} AND shop_device_id IN (${retiredSql});UPDATE public.pos_device_credentials SET status='revoked',revoked_at=clock_timestamp() WHERE shop_id=${q(shopId)} AND shop_device_id IN (${retiredSql});UPDATE public.shop_devices SET status='revoked',revoked_at=clock_timestamp() WHERE shop_id=${q(shopId)} AND shop_device_id IN (${retiredSql});COMMIT;`);
 const source=await state("source_ready");demand(/^[0-9a-f]{64}$/.test(source.sourceSha)&&source.baselineCount>0,"history_test_source_scope");
 receipt.cases.push({id:"core-original-baselines-a-server-b",status:"PASS",count:source.baselineCount,originalEconomicsVerified:true});
 phase="admin_open_before_apply";
 const browserExecutable=process.env.ASUS019_BROWSER_EXECUTABLE;
 demand(browserExecutable==="/opt/google/chrome/chrome"&&existsSync(browserExecutable),"history_test_browser_prerequisite");
 receipt.browserExecutableSHA256=sha(readFileSync(browserExecutable));
 browser=await chromium.launch({headless:true,executablePath:browserExecutable});receipt.browserVersion=browser.version();
 const context=await browser.newContext();const page=await context.newPage();
 page.setDefaultTimeout(45000);await page.goto(endpoint+"/auth/login?mode=shop-code&next=%2Fshop%2Fpayment-history");
 await page.locator('[name="shopCode"]').fill(shopCode);await page.locator('[name="staffCode"]').fill(staffCode);await page.locator('[name="credential"]').fill(password);
 await page.locator('form:has([name="credential"]) button[type="submit"]').click();await page.waitForURL(url=>url.pathname==="/shop/payment-history");
 const call=async(operation,payload={})=>{
  const result=await page.evaluate(async({shopId,operation,payload})=>{
   const response=await fetch("/api/shop/payment-history",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-History-Request":"1"},body:JSON.stringify({shop_id:shopId,operation,payload})});return {status:response.status,body:await response.json().catch(()=>null)};
  },{shopId,operation,payload});
  const keys=value=>value&&typeof value==="object"&&!Array.isArray(value)?Object.keys(value).filter(k=>/^[a-z_]{1,64}$/.test(k)).slice(0,32):[];
  receipt.lastFinancialReply={operation,status:result.status,ok:result.body?.ok===true,code:/^(history|auth)_[a-z_]{1,90}$/.test(result.body?.code)?result.body.code:null,rootKeys:keys(result.body),resultKeys:keys(result.body?.result),rowCount:Array.isArray(result.body?.result?.rows)?result.body.result.rows.length:null};
  return result;
 };
 const capabilityReply=await call("capabilities");receipt.browserCapabilities={status:capabilityReply.status,ok:capabilityReply.body?.ok===true,read:capabilityReply.body?.result?.capabilities?.read===true,runtimePresent:capabilityReply.body?.result?.runtime!=null};
 const baseline=await call("movements",{from_date:null,to_date:null,include_inactive:false,page_size:50,after:null});
 receipt.baselineExpectedCount=source.baselineCount;
 demand(baseline.status===200&&baseline.body?.ok===true&&Array.isArray(baseline.body.result?.rows)&&baseline.body.result.rows.length===source.baselineCount,"history_test_browser_baseline");
 receipt.cases.push({id:"authenticated-original-baselines",status:"PASS",count:source.baselineCount});
 phase="independent_source_policy";
 const approveSource=hash=>{
  demand(/^[0-9a-f]{64}$/.test(hash),"history_test_policy_source_hash");
  sql(`INSERT INTO public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
  SELECT gen_random_uuid(),m.shop_id,k.kind,'operator_attested','verified','synthetic-v1','Synthetic independent import policy',jsonb_build_object('merchant_id',m.merchant_id,'file_sha256',jsonb_build_array(${q(hash)}),'from_ticks','0','to_ticks','3155378975999999999','native_start_ticks','638712864000000000'),'pos_staff_manager',${q(staffId)},clock_timestamp()
  FROM public.payment_history_merchants m CROSS JOIN(VALUES('native_start'),('legacy_currency')) k(kind) WHERE m.shop_id=${q(shopId)};`);
 };
 approveSource(source.sourceSha);
 save("client-control.private.json",{nonce,phase:"allow_local_apply"});
 phase="client_roundtrip";const published=await state("published");
 demand(published.status==="PASS_CORE_DATA_ROUNDTRIP"&&published.count===source.baselineCount+source.expected.length,"history_test_client_counts");
 phase="admin_automatic_discovery";
 // No page reload, manual refresh or fabricated sync event: the actual marker
 // provider must update the already open financial reader.
 await until(async()=>{const text=await page.locator("body").innerText();return published.newIds.every(id=>text.includes(id));},65000);
 const result=await call("movements",{from_date:null,to_date:null,include_inactive:false,page_size:50,after:null});
 demand(result.status===200&&result.body.ok===true&&result.body.result.rows.length===published.count,"history_test_browser_final_count");
 const tuples=result.body.result.rows.map(rowKey).sort();
 const actualSha=sha(tuples.join("\n"));demand(actualSha===published.factsSha,"history_test_browser_fact_mismatch");
 demand(Number(result.body.result.totals.matched_count)===published.count,"history_test_browser_total_mismatch");
 receipt.cases.push({id:"pos-a-server-open-admin-pos-b-pos-a",status:"PASS",count:published.count,factsSha256:actualSha});
 save("client-control.private.json",{nonce,phase:"admin_observed"});
 for(const name of ["duplicate","undo","correction"]){
  if(name==="correction"){
   phase="correction_source_ready";const prepared=await state(phase);demand(prepared.sourceSha!==source.sourceSha,"history_test_correction_source_reused");approveSource(prepared.sourceSha);save("client-control.private.json",{nonce,phase:"allow_correction_apply"});
  }
  phase=name;const current=await state(name);demand(current.status==="PASS_CORE_DATA_CASE","history_test_extended_client_status");
  const count=name==="undo"?source.baselineCount:published.count;demand(current.count===count,"history_test_extended_count");
  if(name==="undo")await until(async()=>{const text=await page.locator("body").innerText();return published.newIds.every(id=>!text.includes(id));},65000);
  if(name==="correction")await until(async()=>{const text=await page.locator("body").innerText();return published.newIds.every(id=>text.includes(id));},65000);
  const view=await call("movements",{from_date:null,to_date:null,include_inactive:false,page_size:50,after:null});
  demand(view.status===200&&view.body.ok===true&&view.body.result.rows.length===count,"history_test_extended_browser_count");
  const tuples=view.body.result.rows.map(rowKey).sort();
  const factsSha256=sha(tuples.join("\n"));demand(factsSha256===current.factsSha,"history_test_extended_browser_facts");
  if(name==="correction"){
   const audit=await call("movements",{from_date:null,to_date:null,include_inactive:true,page_size:50,after:null});
   demand(audit.status===200&&audit.body.ok===true,"history_test_correction_audit_unavailable");
   const versions=audit.body.result.rows.filter(row=>published.newIds.includes(row.external_id));
   demand(versions.length===2&&versions.filter(row=>row.active).length===1&&versions.filter(row=>!row.active).length===1,"history_test_correction_audit_versions");
  }
  receipt.cases.push({id:name,status:"PASS",count,factsSha256});save("client-control.private.json",{nonce,phase:name+"_observed"});
 }
 phase="fault_source_ready";const faultSource=await state(phase);approveSource(faultSource.sourceSha);save("client-control.private.json",{nonce,phase:"allow_fault_apply"});
 phase="lost_ack_checkpoint";const pending=await state("restart_pending");
 demand(pending.ackDroppedAfterRealReceipt===true&&pending.pullBeforeAck===true&&pending.count===published.count+faultSource.expected.length&&/^[0-9a-f-]{36}$/.test(pending.operation),"history_test_lost_ack_checkpoint");
 const receiptCount=()=>sql(`SELECT count(*) FROM public.payment_history_receipts WHERE shop_id=${q(shopId)} AND request_key=${q(pending.operation)}::uuid;`);
 demand(receiptCount()==="1","history_test_lost_ack_canonical_receipt");
 const oldExit=await Promise.race([client.closed,delay(10000).then(()=>null)]);demand(oldExit?.code===0,"history_test_original_process_not_closed");
 // These exact-file capabilities are private, never part of the public artifact.
 // The new CLR process reopens the original owned databases and creates new
 // generations; no reconstructed database or fabricated acknowledgement.
 const restart=JSON.parse(readFileSync(join(evidence,"restart.private.json"),"utf8"));
 demand(restart.schema==="asus019-restart-v1"&&restart.nonce===nonce&&restart.operation.replaceAll("-","")===pending.operation.replaceAll("-",""),"history_test_restart_capability_scope");
 save("context.private.json",{...clientContext,restart});client=start("client-restarted","dotnet",clientArgs,process.env);
 phase="restart_recovery";const recovered=await state("restart_recovered");
 demand(recovered.status==="PASS_LOST_ACK_RESTART_PULL_BEFORE_ACK"&&recovered.count===pending.count&&recovered.operation===pending.operation&&receiptCount()==="1","history_test_restart_canonical_mismatch");
 await until(async()=>{const text=await page.locator("body").innerText();return recovered.newIds.every(id=>text.includes(id));},65000);
 const afterRestart=await call("movements",{from_date:null,to_date:null,include_inactive:false,page_size:50,after:null});
 demand(afterRestart.status===200&&afterRestart.body.ok===true&&afterRestart.body.result.rows.length===recovered.count,"history_test_restart_browser_count");
 const restartFacts=sha(afterRestart.body.result.rows.map(rowKey).sort().join("\n"));demand(restartFacts===recovered.factsSha,"history_test_restart_browser_facts");
 receipt.cases.push({id:"lost-ack-real-process-restart-pull-before-ack",status:"PASS",count:recovered.count,factsSha256:restartFacts,canonicalReceipts:1});
 save("client-control.private.json",{nonce,phase:"restart_observed"});
 phase="conflict_source_ready";const conflictSource=await state(phase);approveSource(conflictSource.sourceSha);save("client-control.private.json",{nonce,phase:"allow_conflict_prepare"});
 const conflict=await state("conflict");demand(conflict.status==="PASS_CONFLICT_DENIED_ABORT_RECONCILED"&&conflict.count===recovered.count&&conflict.factsSha===recovered.factsSha,"history_test_conflict_client_mismatch");
 const conflictEvidence=JSON.parse(sql(`SELECT jsonb_build_object('grants',(SELECT count(*) FROM public.payment_history_local_publications WHERE shop_id=${q(shopId)} AND operation_id=${q(conflict.operation)}::uuid AND grant_id IS NOT NULL),'receipts',(SELECT count(*) FROM public.payment_history_receipts WHERE shop_id=${q(shopId)} AND request_key=${q(conflict.operation)}::uuid),'writer',(SELECT writer_authority FROM public.payment_history_runtime WHERE shop_id=${q(shopId)}));`));
 demand(conflictEvidence.grants===0&&conflictEvidence.receipts===0&&conflictEvidence.writer==="local","history_test_conflict_server_mutation");
 const afterConflict=await call("movements",{from_date:null,to_date:null,include_inactive:false,page_size:50,after:null});
 demand(afterConflict.status===200&&afterConflict.body.ok===true&&afterConflict.body.result.rows.length===recovered.count&&sha(afterConflict.body.result.rows.map(rowKey).sort().join("\n"))===recovered.factsSha,"history_test_conflict_browser_mutation");
 receipt.cases.push({id:"peer-economic-conflict-denied-with-negative-outcome-reconciled",status:"PASS",count:conflict.count,factsSha256:conflict.factsSha,grants:0,canonicalReceipts:0});save("client-control.private.json",{nonce,phase:"conflict_observed"});
 const checked=async(operation,payload={})=>{const r=await call(operation,payload);demand(r.status===200&&r.body.ok===true,"history_test_financial_api_rejected");return r.body.result;};
 const transfer=async(lane,operation,payload={})=>{
  const r=await page.evaluate(async(body)=>{const response=await fetch("/api/shop/payment-history/transfer",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-History-Request":"1"},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};},{shop_id:shopId,lane,operation,payload});
  demand(r.status===200&&r.body.ok===true,"history_test_transfer_api_rejected");return r.body.result;
 };
 const ownedBytes=(path,hash)=>{
  demand(isAbsolute(path)&&realpathSync(path)===path&&[restart.a.root,restart.b.root].some(root=>path===join(realpathSync(root),"output",basename(path)))&&/^(?:new-[0-9a-f]{32}\.xlsx|freeze-[0-9a-f]{32}\.w7history\.zip)$/.test(basename(path)),"history_test_owned_export_path");
  const size=statSync(path).size;demand(size>0&&size<=20971520,"history_test_owned_export_capacity");const bytes=readFileSync(path);demand(sha(bytes)===hash,"history_test_owned_export_hash");return bytes;
 };
 const upload=async(api,path,hash)=>{
  const bytes=ownedBytes(path,hash),fileName=basename(path),created=await api("upload_create",{file_name:fileName,byte_length:String(bytes.length),sha256:hash});
  const ok=await page.evaluate(async({signedUrl,bytes,fileName})=>{const form=new FormData();form.append("cacheControl","3600");form.append("",new File([new Uint8Array(bytes)],fileName));const r=await fetch(signedUrl,{method:"PUT",headers:{"x-upsert":"false"},body:form});return r.ok;},{signedUrl:created.signed_url,bytes:[...bytes],fileName});demand(ok,"history_test_browser_upload_failed");
  await api("upload_ready",{upload_id:created.upload_id});await until(async()=>{const s=await api("upload_status",{upload_id:created.upload_id});demand(!["rejected","expired"].includes(s.state),"history_test_source_rejected");return s.state==="verified";});return created.upload_id;
 };
 phase="admin_inventory";const webSource=await state("web_source_ready");
 const devices=await transfer("cutover","devices");demand(devices.devices.length===4&&devices.devices.every(d=>retiredIds.includes(d.device_id)?d.revoked===true:[actorA.deviceId,actorB.deviceId].includes(d.device_id)&&!d.revoked),"history_test_cutover_device_scope");
 for(const actor of [actorA,actorB])await transfer("cutover","inventory",{device_id:actor.deviceId,hardware_reference_sha256:sha("Synthetic asset "+actor.deviceId),disposition:"active",protocol_version:1,client_build_sha:receipt.clientSha,reference:"Synthetic owned protocol1 device"});
 for(const deviceId of retiredIds)await transfer("cutover","inventory",{device_id:deviceId,hardware_reference_sha256:sha("Synthetic recovery asset "+deviceId),disposition:"retired_verified",protocol_version:0,client_build_sha:null,reference:"Owned empty recovery fixture completed; device credential and sessions revoked"});
 const local=await transfer("cutover","status");demand(local.writer_authority==="local","history_test_initial_writer_mode");
 await transfer("cutover","freeze",{writer_epoch:local.writer_epoch,complete_inventory:true,reference:"Complete inventory of both owned synthetic devices"});save("client-control.private.json",{nonce,phase:"admin_frozen"});
 phase="frozen_source_reconciliation";const frozen=await state("freeze_acknowledged"),metadata=await checked("metadata");demand(frozen.exports.length===2,"history_test_frozen_export_count");
 for(const exported of frozen.exports){
  const api=(op,payload)=>transfer("migration",op,payload),uploadId=await upload(api,exported.path,exported.sha256);
  const started=await api("start",{request_key:randomUUID(),upload_id:uploadId});
  const job=await until(async()=>{const s=await api("status",{run_id:started.run_id});demand(!["failed","cancelled"].includes(s.state),"history_test_migration_analysis_failed");return s.state==="review_ready"?s:null;});
  for(const scope of job.scopes){
   const merchantIds=[...new Set(exported.bindings.filter(b=>b.scope===scope.id).map(b=>metadata.aliases.find(a=>a.alias_key===b.alias)?.merchant_id))];demand(merchantIds.length===1&&merchantIds[0],"history_test_frozen_mapping_missing");
   await api("mapping",{run_id:started.run_id,local_scope_id:scope.id,merchant_id:merchantIds[0],label:"Synthetic canonical merchant",reference:"Independent existing alias mapping for this exact owned export"});
  }
  const review=await api("review",{run_id:started.run_id});demand(review.can_apply===true,"history_test_frozen_review_blocked");
  const applied=await api("apply",{run_id:started.run_id,review_digest:review.review_digest,request_key:randomUUID()});demand(applied.new_active===0&&applied.new_inactive===0,"history_test_frozen_reconciliation_created_economics");
 }
 save("client-control.private.json",{nonce,phase:"frozen_sources_reconciled"});await state("frozen_replicas_current");
 phase="activate_web_writer";const ready=await transfer("cutover","status");demand(ready.gates?.can_activate===true,"history_test_web_writer_not_ready");
 const active=await transfer("cutover","activate_web",{writer_epoch:ready.writer_epoch,inventory_digest:ready.inventory_digest});demand(active.writer_authority==="web","history_test_web_writer_not_active");
 phase="admin_origin_import";const webUpload=await upload(checked,webSource.sourcePath,webSource.sourceSha);
 const webJob=await checked("start",{request_key:randomUUID(),upload_ids:[webUpload],configuration:{legacyAmountsAreClp:true,modernTimeInterpretation:"Unresolved",temporalPolicyVersion:"getnet-web-unresolved-v1",temporalEvidenceReference:""}});
 const webAnalysis=await until(async()=>{const s=await checked("status",{job_id:webJob.job_id});demand(!["failed","cancelled"].includes(s.state),"history_test_web_analysis_failed");return s.state==="review_ready"?s:null;});
 const proofs=new Set(metadata.evidence.map(e=>e.evidence_id));
 for(const candidate of webAnalysis.merchants){
  const merchantId=metadata.aliases.find(a=>a.alias_key===candidate.alias_key)?.merchant_id;demand(merchantId,"history_test_web_mapping_missing");
  const proof=await checked("evidence",{kind:"merchant_mapping",level:"operator_attested",version:"synthetic-web-mapping-v1",reference:"Independent existing alias mapping for this exact synthetic source",scope:{merchant_id:merchantId,alias_key:candidate.alias_key,file_sha256:[webSource.sourceSha],from_ticks:"0",to_ticks:"3155378975999999999"}});
  await checked("merchant",{merchant_id:merchantId,label:"Synthetic canonical merchant",evidence_id:proof.evidence_id,source_identity:candidate.source_identity});proofs.add(proof.evidence_id);
 }
 for(const merchant of metadata.merchants)for(const kind of ["legacy_currency","native_start"]){
  const proof=await checked("evidence",{kind,level:"operator_attested",version:"synthetic-web-v1",reference:"Independent policy for this owned synthetic source",scope:{merchant_id:merchant.merchant_id,file_sha256:[webSource.sourceSha],from_ticks:"0",to_ticks:"3155378975999999999",...(kind==="native_start"?{native_start_ticks:"638712864000000000"}:{})}});proofs.add(proof.evidence_id);
 }
 await checked("configure",{job_id:webJob.job_id,evidence_ids:[...proofs]});const webReview=await checked("review",{job_id:webJob.job_id});demand(webReview.can_commit===true&&webReview.summary.new_count===webSource.expected.length,"history_test_web_review_blocked");
 const webReceipt=await checked("commit",{job_id:webJob.job_id,request_key:randomUUID(),review_digest:webReview.review_digest});demand(webReceipt.kind==="apply","history_test_web_commit_missing");
 save("client-control.private.json",{nonce,phase:"admin_import_committed"});const fromAdmin=await state("admin_origin");
 demand(fromAdmin.status==="PASS_CORE_DATA_CASE"&&fromAdmin.count===recovered.count+webSource.expected.length,"history_test_web_replica_count");
 await until(async()=>{const text=await page.locator("body").innerText();return webSource.expected.every(row=>text.includes(row.Id));},65000);
 const webFacts=await checked("movements",{from_date:null,to_date:null,include_inactive:false,page_size:50,after:null}),webSha=sha(webFacts.rows.map(rowKey).sort().join("\n"));demand(webFacts.rows.length===fromAdmin.count&&webSha===fromAdmin.factsSha,"history_test_web_browser_facts");
 receipt.cases.push({id:"admin-web-writer-server-pos-a-pos-b-no-echo",status:"PASS",count:fromAdmin.count,factsSha256:webSha});save("client-control.private.json",{nonce,phase:"admin_origin_observed"});
 phase="session_revocation";await state("revocation_ready");
 const revoked=sql(`UPDATE public.pos_sessions SET status='revoked',revoked_at=clock_timestamp() WHERE shop_id=${q(shopId)} AND shop_device_id=${q(actorB.deviceId)} AND pos_session_id=${q(actorB.sessionId)} AND status='active' RETURNING 1;`);demand(revoked==="1","history_test_revocation_scope");
 save("client-control.private.json",{nonce,phase:"session_revoked"});const denial=await state("revocation");demand(denial.status==="PASS_SESSION_REVOCATION"&&denial.otherActorActive===true,"history_test_revocation_failed");receipt.cases.push({id:"real-session-revocation-stops-only-own-generation",status:"PASS"});save("client-control.private.json",{nonce,phase:"revocation_observed"});
 phase="native_invariants";
 const native=sql(`SELECT (SELECT count(*) FROM public.pos_sales WHERE shop_id=${q(shopId)})+(SELECT count(*) FROM public.pos_sale_stock_movements WHERE shop_id=${q(shopId)});`);
 demand(native==="0","history_test_native_mutation");
 const clientExit=await Promise.race([client.closed,delay(10000).then(()=>null)]);demand(clientExit?.code===0,"history_test_client_exit");
 await browser.close();browser=undefined;demand(await stopChildren(),"history_test_cleanup_forced");
 receipt.status="PASS_CORE_DATA_BILATERAL_ADMIN_ORIGIN_RESTART_REVOCATION_CONFLICT_RECOVERY_LOCKS";receipt.stage="complete";save("authenticated-history.json",receipt);
 console.log("authenticated_history_roundtrip_pass");
}catch(error){
 if(inspectFailure)try{receipt.protocolState=inspectFailure();}catch{receipt.protocolStateProbe="unavailable";}
 if(browser)try{await browser.close();}catch{}
 await stopChildren();receipt.stage=phase;receipt.code=/^history_test_[a-z_]+$/.test(error?.message??"")?error.message:"history_test_unexpected";save("authenticated-history.json",receipt);
 console.error("authenticated_history_failed:"+phase+":"+receipt.code);process.exitCode=1;
}
