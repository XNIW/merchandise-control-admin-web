"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {HistoryTransferCopy} from "@/i18n/history-transfer";
type Data=Record<string,unknown>;
type Choice={merchantId:string;label:string;reference:string};
const record=(v:unknown):Data=>v&&typeof v==="object"&&!Array.isArray(v)?v as Data:{};
const list=(v:unknown):Data[]=>Array.isArray(v)?v as Data[]:[];
const button="rounded-lg border border-current/30 px-4 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4";
const field="mt-1 block w-full rounded-lg border border-current/30 bg-transparent p-2 text-sm";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function HistoryTransferPanel({shopId,copy}:{shopId:string;copy:HistoryTransferCopy}){
 const [file,setFile]=useState<File|null>(null),[upload,setUpload]=useState<string|null>(null),[runId,setRunId]=useState<string|null>(null),[job,setJob]=useState<Data|null>(null),[review,setReview]=useState<Data|null>(null),[receipt,setReceipt]=useState<Data|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [merchants,setMerchants]=useState<Data[]>([]),[choices,setChoices]=useState<Record<string,Choice>>({}),[uncertain,setUncertain]=useState(false);
 const locked=useRef(false),mounted=useRef(false),controller=useRef<AbortController|null>(null),analysisKey=useRef<string|null>(null),applyKey=useRef<string|null>(null),heading=useRef<HTMLHeadingElement>(null);
 const save=useCallback((values:Record<string,string|null>)=>{const url=new URL(window.location.href);for(const [key,value] of Object.entries(values)){if(value)url.searchParams.set("history_transfer_"+key,value);else url.searchParams.delete("history_transfer_"+key);}window.history.replaceState(window.history.state,"",url);},[]);
 const call=useCallback(async(operation:string,payload:Data={})=>{
  const response=await fetch("/api/shop/payment-history/transfer",{method:"POST",credentials:"same-origin",cache:"no-store",signal:controller.current?.signal,headers:{"Content-Type":"application/json","X-History-Request":"1"},body:JSON.stringify({shop_id:shopId,lane:"migration",operation,payload})});const body=await response.json();if(!response.ok||body.ok!==true)throw Error("history_transfer_failed");return record(body.result);
 },[shopId]);
 const load=useCallback(async(id:string)=>{const result=await call("status",{run_id:id});if(mounted.current){setJob(result);setChoices(previous=>{const next={...previous};for(const b of list(result.bindings)){const key=String(b.local_scope_id);next[key]={merchantId:String(b.merchant_id),label:previous[key]?.label??"",reference:previous[key]?.reference??""};}return next;});}return result;},[call]);
 const run=async(work:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError("");try{await work();}catch{if(mounted.current)setError(copy.error);}finally{locked.current=false;if(mounted.current)setBusy(false);}};
 useEffect(()=>{mounted.current=true;controller.current=new AbortController();let live=true;
  void Promise.resolve().then(async()=>{
   const params=new URL(window.location.href).searchParams;const saved=Object.fromEntries(["upload","run","analysis","apply"].map(k=>[k,params.get("history_transfer_"+k)]));
   if(Object.values(saved).some(v=>v&&!uuid.test(v)))return;
   analysisKey.current=saved.analysis;applyKey.current=saved.apply;
   if(!live)return;setUpload(saved.upload);setRunId(saved.run);setUncertain(!!saved.apply);
   if(saved.apply){const result=await call("receipt",{request_key:saved.apply});if(live&&result.receipt){setReceipt(record(result.receipt));setUncertain(false);}}
   if(saved.run&&live)await load(saved.run);
  }).catch(()=>{if(live)setError(copy.error);});
  return()=>{live=false;mounted.current=false;controller.current?.abort();};
 },[call,copy.error,load]);
 async function continueUpload(id=upload){
  if(!id)return;const status=await call("upload_status",{upload_id:id});if(status.state!=="verified"){setMessage(copy.waiting);return;}
  analysisKey.current??=crypto.randomUUID();save({analysis:analysisKey.current,upload:id});
  const started=await call("start",{request_key:analysisKey.current,upload_id:id});const current=String(started.run_id);setRunId(current);save({run:current});await load(current);setMessage(copy.waiting);
 }
 async function uploadFile(){
  if(!file||!file.name.toLowerCase().endsWith(".w7history.zip")||file.size<1||file.size>20*1024*1024)throw Error("history_input_invalid");
  const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
  const created=await call("upload_create",{file_name:file.name,byte_length:String(file.size),sha256:hash});
  const form=new FormData();form.append("cacheControl","3600");form.append("",file);const response=await fetch(String(created.signed_url),{method:"PUT",signal:controller.current?.signal,headers:{"x-upsert":"false"},body:form});if(!response.ok)throw Error("history_upload_failed");
  const id=String(created.upload_id);setUpload(id);save({upload:id});await call("upload_ready",{upload_id:id});await continueUpload(id);
 }
 async function reviewTransfer(){if(!runId)return;const result=await call("review",{run_id:runId});setReview(result);setMessage(result.can_apply===true?copy.review:copy.blocked);heading.current?.focus();}
 async function saveMatches(){
  if(!runId)return;
  for(const scope of list(job?.scopes)){
   const choice=choices[String(scope.id)];if(!choice?.reference.trim()||!choice.merchantId&&!choice.label.trim())throw Error("history_input_invalid");
   const mapped=await call("mapping",{run_id:runId,local_scope_id:scope.id,merchant_id:choice.merchantId||null,label:choice.label,reference:choice.reference});
   setChoices(previous=>({...previous,[String(scope.id)]:{...choice,merchantId:String(mapped.merchant_id)}}));
   if(!choice.merchantId)setMerchants(previous=>[...previous,{merchant_id:mapped.merchant_id,label:choice.label}]);
  }
  await load(runId);await reviewTransfer();
 }
 async function recover(){if(!applyKey.current)return;const found=await call("receipt",{request_key:applyKey.current});if(found.receipt){setReceipt(record(found.receipt));setUncertain(false);setMessage(copy.done);}else setMessage(copy.pending);}
 async function confirm(){
  if(!runId||review?.can_apply!==true||uncertain||receipt)return;applyKey.current??=crypto.randomUUID();save({apply:applyKey.current});setUncertain(true);
  try{const result=await call("apply",{run_id:runId,review_digest:review.review_digest,request_key:applyKey.current});setReceipt(result);setUncertain(false);setMessage(copy.done);}catch{await recover();}
 }
 const summary=record(review?.summary??receipt),source=record(job?.summary);
 return <details className="rounded-xl border border-current/20 p-4" onToggle={event=>{if(event.currentTarget.open&&!merchants.length)void run(async()=>{const response=await fetch("/api/shop/payment-history",{method:"POST",credentials:"same-origin",cache:"no-store",signal:controller.current?.signal,headers:{"Content-Type":"application/json","X-History-Request":"1"},body:JSON.stringify({shop_id:shopId,operation:"metadata",payload:{}})});const body=await response.json();if(!response.ok||!body.ok)throw Error("history_transfer_failed");setMerchants(list(body.result.merchants));});}}>
  <summary className="cursor-pointer font-semibold">{copy.title}</summary>
  <div className="mt-4 space-y-4" aria-busy={busy}>
   <p className="text-sm opacity-80">{copy.help}</p><h2 ref={heading} tabIndex={-1} className="outline-none">{copy.review}</h2>
   <div role="status" aria-live="polite">{busy?copy.working:message}</div>{error?<p role="alert">{error}</p>:null}
   {!runId&&!receipt?<><label className="block text-sm">{copy.file}<input className={field} type="file" accept=".w7history.zip" disabled={busy||uncertain} onChange={event=>{setFile(event.target.files?.[0]??null);setUpload(null);analysisKey.current=null;save({upload:null,run:null,analysis:null});}}/></label><div className="flex flex-wrap gap-3"><button className={button} disabled={busy||!file||uncertain} onClick={()=>void run(uploadFile)}>{copy.upload}</button>{upload?<button className={button} disabled={busy||uncertain} onClick={()=>void run(()=>continueUpload())}>{copy.continue}</button>:null}</div></>:null}
   {runId?<div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={()=>void run(async()=>{await load(runId);})}>{copy.refresh}</button><button className={button} disabled={busy||!!receipt||uncertain} onClick={()=>void run(async()=>{await call("resume",{run_id:runId});setReview(null);await load(runId);})}>{copy.resume}</button><button className={button} disabled={busy||!!receipt||uncertain} onClick={()=>void run(async()=>{setJob(await call("cancel",{run_id:runId}));setReview(null);})}>{copy.cancel}</button></div>:null}
   {job?<p className="text-sm">{copy.state}: {String(job.state)} · {copy.original}: {String(source.movements??job.processed_movements??0)}</p>:null}
   {job?.state==="review_ready"&&!receipt?<><p>{copy.mapping}</p><p className="text-sm opacity-80">{copy.referenceHelp}</p>{list(job.scopes).map((scope,index)=>{const id=String(scope.id),choice=choices[id]??{merchantId:"",label:"",reference:""},edit=(change:Partial<Choice>)=>{setReview(null);setChoices(previous=>({...previous,[id]:{...choice,...change}}));};return <fieldset key={id} disabled={busy||uncertain} className="space-y-2 rounded-lg border border-current/20 p-3"><legend>{copy.merchant} {index+1}</legend><p className="break-words text-sm">{String(scope.reference)}</p><label className="block">{copy.merchant}<select className={field} value={choice.merchantId} onChange={e=>edit({merchantId:e.target.value})}><option value="">{copy.newMerchant}</option>{merchants.map(m=><option key={String(m.merchant_id)} value={String(m.merchant_id)}>{String(m.label)}</option>)}</select></label>{!choice.merchantId?<label className="block">{copy.name}<input className={field} maxLength={256} value={choice.label} onChange={e=>edit({label:e.target.value})}/></label>:null}<label className="block">{copy.reference}<input className={field} maxLength={2048} value={choice.reference} onChange={e=>edit({reference:e.target.value})}/></label></fieldset>;})}<button className={button} disabled={busy||uncertain} onClick={()=>void run(saveMatches)}>{copy.save}</button><button className={button} disabled={busy||uncertain} onClick={()=>void run(async()=>{await load(runId!);await reviewTransfer();})}>{copy.review}</button></>:null}
   {review||receipt?<dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">{[[copy.active,summary.new_active],[copy.inactive,summary.new_inactive],[copy.duplicates,summary.duplicates],[copy.gross,summary.new_active_gross_clp],[copy.knownNet,summary.known_new_active_net_clp],[copy.knownNetCount,summary.known_new_active_net_count]].map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>{String(value??"—")}</dd></div>)}</dl>:null}
   {review&&!receipt?<button className={button} disabled={busy||review.can_apply!==true||uncertain} onClick={()=>void run(confirm)}>{copy.confirm}</button>:null}
   {uncertain?<p>{copy.pending}</p>:null}{uncertain||receipt?<button className={button} disabled={busy} onClick={()=>void run(recover)}>{copy.recover}</button>:null}
   {receipt?<section aria-label={copy.done}><h3 className="font-semibold">{copy.done}</h3><p className="break-all text-sm">{copy.operation}: {String(receipt.operation_id)}</p><button className={button} disabled={busy} onClick={()=>{setReceipt(null);setReview(null);setJob(null);setRunId(null);setUpload(null);setFile(null);setChoices({});analysisKey.current=null;applyKey.current=null;save({run:null,upload:null,apply:null,analysis:null});}}>{copy.newTransfer}</button></section>:null}
  </div>
 </details>;
}
