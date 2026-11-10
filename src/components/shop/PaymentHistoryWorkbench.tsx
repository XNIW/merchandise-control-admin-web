"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {PaymentHistoryCopy} from "@/i18n/payment-history";
import type {SupportedLocale} from "@/i18n/locales";
import {commercialDateTimeTicks} from "@/lib/payment-history/time-rules";
import {HistoryTransferPanel} from "./HistoryTransferPanel";
import {historyTransferCopy} from "@/i18n/history-transfer";
import {HistoryCutoverPanel} from "./HistoryCutoverPanel";
import {historyCutoverCopy} from "@/i18n/history-cutover";
import {HistoryMovementReader} from "./HistoryMovementReader";

type Data=Record<string,unknown>;
type Source={upload_id:string;sha256:string;file_name:string;byte_length:string};
type Candidate={alias_key:string;source_identity:Record<string,string|boolean>};
type Evidence={evidence_id:string;kind:string;verification_level:string;policy_version:string;reference:string;scope:Data};
type Metadata={merchants:{merchant_id:string;label:string;evidence_id:string}[];aliases:{alias_key:string;merchant_id:string;evidence_id:string}[];evidence:Evidence[]};
type Choice={merchantId:string;label:string;reference:string};
const button="rounded-lg border border-current/30 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4";
const field="mt-1 block min-w-0 w-full rounded-lg border border-current/30 bg-transparent p-2 text-sm";
const record=(value:unknown):Data=>value&&typeof value==="object"&&!Array.isArray(value)?value as Data:{};
const list=(value:unknown):Data[]=>Array.isArray(value)?value as Data[]:[];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function PaymentHistoryWorkbench({shopId,copy,locale,initialCapabilities}:{shopId:string;copy:PaymentHistoryCopy;locale:SupportedLocale;initialCapabilities:Data}){
 const [files,setFiles]=useState<File[]>([]),[sources,setSources]=useState<Source[]>([]),[jobId,setJobId]=useState<string|null>(null),[job,setJob]=useState<Data|null>(null);
 const [metadata,setMetadata]=useState<Metadata>({merchants:[],aliases:[],evidence:[]}),[choices,setChoices]=useState<Record<string,Choice>>({});
 const [nativeTime,setNativeTime]=useState(""),[nativeRef,setNativeRef]=useState(""),[currencyRef,setCurrencyRef]=useState(""),[policyId,setPolicyId]=useState("");
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [review,setReview]=useState<Data|null>(null),[receipt,setReceipt]=useState<Data|null>(null),[ledger,setLedger]=useState<Data|null>(null),[canRecover,setCanRecover]=useState(false);
 const [capsOverride,setCapsOverride]=useState<{source:Data;value:Data}|null>(null),[discovery,setDiscovery]=useState("");
 const caps=capsOverride?.source===initialCapabilities?capsOverride.value:initialCapabilities;
 const setCaps=useCallback((value:Data)=>setCapsOverride({source:initialCapabilities,value}),[initialCapabilities]);
 const operationKey=useRef<string|null>(null),analysisKey=useRef<string|null>(null),requestLock=useRef(false),mounted=useRef(true),heading=useRef<HTMLHeadingElement>(null),requests=useRef<AbortController|null>(null);
 const permissions=record(caps.capabilities),canImport=permissions.import===true;
 const money=(value:unknown)=>typeof value==="string"?new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(BigInt(value)):copy.unknown;
 const save=useCallback((nextJob:string|null,nextSources:Source[],key:string|null)=>{
  // Opaque, non-authorizing identifiers only. Financial data and credentials stay
  // on the server; a copied link still requires the original actor's fresh lease.
  const url=new URL(window.location.href);
  for(const [name,value] of [["history_job",nextJob],["history_uploads",nextSources.map(s=>s.upload_id).join(",")],["history_apply",key],["history_analysis",analysisKey.current]]){
   if(value)url.searchParams.set(name!,value);else url.searchParams.delete(name!);
  }
  window.history.replaceState(window.history.state,"",url);
 },[]);
 const call=useCallback(async(operation:string,payload:Data={},signal?:AbortSignal)=>{
  const response=await fetch("/api/shop/payment-history",{method:"POST",signal:signal??requests.current?.signal,credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json","X-History-Request":"1"},body:JSON.stringify({shop_id:shopId,operation,payload})});
  const body=await response.json();if(!response.ok||body.ok!==true)throw Error(typeof body.code==="string"?body.code:"history_unavailable");return record(body.result);
 },[shopId]);
 const run=async(action:()=>Promise<void>)=>{
  if(requestLock.current)return;requestLock.current=true;setBusy(true);setError("");setMessage("");
  try{await action();}catch(e){if(mounted.current){const code=e instanceof Error?e.message:"";setError(code==="history_access_denied"?copy.denied:code==="history_capacity"?copy.capacity:code==="history_review_changed"?copy.changed:copy.error);}}
  finally{requestLock.current=false;if(mounted.current)setBusy(false);}
 };
 const loadLedger=useCallback(async()=>{const result=await call("read");if(mounted.current)setLedger(result);},[call]);
 useEffect(()=>{
  let stopped=false,lastMarker="";let controller:AbortController|null=null;
  const deny=()=>{setCaps({capabilities:{read:false,import:false,cancel:false,export:false,migrate:false},runtime:null});setLedger(null);setReview(null);setReceipt(null);};
  const update=(event:Event)=>{
   const detail=record((event as CustomEvent).detail);
   if(detail.shopId!==shopId||detail.paymentHistoryStatus==="unavailable")return;
   const marker=String(detail.paymentHistoryMarker??"");
   if(detail.paymentHistoryStatus==="ready"&&!/^[0-9a-f]{64}$/.test(marker)||marker===lastMarker&&detail.paymentHistoryStatus!=="denied")return;
   controller?.abort();controller=new AbortController();const owned=controller;lastMarker=marker;
   if(detail.paymentHistoryStatus==="denied"){deny();setDiscovery("denied");return;}
   if(detail.paymentHistoryStatus!=="ready")return;
   void call("capabilities",{},owned.signal).then(async fresh=>{
    if(stopped||owned.signal.aborted)return;setCaps(fresh);setDiscovery(marker);
    if(record(fresh.capabilities).read!==true){deny();return;}
    const batches=await call("read",{},owned.signal);
    if(!stopped&&!owned.signal.aborted)setLedger(batches);
   }).catch(error=>{if(!stopped&&!owned.signal.aborted&&error instanceof Error&&error.message==="history_access_denied")deny();});
  };
  window.addEventListener("shop:sync-event-marker",update);
  return()=>{stopped=true;controller?.abort();window.removeEventListener("shop:sync-event-marker",update);};
 },[call,setCaps,shopId]);
 const loadJob=useCallback(async(id:string)=>{
  const result=await call("status",{job_id:id});if(!mounted.current)return;
  setJob(result);
  if(result.state==="review_ready")setStep(1);
  if(result.state==="failed")setError(copy.error);
  if(result.state==="committed"&&operationKey.current){const found=await call("receipt",{request_key:operationKey.current});if(mounted.current&&found.receipt){setReceipt(record(found.receipt));setStep(2);}}
 },[call,copy.error]);
 useEffect(()=>{mounted.current=true;requests.current=new AbortController();let stopped=false;
  // Restore after the current server scope is known; identifiers alone grant no access.
  void Promise.all([call("metadata"),loadLedger()]).then(async([data])=>{
   if(stopped)return;setMetadata(data as unknown as Metadata);
   try{
    const params=new URL(window.location.href).searchParams,ids=(params.get("history_uploads")??"").split(",").filter(Boolean),savedJob=params.get("history_job"),savedApply=params.get("history_apply"),savedAnalysis=params.get("history_analysis");
    if(ids.length>10||ids.some(value=>!uuid.test(value)))throw Error("history_input_invalid");
    if(savedApply&&uuid.test(savedApply)){operationKey.current=savedApply;setCanRecover(true);}
    if(savedAnalysis&&uuid.test(savedAnalysis))analysisKey.current=savedAnalysis;
    if(ids.length){const uploaded=await Promise.all(ids.map(upload_id=>call("upload_status",{upload_id})));if(stopped)return;setSources(uploaded.map(u=>({upload_id:String(u.upload_id),file_name:String(u.file_name),sha256:String(u.sha256),byte_length:String(u.byte_length)})));}
    if(savedApply&&uuid.test(savedApply)){const found=await call("receipt",{request_key:savedApply});if(stopped)return;if(found.receipt){setReceipt(record(found.receipt));setStep(2);return;}}
    if(savedJob&&uuid.test(savedJob)){setJobId(savedJob);await loadJob(savedJob);}
   }catch{if(!stopped)setError(copy.denied);}
  }).catch(()=>{if(!stopped)setError(copy.unavailable);});
  return()=>{stopped=true;mounted.current=false;requests.current?.abort();};
 },[call,loadLedger,loadJob,copy.denied,copy.unavailable]);
 useEffect(()=>{heading.current?.focus();},[step]);
 useEffect(()=>{
  if(!jobId||!["queued","analysing"].includes(String(job?.state)))return;
  // Read-only polling. No import commit or retry is performed by an effect.
  let stopped=false;const timer=setTimeout(()=>{if(!stopped)void loadJob(jobId).catch(()=>{if(!stopped)setError(copy.error);});},2000);
  return()=>{stopped=true;clearTimeout(timer);};
 },[jobId,job?.state,job?.processed_rows,loadJob,copy.error,job]);
 const candidates=list(job?.merchants) as unknown as Candidate[];
 const providers=metadata.evidence.filter(e=>e.kind==="modern_time"&&e.verification_level==="provider_verified");
 const selectedPolicy=providers.find(e=>e.evidence_id===policyId);
 const summary=record(job?.summary),counts=record(review?.summary??receipt?.summary);
 const active=()=>{if(!mounted.current)throw Error("history_page_closed");};
 async function uploadFiles(){
  if(!files.length||files.length>10||files.some(f=>f.size<1||f.size>20*1024*1024||!f.name.toLowerCase().endsWith(".xlsx"))||files.reduce((s,f)=>s+f.size,0)>100*1024*1024)throw Error("history_capacity");
  const created:Source[]=[];setReceipt(null);setReview(null);setJob(null);setJobId(null);operationKey.current=null;analysisKey.current=null;setCanRecover(false);
  for(const file of files){
   active();const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
   const signed=await call("upload_create",{file_name:file.name,byte_length:String(file.size),sha256:hash});
   const form=new FormData();form.append("cacheControl","3600");form.append("",file);
   const response=await fetch(String(signed.signed_url),{method:"PUT",signal:requests.current?.signal,headers:{"x-upsert":"false"},body:form});if(!response.ok)throw Error("history_upload_failed");
   await call("upload_ready",{upload_id:signed.upload_id});created.push({upload_id:String(signed.upload_id),sha256:hash,file_name:file.name,byte_length:String(file.size)});setSources([...created]);save(null,created,null);
  }
  await continueSources(created);
 }
 async function continueSources(selected=sources){
  active();if(!selected.length)return;
  setMessage(copy.filesPending);
  for(const source of selected){const status=await call("upload_status",{upload_id:source.upload_id});if(status.state!=="verified"){setMessage(copy.waitWorker);return;}}
  const config={legacyAmountsAreClp:true,modernTimeInterpretation:selectedPolicy?.scope.interpretation??"Unresolved",temporalPolicyVersion:selectedPolicy?.policy_version??"getnet-web-unresolved-v1",temporalEvidenceReference:selectedPolicy?.reference??""};
  analysisKey.current??=crypto.randomUUID();save(null,selected,null);
  const result=await call("start",{request_key:analysisKey.current,upload_ids:selected.map(s=>s.upload_id),configuration:config});
  const id=String(result.job_id);setJobId(id);setJob(result);save(id,selected,null);setMessage(copy.analysisPending);await loadJob(id);
 }
 const getChoice=(candidate:Candidate):Choice=>choices[candidate.alias_key]??{merchantId:metadata.aliases.find(a=>a.alias_key===candidate.alias_key)?.merchant_id??"",label:String(candidate.source_identity.local||candidate.source_identity.seller||""),reference:""};
 const editChoice=(candidate:Candidate,change:Partial<Choice>)=>setChoices(previous=>({...previous,[candidate.alias_key]:{...getChoice(candidate),...change}}));
 async function prepare(){
  if(!jobId||job?.state!=="review_ready"||summary.needsTimeDecision===true)throw Error("history_review_changed");
  if(metadata.evidence.length>200||metadata.merchants.length>200||metadata.aliases.length>200||candidates.length>200)throw Error("history_capacity");
  const ids=new Set(metadata.evidence.map(e=>e.evidence_id)),groups=new Set<string>();
  for(const candidate of candidates){
   const choice=getChoice(candidate),existing=metadata.aliases.find(a=>a.alias_key===candidate.alias_key);
   const merchantId=choice.merchantId||crypto.randomUUID();groups.add(merchantId);
   if(!existing||existing.merchant_id!==merchantId||choice.reference.trim()){
    if(!choice.reference.trim()||!choice.label.trim())throw Error("history_mapping_required");
    const proof=await call("evidence",{kind:"merchant_mapping",level:"operator_attested",version:"operator-mapping-v1",reference:choice.reference,scope:{merchant_id:merchantId,alias_key:candidate.alias_key,file_sha256:sources.map(s=>s.sha256),from_ticks:"0",to_ticks:"3155378975999999999"}});
    await call("merchant",{merchant_id:merchantId,label:choice.label,evidence_id:proof.evidence_id,source_identity:candidate.source_identity});ids.add(String(proof.evidence_id));editChoice(candidate,{merchantId});
   }
  }
  for(const merchantId of groups){
   if(currencyRef.trim()){const proof=await call("evidence",{kind:"legacy_currency",level:"operator_attested",version:"operator-clp-v1",reference:currencyRef,scope:{merchant_id:merchantId,file_sha256:sources.map(s=>s.sha256),from_ticks:"0",to_ticks:"3155378975999999999"}});ids.add(String(proof.evidence_id));}
   if(nativeRef.trim()&&nativeTime){const proof=await call("evidence",{kind:"native_start",level:"operator_attested",version:"operator-first-use-v1",reference:nativeRef,scope:{merchant_id:merchantId,file_sha256:sources.map(s=>s.sha256),from_ticks:"0",to_ticks:"3155378975999999999",native_start_ticks:commercialDateTimeTicks(nativeTime.length===16?nativeTime+":00":nativeTime)}});ids.add(String(proof.evidence_id));}
  }
  if(ids.size>200)throw Error("history_capacity");
  await call("configure",{job_id:jobId,evidence_ids:[...ids]});
  const result=await call("review",{job_id:jobId});setReview(result);setStep(2);setMessage(copy.proofSaved);
  const updated=await call("metadata");setMetadata(updated as unknown as Metadata);
 }
 async function confirm(){
  if(!jobId||review?.can_commit!==true)return;
  operationKey.current??=crypto.randomUUID();setCanRecover(true);save(jobId,sources,operationKey.current);
  try{const result=await call("commit",{job_id:jobId,request_key:operationKey.current,review_digest:review.review_digest});setReceipt(result);setMessage(copy.done);await loadLedger();}
  catch(error){const recovered=await call("receipt",{request_key:operationKey.current});if(recovered.receipt){setReceipt(record(recovered.receipt));setMessage(copy.done);await loadLedger();}else throw error;}
 }
 const reasonText=(reason:unknown)=>({history_merchant_unverified:copy.merchantMissing,history_provider_time_unverified:copy.providerUnverified,history_native_start_unverified:copy.firstUseHelp,history_native_overlap:copy.nativeOverlap,history_currency_unverified:copy.currencyMissing,history_active_economics_conflict:copy.conflict,history_inactive_correction_unapproved:copy.manualCorrection}[String(reason)]??copy.blocked);
 const batches=list(ledger?.batches);
 return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
  <header><h1 className="text-2xl font-semibold">{copy.title}</h1><p className="mt-2 text-sm opacity-80">{copy.description}</p></header>
  {permissions.migrate===true?<HistoryTransferPanel key={shopId} shopId={shopId} copy={historyTransferCopy(locale)}/>:null}
  {permissions.migrate===true?<HistoryCutoverPanel key={shopId} shopId={shopId} copy={historyCutoverCopy(locale)}/>:null}
  <div role="status" aria-live="polite" className="min-h-6 text-sm">{busy?copy.working:message}</div>
  {error?<p role="alert" className="rounded-lg border border-red-400 p-3">{error}</p>:null}
  {canImport?<section aria-busy={busy} className="space-y-5 rounded-xl border border-current/20 p-4 sm:p-6">
   <ol className="flex flex-wrap gap-3 text-sm">{copy.steps.map((label,i)=><li key={label} aria-current={i===step?"step":undefined} className={i===step?"font-semibold underline underline-offset-4":"opacity-60"}>{i+1}. {label}</li>)}</ol>
   <h2 ref={heading} tabIndex={-1} className="text-xl font-medium outline-none">{copy.steps[step]}</h2>
   {step===0?<div className="space-y-4">
    <label className="block">{copy.files}<input type="file" accept=".xlsx" multiple disabled={busy||!!jobId} className={field} onChange={e=>{setFiles(Array.from(e.target.files??[]));setSources([]);setJobId(null);setJob(null);setReceipt(null);setReview(null);operationKey.current=null;analysisKey.current=null;setCanRecover(false);save(null,[],null);}} /></label>
    <p className="text-sm opacity-80">{copy.limits}</p>
    <button className={button} disabled={busy||files.length===0||sources.length>0} onClick={()=>void run(uploadFiles)}>{copy.analyze}</button>
    {sources.length>0&&!jobId?<button className={button} disabled={busy} onClick={()=>void run(()=>continueSources())}>{copy.resume}</button>:null}
    {jobId?<div className="space-y-3"><p>{job?.state==="analysing"?copy.analysisRunning:copy.analysisPending}</p><progress className="w-full" aria-label={copy.analysisRunning} {...(Number(job?.processed_rows)>0?{max:100000,value:Number(job?.processed_rows)}:{})}/><button className={button} disabled={busy} onClick={()=>void run(()=>loadJob(jobId))}>{copy.refresh}</button><button className={button} disabled={busy} onClick={()=>void run(async()=>{await call("resume_job",{job_id:jobId});setReview(null);await loadJob(jobId);})}>{copy.resume}</button><button className={button} disabled={busy} onClick={()=>void run(async()=>{await call("cancel_job",{job_id:jobId});setJobId(null);setJob(null);analysisKey.current=null;save(null,sources,null);setMessage(copy.closed);})}>{copy.cancel}</button></div>:null}
   </div>:null}
   {step===1?<div className="space-y-5">
    <p className="text-sm">{copy.reuse}</p>
    {summary.needsTimeDecision===true?<div className="space-y-3 rounded-lg border border-amber-500 p-3"><h3 className="font-medium">{copy.timeCandidates}</h3><p>{copy.iso}: {String(record(summary.candidates).isoFrom??copy.unknown)} → {String(record(summary.candidates).isoTo??copy.unknown)}</p><p>{copy.exported}: {String(record(summary.candidates).localFrom??copy.unknown)} → {String(record(summary.candidates).localTo??copy.unknown)}</p><p>{copy.providerHelp}</p><label className="block">{copy.provider}<select className={field} value={policyId} onChange={e=>setPolicyId(e.target.value)}><option value="">{copy.previewOnly}</option>{providers.map(e=><option key={e.evidence_id} value={e.evidence_id}>{e.reference}</option>)}</select></label>{providers.length===0?<p>{copy.providerMissing}</p>:null}<button className={button} disabled={busy||!selectedPolicy} onClick={()=>void run(async()=>{analysisKey.current=null;setStep(0);await continueSources();})}>{copy.reanalyse}</button></div>:null}
    <p className="text-sm opacity-80">{copy.mappingHelp}</p>
    {candidates.map(candidate=>{const choice=getChoice(candidate);return <fieldset key={candidate.alias_key} className="space-y-3 rounded-lg border border-current/20 p-3"><legend className="px-1 text-sm">{String(candidate.source_identity.local||candidate.source_identity.seller||copy.merchant)}</legend><label className="block">{copy.merchant}<select className={field} value={choice.merchantId} onChange={e=>editChoice(candidate,{merchantId:e.target.value})}><option value="">{copy.newMerchant}</option>{metadata.merchants.map(m=><option key={m.merchant_id} value={m.merchant_id}>{m.label}</option>)}</select></label>{!choice.merchantId?<label className="block">{copy.merchantName}<input className={field} maxLength={256} value={choice.label} onChange={e=>editChoice(candidate,{label:e.target.value})}/></label>:null}<label className="block">{copy.mappingReference}<input className={field} maxLength={2048} value={choice.reference} onChange={e=>editChoice(candidate,{reference:e.target.value})}/></label></fieldset>;})}
    <label className="block">{copy.currencyReference}<input className={field} maxLength={2048} value={currencyRef} onChange={e=>setCurrencyRef(e.target.value)}/></label>
    <div className="grid gap-4 sm:grid-cols-2"><label>{copy.firstUse}<input type="datetime-local" className={field} value={nativeTime} onChange={e=>setNativeTime(e.target.value)} aria-describedby="history-native-help"/></label><label>{copy.nativeReference}<input className={field} maxLength={2048} value={nativeRef} onChange={e=>setNativeRef(e.target.value)}/></label></div><p id="history-native-help" className="text-sm opacity-80">{copy.firstUseHelp}</p>
    <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={()=>setStep(0)}>{copy.back}</button><button className={button} disabled={busy||summary.needsTimeDecision===true} onClick={()=>void run(prepare)}>{copy.saveEvidence}</button></div>
   </div>:null}
   {step===2?<div className="space-y-4">
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[[copy.newCount,counts.new_count],[copy.duplicateCount,counts.duplicate_count],[copy.conflictCount,counts.conflicts],[copy.blockedCount,counts.blocked]].map(([label,value])=><div key={String(label)} className="rounded-lg border border-current/20 p-3"><dt className="text-sm opacity-80">{String(label)}</dt><dd className="mt-1 text-2xl">{String(value??copy.unknown)}</dd></div>)}</dl>
    <p>{copy.gross}: {money(counts.new_gross_clp)}</p><p>{copy.knownNet}: {money(counts.known_new_net_clp)} · {copy.knownNetCount}: {String(counts.known_new_net_count??copy.unknown)}</p><p className="text-sm opacity-80">{copy.coverage}</p>
    {review?.writer_ready!==true?<p className="rounded-lg border border-amber-500 p-3">{copy.writerBlocked}</p>:null}
    {Array.isArray(review?.reasons)?<ul className="list-disc space-y-2 pl-5">{review.reasons.map(reason=><li key={String(reason)}>{reasonText(reason)}</li>)}</ul>:null}
    <div className="flex flex-wrap gap-3"><button className={button} disabled={busy||!!receipt} onClick={()=>setStep(1)}>{copy.steps[1]}</button><button className={button} disabled={busy||review?.can_commit!==true||!!receipt} onClick={()=>void run(confirm)}>{copy.confirm}</button>{canRecover?<button className={button} disabled={busy} onClick={()=>void run(async()=>{const found=await call("receipt",{request_key:operationKey.current});if(found.receipt)setReceipt(record(found.receipt));else setMessage(copy.error);})}>{copy.retry}</button>:null}</div>
   </div>:null}
   {receipt?<section className="rounded-lg border border-emerald-500 p-4" aria-label={copy.receipt}><h3 className="font-semibold">{copy.done}</h3><p className="break-all text-sm">{copy.operationId}: {String(receipt.operation_id)}</p><button className={button} onClick={()=>{setStep(0);setJobId(null);setJob(null);setSources([]);setFiles([]);setReceipt(null);setReview(null);operationKey.current=null;analysisKey.current=null;setCanRecover(false);save(null,[],null);}}>{copy.back}</button></section>:null}
  </section>:null}
  <section className="space-y-4 rounded-xl border border-current/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-medium">{copy.recorded}</h2><button className={button} disabled={busy} onClick={()=>void run(async()=>{setCaps(await call("capabilities"));await loadLedger();})}>{copy.refresh}</button></div><p className="text-sm opacity-80">{copy.coverage}</p>
   <HistoryMovementReader key={shopId} shopId={shopId} locale={locale} canRead={permissions.read===true} canExport={permissions.export===true} refreshSignature={JSON.stringify([caps.runtime,permissions,discovery,ledger?.revision])}/>
   {permissions.cancel===true&&record(caps.runtime).writer_authority==="web"?batches.filter(b=>b.state==="active").map(batch=><div key={String(batch.batch_id)} className="flex flex-wrap items-center justify-between gap-3 border-t border-current/20 pt-3"><span className="break-all font-mono text-xs">{String(batch.batch_id)}</span><button className={button} disabled={busy} onClick={()=>{if(window.confirm(copy.undoQuestion))void run(async()=>{const fresh=await call("capabilities"),runtime=record(fresh.runtime);await call("cancel_batch",{request_key:crypto.randomUUID(),batch_id:batch.batch_id,revision:runtime.revision,writer_epoch:runtime.writer_epoch});setCaps(fresh);await loadLedger();});}}>{copy.undo}</button></div>):null}
  </section>
 </div>;
}
