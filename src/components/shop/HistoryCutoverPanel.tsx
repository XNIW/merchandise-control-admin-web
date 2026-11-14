"use client";
import {useEffect,useRef,useState} from "react";
import type {HistoryCutoverCopy} from "@/i18n/history-cutover";
type Data=Record<string,unknown>;
const record=(v:unknown):Data=>v&&typeof v==="object"&&!Array.isArray(v)?v as Data:{};
const list=(v:unknown):Data[]=>Array.isArray(v)?v as Data[]:[];
const button="rounded-lg border border-current/30 px-4 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4";
const field="mt-1 block w-full rounded-lg border border-current/30 bg-transparent p-2 text-sm";
export function HistoryCutoverPanel({shopId,copy,masterMode=false}:{shopId:string;masterMode?:boolean;copy:HistoryCutoverCopy}){
 const [status,setStatus]=useState<Data|null>(null),[devices,setDevices]=useState<Data[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [device,setDevice]=useState(""),[asset,setAsset]=useState(""),[hardwareHash,setHardwareHash]=useState(""),[disposition,setDisposition]=useState("unresolved"),[build,setBuild]=useState(""),[reference,setReference]=useState(""),[complete,setComplete]=useState(false),[completeRef,setCompleteRef]=useState("");
 const lock=useRef(false),controller=useRef<AbortController|null>(null),mounted=useRef(false);
 useEffect(()=>{mounted.current=true;controller.current=new AbortController();return()=>{mounted.current=false;controller.current?.abort();};},[]);
 async function call(operation:string,payload:Data={}){
  const response=await fetch("/api/shop/payment-history/transfer",{method:"POST",credentials:"same-origin",cache:"no-store",signal:controller.current?.signal,headers:{"Content-Type":"application/json","X-History-Request":"1",...(masterMode?{"X-History-Master":"1"}:{})},body:JSON.stringify({shop_id:shopId,lane:"cutover",operation,payload})});const body=await response.json();if(!response.ok||body.ok!==true)throw Error("history_cutover_failed");return record(body.result);
 }
 async function refresh(){const [current,names]=await Promise.all([call("status"),call("devices")]);if(mounted.current){setStatus(current);setDevices(list(names.devices));}}
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");try{await work();}catch{if(mounted.current)setError(copy.error);}finally{lock.current=false;if(mounted.current)setBusy(false);}}
 function edit(item:Data){setDevice(item.device_id===null?"":String(item.device_id));setHardwareHash(String(item.hardware_reference_sha256));setAsset("");setDisposition(String(item.disposition));setBuild(item.client_build_sha===null?"":String(item.client_build_sha));setReference(String(item.reference));}
 async function save(){
  if(!reference.trim()||!hardwareHash&&!asset.trim())throw Error("history_input_invalid");
  const hash=hardwareHash||Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(asset.trim()))),b=>b.toString(16).padStart(2,"0")).join("");
  await call("inventory",{device_id:device||null,hardware_reference_sha256:hash,disposition,protocol_version:disposition==="active"?1:0,client_build_sha:disposition==="active"?build:null,reference});setHardwareHash(hash);await refresh();setMessage(copy.saved);
 }
 async function transition(operation:"freeze"|"activate_web"|"freeze_web"){
  if(!status)return;
  const question=operation==="activate_web"?copy.activateQuestion:operation==="freeze_web"?copy.rollbackQuestion:copy.freezeQuestion;
  if(!window.confirm(question))return;
  await call(operation,operation==="activate_web"?{writer_epoch:status.writer_epoch,inventory_digest:status.inventory_digest}:{writer_epoch:status.writer_epoch,complete_inventory:complete,reference:completeRef});setComplete(false);await refresh();
 }
 const inventory=list(status?.inventory),gates=record(status?.gates),name=(id:unknown)=>String(devices.find(d=>d.device_id===id)?.name??copy.unregistered);
 return <details className="rounded-xl border border-current/20 p-4" onToggle={event=>{if(event.currentTarget.open&&!status)void run(refresh);}}>
  <summary className="cursor-pointer font-semibold">{copy.title}</summary><div className="mt-4 space-y-4" aria-busy={busy}>
   <p className="text-sm opacity-80">{copy.help}</p><button className={button} disabled={busy} onClick={()=>void run(refresh)}>{copy.refresh}</button><div role="status" aria-live="polite">{busy?copy.working:message}</div>{error?<p role="alert">{error}</p>:null}
   {status?<><p className="text-sm">{copy.writer}: <strong>{copy.states[String(status.writer_authority) as keyof typeof copy.states]??copy.missing}</strong></p><ul className="space-y-2 text-sm">{Object.entries(copy.gates).map(([key,label])=><li key={key}>{label}: <strong>{gates[key]===true?copy.ready:copy.missing}</strong></li>)}</ul>
   <section aria-label={copy.inventory} className="space-y-3"><h3 className="font-medium">{copy.inventory}</h3>{inventory.map((item,index)=><div key={String(item.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-current/20 p-3 text-sm"><p>{name(item.device_id)} {item.device_id===null?index+1:""} · {item.disposition==="active"?copy.active:item.disposition==="retired_verified"?copy.retired:copy.unresolved}</p><button className={button} disabled={busy||status.writer_authority==="web"} onClick={()=>edit(item)}>{copy.edit}</button></div>)}
   <fieldset disabled={busy||status.writer_authority==="web"} className="grid gap-3 sm:grid-cols-2"><label>{copy.device}<select className={field} value={device} onChange={e=>{setDevice(e.target.value);const existing=inventory.find(i=>i.device_id===e.target.value);setHardwareHash(existing?String(existing.hardware_reference_sha256):"");setAsset("");}}><option value="">{copy.unregistered}</option>{devices.map(d=><option key={String(d.device_id)} value={String(d.device_id)}>{String(d.name)} · {d.revoked===true?copy.deviceStates.revoked:copy.deviceStates[String(d.status) as keyof typeof copy.deviceStates]??copy.missing}</option>)}</select></label>{!hardwareHash?<label>{copy.asset}<input className={field} value={asset} maxLength={256} onChange={e=>setAsset(e.target.value)}/></label>:null}<label>{copy.disposition}<select className={field} value={disposition} onChange={e=>setDisposition(e.target.value)}><option value="unresolved">{copy.unresolved}</option><option value="active">{copy.active}</option><option value="retired_verified">{copy.retired}</option></select></label>{disposition==="active"?<label>{copy.build}<input className={field} value={build} minLength={40} maxLength={40} onChange={e=>setBuild(e.target.value)} spellCheck={false}/></label>:null}<label className="sm:col-span-2">{copy.reference}<textarea className={field} value={reference} maxLength={2048} onChange={e=>setReference(e.target.value)}/></label><button className={button} disabled={!reference.trim()||!hardwareHash&&!asset.trim()||disposition==="active"&&(!device||!/^[0-9a-f]{40}$/.test(build))} onClick={()=>void run(save)}>{copy.save}</button></fieldset></section>
   <fieldset disabled={busy} className="space-y-3 border-t border-current/20 pt-4"><label className="flex gap-2 text-sm"><input type="checkbox" checked={complete} onChange={e=>setComplete(e.target.checked)}/>{copy.complete}</label><label className="block text-sm">{copy.completeRef}<textarea className={field} maxLength={2048} value={completeRef} onChange={e=>setCompleteRef(e.target.value)}/></label><div className="flex flex-wrap gap-3">{status.writer_authority!=="web"?<button className={button} disabled={!complete||!completeRef.trim()} onClick={()=>void run(()=>transition("freeze"))}>{copy.freeze}</button>:<button className={button} disabled={!complete||!completeRef.trim()} onClick={()=>void run(()=>transition("freeze_web"))}>{copy.rollback}</button>}<button className={button} disabled={gates.can_activate!==true} onClick={()=>void run(()=>transition("activate_web"))}>{copy.activate}</button></div></fieldset></>:null}
  </div>
 </details>;
}
