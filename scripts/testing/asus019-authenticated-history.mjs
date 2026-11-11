// Real loopback Next routes, PostgreSQL, private Storage, Worker and CLR clients.
// The canonical replay owns the disposable environment. No linked target,
// HTTP interception, service-role browser session or mocked receipt is accepted.
import {spawn,spawnSync} from "node:child_process";
import {createHash,randomBytes,randomUUID,scryptSync} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync,renameSync,realpathSync} from "node:fs";
import {resolve,join,isAbsolute,dirname} from "node:path";
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
const save=(file,value)=>{const path=join(evidence,file),temporary=path+".tmp";writeFileSync(temporary,JSON.stringify(value),{mode:0o600});renameSync(temporary,path);};
let phase="ownership",browser;const children=[];
const receipt={status:"FAIL",syntheticOnly:true,loopbackOnly:true,coverage:"authenticated Core/Data HTTP services and real Admin browser; WPF hardware not claimed",cases:[]};
function command(program,argv,cwd=root,env=process.env,timeout=120000){
 const result=spawnSync(program,argv,{cwd,env,encoding:"utf8",timeout,maxBuffer:8*1024*1024});
 demand(result.status===0&&!result.error,"history_test_command_failed");return result.stdout;
}
function start(name,program,argv,env){
 const output=openSync(join(evidence,name+".private.log"),"wx",0o600);
 const child=spawn(program,argv,{cwd:name==="client"?clientRoot:root,env,stdio:["ignore",output,output],detached:true});closeSync(output);
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
 const original=JSON.parse(readFileSync(join(root,"tests/fixtures/payment-history/local-export-v1/sql-payload.json"),"utf8"));
 const aliases=[...new Set(original.movements.map(m=>m.aliasKey))];demand(aliases.length>0&&aliases.length<=3&&aliases.every(a=>typeof a==="string"&&a.length<300),"history_test_checked_fixture");
 phase="synthetic_setup";
 let setup=`BEGIN;INSERT INTO public.shops(shop_id,shop_code,shop_name,shop_status) VALUES(${q(shopId)},${q(shopCode)},'Synthetic authenticated history','active');
 INSERT INTO public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
 VALUES(${q(staffId)},${q(shopId)},${q(staffCode)},'Synthetic history operator','pos_admin','active','password',${q(credentialHash)},clock_timestamp(),clock_timestamp()+interval '1 hour',false,7,'active');
 INSERT INTO public.staff_role_permissions(shop_id,role_key,permission_key,enabled) VALUES(${q(shopId)},'pos_admin','shop_admin.full_access',true) ON CONFLICT(shop_id,role_key,permission_key) DO UPDATE SET enabled=true;
 INSERT INTO public.payment_history_runtime(shop_id) VALUES(${q(shopId)});`;
 for(const [index,a] of [actorA,actorB].entries())setup+=`
 INSERT INTO public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status) VALUES(${q(a.deviceId)},${q(shopId)},'AUTH-HISTORY-${index}','Synthetic POS ${index}','pos','active');
 INSERT INTO public.pos_device_credentials(pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,expires_at) VALUES(${q(a.credentialId)},${q(shopId)},${q(a.deviceId)},${q(staffId)},${q('sha256:'+sha(a.deviceToken))},7,clock_timestamp()+interval '1 hour');
 INSERT INTO public.pos_sessions(pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,issued_at,expires_at) VALUES(${q(a.sessionId)},${q(shopId)},${q(a.deviceId)},${q(staffId)},${q(a.credentialId)},${q('sha256:'+sha(a.sessionToken))},7,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes');`;
 for(const alias of aliases){const merchant=randomUUID(),proof=randomUUID();setup+=`
 INSERT INTO public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at) VALUES(${q(proof)},${q(shopId)},'merchant_mapping','operator_attested','verified','synthetic-auth-v1','Synthetic independent mapping',jsonb_build_object('merchant_id',${q(merchant)},'alias_key',${q(alias)}),'pos_staff_manager',${q(staffId)},clock_timestamp());
 INSERT INTO public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) VALUES(${q(merchant)},${q(shopId)},'Synthetic evidenced merchant',${q(proof)});
 INSERT INTO public.payment_history_merchant_aliases(shop_id,merchant_id,alias_key,source_identity,evidence_id) VALUES(${q(shopId)},${q(merchant)},${q(alias)},'{"synthetic":true}',${q(proof)});`;}
 sql(setup+"COMMIT; NOTIFY pgrst,'reload schema';");
 const endpoint="http://127.0.0.1:3019",secret=randomBytes(32).toString("hex");
 const env={...process.env,NEXT_TELEMETRY_DISABLED:"1",NEXT_PUBLIC_SUPABASE_URL:runtime.url,NEXT_PUBLIC_SUPABASE_ANON_KEY:runtime.anonKey,SUPABASE_SERVICE_ROLE_KEY:runtime.serviceKey,PAYMENT_HISTORY_WORKER_GATEWAY_SECRET:secret};
 phase="build";
 const build=command("dotnet",["build","tests/Win7POS.Core.Tests/Win7POS.Core.Tests.csproj","-c","Release","-p:AuthenticatedHistoryHarness=true","--nologo","-v:q"],clientRoot,process.env);
 writeFileSync(join(evidence,"build.private.log"),build,{mode:0o600});
 command(process.execPath,["scripts/build-payment-history-worker.mjs",join(evidence,"history-worker.cjs")]);
 receipt.workerSha256=sha(readFileSync(join(evidence,"history-worker.cjs")));
 phase="next_start";start("next",process.execPath,[join(root,"node_modules/next/dist/bin/next"),"dev","--hostname","127.0.0.1","--port","3019"],env);
 await until(async()=>{try{return(await fetch(endpoint+"/auth/login",{signal:AbortSignal.timeout(5000)})).ok;}catch{return false;}},90000);
 // Read-only probes retain only protocol shape/status in closed evidence.
 // They neither prepare an upload nor create a writer context or receipt.
 const storageProbe=await createClient(runtime.url,runtime.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from("payment-history-sources").info(`history/${shopId}/${randomUUID()}`);
 receipt.storageMissingProbe={status:storageProbe.error?.status??null,statusCode:/^\d{3}$/.test(String(storageProbe.error?.statusCode??""))?String(storageProbe.error.statusCode):null,errorName:storageProbe.error?.name==="StorageApiError"?"StorageApiError":"other",objectNotFound:storageProbe.error?.message==="Object not found",dataPresent:storageProbe.data!==null};
 const baselineProbeResponse=await fetch(endpoint+"/api/pos/payment-history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId:actorA.deviceId,sessionId:actorA.sessionId,deviceToken:actorA.deviceToken,sessionToken:actorA.sessionToken,operation:"baseline_context",payload:{local_dataset_id:"synthetic-probe",data_revision:"0",restore_epoch:"0",restore_lineage_id:randomUUID()}}),signal:AbortSignal.timeout(15000)});
 const baselineProbe=await baselineProbeResponse.json();
 receipt.baselineContextProbe={status:baselineProbeResponse.status,code:/^history_[a-z_]+$/.test(baselineProbe.code??"")?baselineProbe.code:null,resultKeys:baselineProbe.ok===true?Object.keys(baselineProbe.result).filter(k=>/^[a-z_]{1,48}$/.test(k)):[],baselineKeys:baselineProbe.ok===true&&baselineProbe.result?.baseline?Object.keys(baselineProbe.result.baseline).filter(k=>/^[a-z_]{1,48}$/.test(k)):[]};
 start("worker",process.execPath,[join(evidence,"history-worker.cjs")],{...process.env,PAYMENT_HISTORY_WORKER_GATEWAY_SECRET:secret,PAYMENT_HISTORY_ALLOW_LOOPBACK:"yes",PAYMENT_HISTORY_WORKER_GATEWAY_URL:endpoint+"/api/internal/payment-history/worker"});
 save("context.private.json",{schema:"asus019-authenticated-history-v1",nonce,endpoint:endpoint+"/",clientSha:receipt.clientSha,shopId,staffId,credentialVersion:7,actorA,actorB,extendedCases:true});
 phase="client_baselines";const client=start("client","dotnet",[join(clientRoot,"tests/Win7POS.Core.Tests/bin/Release/net10.0/Win7POS.Core.Tests.dll"),join(evidence,"context.private.json")],process.env);
 async function state(wanted){return until(async()=>{
  if(existsSync(join(evidence,"client-state.private.json"))){const state=JSON.parse(readFileSync(join(evidence,"client-state.private.json"),"utf8"));demand(state.nonce===nonce,"history_test_state_nonce");if(state.status==="FAIL"){receipt.clientFailure={phase:/^[a-z_]+$/.test(state.phase)?state.phase:"unknown",exception:/^[A-Za-z]+Exception$/.test(state.exception)?state.exception:"Exception",codes:[state.code,state.lastCode].filter(c=>/^(history|historical)_[a-z_]+$/.test(c))};throw Error("history_test_client_rejected");}if(state.phase===wanted)return state;}
  demand(client.exitCode===null,"history_test_client_early_exit");return null;
 },150000);}
 const source=await state("source_ready");demand(/^[0-9a-f]{64}$/.test(source.sourceSha)&&source.baselineCount>0,"history_test_source_scope");
 phase="admin_open_before_apply";
 const browserExecutable=process.env.ASUS019_BROWSER_EXECUTABLE;
 demand(browserExecutable==="/opt/google/chrome/chrome"&&existsSync(browserExecutable),"history_test_browser_prerequisite");
 receipt.browserExecutableSHA256=sha(readFileSync(browserExecutable));
 browser=await chromium.launch({headless:true,executablePath:browserExecutable});receipt.browserVersion=browser.version();
 const context=await browser.newContext();const page=await context.newPage();
 page.setDefaultTimeout(45000);await page.goto(endpoint+"/auth/login?mode=shop-code&next=%2Fshop%2Fpayment-history");
 await page.locator('[name="shopCode"]').fill(shopCode);await page.locator('[name="staffCode"]').fill(staffCode);await page.locator('[name="credential"]').fill(password);
 await page.locator('form:has([name="credential"]) button[type="submit"]').click();await page.waitForURL(url=>url.pathname==="/shop/payment-history");
 const call=(operation,payload={})=>page.evaluate(async({shopId,operation,payload})=>{
  const response=await fetch("/api/shop/payment-history",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-History-Request":"1"},body:JSON.stringify({shop_id:shopId,operation,payload})});return {status:response.status,body:await response.json()};
 },{shopId,operation,payload});
 const baseline=await call("movements",{from_date:null,to_date:null,include_inactive:false,page_size:50,after:null});
 demand(baseline.status===200&&baseline.body.ok===true&&baseline.body.result.rows.length===source.baselineCount,"history_test_browser_baseline");
 receipt.cases.push({id:"authenticated-original-baselines",status:"PASS",count:source.baselineCount});
 phase="independent_source_policy";
 sql(`INSERT INTO public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id,verified_at)
 SELECT gen_random_uuid(),m.shop_id,k.kind,'operator_attested','verified','synthetic-v1','Synthetic independent import policy',jsonb_build_object('merchant_id',m.merchant_id,'file_sha256',jsonb_build_array(${q(source.sourceSha)}),'from_ticks','0','to_ticks','3155378975999999999','native_start_ticks','638712864000000000'),'pos_staff_manager',${q(staffId)},clock_timestamp()
 FROM public.payment_history_merchants m CROSS JOIN(VALUES('native_start'),('legacy_currency')) k(kind) WHERE m.shop_id=${q(shopId)};`);
 save("client-control.private.json",{nonce,phase:"allow_local_apply"});
 phase="client_roundtrip";const published=await state("published");
 demand(published.status==="PASS_CORE_DATA_ROUNDTRIP"&&published.count===source.baselineCount+source.expected.length,"history_test_client_counts");
 phase="admin_automatic_discovery";
 // No page reload, manual refresh or fabricated sync event: the actual marker
 // provider must update the already open financial reader.
 await until(async()=>{const text=await page.locator("body").innerText();return published.newIds.every(id=>text.includes(id));},65000);
 const result=await call("movements",{from_date:null,to_date:null,include_inactive:false,page_size:50,after:null});
 demand(result.status===200&&result.body.ok===true&&result.body.result.rows.length===published.count,"history_test_browser_final_count");
 const tuples=result.body.result.rows.map(r=>[r.external_namespace,r.external_id,r.business_ticks,r.gross_clp].join("|")).sort();
 const actualSha=sha(tuples.join("\n"));demand(actualSha===published.factsSha,"history_test_browser_fact_mismatch");
 demand(Number(result.body.result.totals.matched_count)===published.count,"history_test_browser_total_mismatch");
 receipt.cases.push({id:"pos-a-server-open-admin-pos-b-pos-a",status:"PASS",count:published.count,factsSha256:actualSha});
 save("client-control.private.json",{nonce,phase:"admin_observed"});
 for(const name of ["duplicate","undo"]){
  phase=name;const current=await state(name);demand(current.status==="PASS_CORE_DATA_CASE","history_test_extended_client_status");
  const count=name==="duplicate"?published.count:source.baselineCount;demand(current.count===count,"history_test_extended_count");
  if(name==="undo")await until(async()=>{const text=await page.locator("body").innerText();return published.newIds.every(id=>!text.includes(id));},65000);
  const view=await call("movements",{from_date:null,to_date:null,include_inactive:false,page_size:50,after:null});
  demand(view.status===200&&view.body.ok===true&&view.body.result.rows.length===count,"history_test_extended_browser_count");
  const tuples=view.body.result.rows.map(r=>[r.external_namespace,r.external_id,r.business_ticks,r.gross_clp].join("|")).sort();
  const factsSha256=sha(tuples.join("\n"));demand(factsSha256===current.factsSha,"history_test_extended_browser_facts");
  receipt.cases.push({id:name,status:"PASS",count,factsSha256});save("client-control.private.json",{nonce,phase:name+"_observed"});
 }
 phase="native_invariants";
 const native=sql(`SELECT (SELECT count(*) FROM public.pos_sales WHERE shop_id=${q(shopId)})+(SELECT count(*) FROM public.pos_sale_stock_movements WHERE shop_id=${q(shopId)});`);
 demand(native==="0","history_test_native_mutation");
 const clientExit=await Promise.race([client.closed,delay(10000).then(()=>null)]);demand(clientExit?.code===0,"history_test_client_exit");
 await browser.close();browser=undefined;demand(await stopChildren(),"history_test_cleanup_forced");
 receipt.status="PASS_CORE_DATA_ADMIN_ROUNDTRIP_DUPLICATE_UNDO";receipt.stage="complete";save("authenticated-history.json",receipt);
 console.log("authenticated_history_roundtrip_pass");
}catch(error){
 if(browser)try{await browser.close();}catch{}
 await stopChildren();receipt.stage=phase;receipt.code=/^history_test_[a-z_]+$/.test(error?.message??"")?error.message:"history_test_unexpected";save("authenticated-history.json",receipt);
 console.error("authenticated_history_failed:"+phase+":"+receipt.code);process.exitCode=1;
}
