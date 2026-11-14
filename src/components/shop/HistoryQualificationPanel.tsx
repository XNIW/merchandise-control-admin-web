"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {HistoryQualificationCopy} from "@/i18n/history-qualification";
type Data=Record<string,unknown>;
type Upload={upload_id:string;sha256:string};
const field="mt-1 block w-full rounded-lg border border-current/30 bg-transparent p-2 text-sm";
const button="rounded-lg border border-current/30 px-4 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4";
const record=(v:unknown):Data=>v&&typeof v==="object"&&!Array.isArray(v)?v as Data:{};
export function HistoryQualificationPanel({shopId,copy}:{shopId:string;copy:HistoryQualificationCopy}){
 const [evidence,setEvidence]=useState<Data[]>([]),[kind,setKind]=useState("merchant_mapping"),[profile,setProfile]=useState("GetnetLegacy"),[parser,setParser]=useState("getnet-ooxml-v1"),[interpretation,setInterpretation]=useState("Unresolved"),[provider,setProvider]=useState(false);
 const [values,setValues]=useState<Record<string,string>>({merchant:"",alias:"",from:"",to:"",native:"",version:"",reference:"",mapping:""}),[sources,setSources]=useState<File[]>([]),[document,setDocument]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const lock=useRef(false),controller=useRef<AbortController|null>(null),uploads=useRef<Map<File,Upload>>(new Map()),requestKey=useRef<string|null>(null);
 const call=useCallback(async(operation:string,payload:Data={},qualified=true)=>{
  const response=await fetch("/api/shop/payment-history"+(qualified?"/qualification":""),{method:"POST",credentials:"same-origin",cache:"no-store",signal:controller.current?.signal,headers:{"Content-Type":"application/json","X-History-Request":"1","X-History-Master":"1"},body:JSON.stringify({shop_id:shopId,operation,payload})});
  const body=await response.json();if(!response.ok||body.ok!==true)throw Error("history_qualification_failed");return record(body.result);
 },[shopId]);
 const refresh=useCallback(async()=>{const result=await call("read");setEvidence(Array.isArray(result.evidence)?result.evidence:[]);},[call]);
 useEffect(()=>{const owned=new AbortController();controller.current=owned;let stopped=false;
  void call("read").then(result=>{if(!stopped)setEvidence(Array.isArray(result.evidence)?result.evidence:[]);}).catch(()=>{if(!stopped)setMessage(copy.error);});
  return()=>{stopped=true;owned.abort();};
 },[call,copy.error]);
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setMessage("");try{await action();}catch{if(!controller.current?.signal.aborted)setMessage(copy.error);}finally{lock.current=false;setBusy(false);}}
 async function upload(file:File){
  const old=uploads.current.get(file);if(old)return old;
  const bytes=await file.arrayBuffer(),sha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
  const created=await call("upload_create",{file_name:file.name,sha256,byte_length:String(file.size)},false);
  const type=file.type||(/\.pdf$/i.test(file.name)?"application/pdf":/\.png$/i.test(file.name)?"image/png":/\.jpe?g$/i.test(file.name)?"image/jpeg":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const form=new FormData();form.append("cacheControl","3600");form.append("",new File([bytes],file.name,{type}));
  const response=await fetch(String(created.signed_url),{method:"PUT",body:form,signal:controller.current?.signal,headers:{"x-upsert":"false"}});
  if(!response.ok)throw Error();const value={upload_id:String(created.upload_id),sha256};uploads.current.set(file,value);await call("upload_ready",{upload_id:value.upload_id},false);return value;
 }
 async function save(){
  if(!document||!sources.length||sources.length>10||sources.some(f=>!/\.xlsx$/i.test(f.name)||f.size<1||f.size>20971520)||document.size<1||document.size>20971520||!/\.(pdf|png|jpe?g)$/i.test(document.name))throw Error();
  const originals=[];for(const source of sources)originals.push(await upload(source));const doc=await upload(document);
  for(const item of [...originals,doc]){const state=await call("upload_status",{upload_id:item.upload_id},false);if(state.state!=="verified"){setMessage(copy.waiting);return;}}
  const scope={merchant_id:values.merchant,alias_key:values.alias,profile,parser_version:parser,file_sha256:originals.map(s=>s.sha256),from_ticks:values.from,to_ticks:values.to,interpretation:kind==="modern_time"?interpretation:"Unresolved",native_start_ticks:kind==="native_start"?values.native:null};
  const mapping=kind==="merchant_mapping"?JSON.parse(values.mapping):null;
  requestKey.current??=crypto.randomUUID();await call("qualify",{request_key:requestKey.current,kind,level:kind==="modern_time"&&provider?"provider_verified":"operator_attested",version:values.version,reference:values.reference,document_upload_id:doc.upload_id,document_sha256:doc.sha256,scope,mapping});
  requestKey.current=null;await refresh();window.dispatchEvent(new CustomEvent("payment-history:qualification-changed",{detail:{shopId}}));setMessage(copy.done);
 }
 const edit=(key:string,value:string)=>{requestKey.current=null;setMessage("");setValues(v=>({...v,[key]:value}));};
 return <section className="space-y-4 rounded-xl border border-current/20 p-4"><h3 className="text-lg font-semibold">{copy.proofs}</h3><p>{copy.scope}</p>
  <form onSubmit={e=>{e.preventDefault();void run(save);}}><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
   <label>{copy.kind}<select className={field} value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);requestKey.current=null;}}>{["merchant_mapping","legacy_currency","modern_time","native_start"].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>{copy.profile}<select className={field} value={profile} onChange={e=>{setProfile(e.target.value);requestKey.current=null;setMessage("");}}><option>GetnetLegacy</option><option>GetnetModern</option></select></label>
   <label>{copy.parser}<select className={field} value={parser} onChange={e=>{setParser(e.target.value);requestKey.current=null;setMessage("");}}><option>getnet-ooxml-v1</option><option>getnet-ooxml-web-v1</option></select></label>
   {(["merchant","alias","from","to","version","reference"] as const).map(key=><label key={key}>{copy[key]}<input className={field} value={values[key]} required={key!=="alias"||kind==="merchant_mapping"} maxLength={key==="reference"?2048:160} onChange={e=>edit(key,e.target.value)}/></label>)}
   {kind==="native_start"?<label>{copy.native}<input className={field} value={values.native} required onChange={e=>edit("native",e.target.value)}/></label>:null}
   {kind==="modern_time"?<><label>{copy.interpretation}<select className={field} value={interpretation} onChange={e=>setInterpretation(e.target.value)}><option>Unresolved</option><option>IsoUtc</option><option>ExportedLocal</option></select></label><label><input type="checkbox" required checked={provider} onChange={e=>setProvider(e.target.checked)}/> {copy.provider}</label></>:null}
   {kind==="merchant_mapping"?<label className="sm:col-span-2">{copy.mapping}<textarea className={field} required value={values.mapping} onChange={e=>edit("mapping",e.target.value)}/></label>:null}
   <label>{copy.sources}<input type="file" multiple accept=".xlsx" className={field} required onChange={e=>{setSources(Array.from(e.target.files??[]));requestKey.current=null;}}/></label>
   <label>{copy.document}<input type="file" accept=".pdf,.png,.jpg,.jpeg" className={field} required onChange={e=>{setDocument(e.target.files?.[0]??null);requestKey.current=null;}}/></label>
   <div className="flex flex-wrap gap-3 sm:col-span-2"><button className={button} disabled={busy}>{busy?copy.working:copy.save}</button><button type="button" className={button} disabled={busy} onClick={()=>void run(refresh)}>{copy.refresh}</button></div>
  </fieldset></form><p role="status" aria-live="polite">{message}</p><h4 className="font-semibold">{copy.verified}</h4>
  {evidence.length?evidence.map(e=><div key={String(e.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-current/20 p-3"><span>{String(e.kind)} · {String(e.state)} · {String(e.reference)}</span>{e.state==="Verified"?<button className={button} disabled={busy} onClick={()=>{if(window.confirm(copy.confirmRevoke))void run(async()=>{await call("revoke",{evidence_id:e.id});await refresh();window.dispatchEvent(new CustomEvent("payment-history:qualification-changed",{detail:{shopId}}));setMessage(copy.revoked);});}}>{copy.revoke}</button>:null}</div>):<p>{copy.empty}</p>}
 </section>;
}
