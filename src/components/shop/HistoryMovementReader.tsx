"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {SupportedLocale} from "@/i18n/locales";
import {historyMovementCopy} from "@/i18n/history-movements";
import {validateHistoryMovementQuery,type HistoryMovementQuery,type HistoryMovementRead} from "@/lib/payment-history/movement-read-contract";
import {loadHistoryMovementPage} from "@/lib/payment-history/movement-loader";
const button="rounded-lg border border-current/30 px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4";
const field="block w-full rounded-lg border border-current/30 bg-transparent p-2";
const initial:HistoryMovementQuery={from_date:null,to_date:null,include_inactive:false,page_size:50,after:null};
export function HistoryMovementReader({shopId,locale,canRead,canExport,refreshSignature}:{shopId:string;locale:SupportedLocale;canRead:boolean;canExport:boolean;refreshSignature:string}){
 const copy=historyMovementCopy(locale),[draft,setDraft]=useState({from:"",to:"",audit:false});
 const [query,setQuery]=useState(initial),[previous,setPrevious]=useState<HistoryMovementQuery[]>([]),[nonce,setNonce]=useState(0);
 const [view,setView]=useState<{scope:string;query:HistoryMovementQuery;result:HistoryMovementRead}|null>(null);
 const [state,setState]=useState<"loading"|"current"|"retained"|"denied"|"invalid">("loading"),[exporting,setExporting]=useState(false);
 const sequence=useRef(0),exportController=useRef<AbortController|null>(null);
 const call=useCallback(async(operation:string,payload:HistoryMovementQuery,signal:AbortSignal)=>{
  const response=await fetch("/api/shop/payment-history",{method:"POST",credentials:"same-origin",cache:"no-store",signal,headers:{"Content-Type":"application/json","X-History-Request":"1"},body:JSON.stringify({shop_id:shopId,operation,payload})});
  const body=await response.json();if(!response.ok||body.ok!==true)throw Error(response.status===401||response.status===403?"history_access_denied":typeof body.code==="string"?body.code:"history_unavailable");return body.result;
 },[shopId]);
 useEffect(()=>{
  const current=++sequence.current,controller=new AbortController();
  if(canRead){
   void loadHistoryMovementPage(call,query,controller.signal).then(next=>{
    if(controller.signal.aborted||current!==sequence.current)return;
    setView({scope:shopId,...next});setState("current");
   }).catch(error=>{
    if(controller.signal.aborted||current!==sequence.current)return;
    if(error instanceof Error&&error.message==="history_access_denied"){setView(null);setState("denied");}else setState("retained");
   });
  }
  return()=>{controller.abort();};
 },[call,query,shopId,canRead,refreshSignature,nonce]);
 useEffect(()=>()=>{exportController.current?.abort();},[shopId,canRead,canExport]);
 const visible=canRead&&state!=="denied"&&view?.scope===shopId?view:null;
 const money=(value:string|null)=>value===null?copy.unknown:new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(BigInt(value));
 async function exportPage(){
  if(!visible||!canExport||exporting)return;
  const controller=new AbortController();exportController.current=controller;setExporting(true);
  try{
   const page=await loadHistoryMovementPage(call,visible.query,controller.signal,"movements_export");
   if(controller.signal.aborted)return;
   const url=URL.createObjectURL(new Blob([JSON.stringify({scope:"filtered_page_with_global_totals",...page.result})],{type:"application/json"})),link=document.createElement("a");
   try{link.href=url;link.download="payment-history-filtered-page.json";link.click();}finally{URL.revokeObjectURL(url);}
  }catch(error){if(!controller.signal.aborted){if(error instanceof Error&&error.message==="history_access_denied"){setView(null);setState("denied");}else setState("retained");}}
  finally{if(exportController.current===controller){exportController.current=null;setExporting(false);}}
 }
 return <div className="space-y-4" aria-label={copy.current}>
  <form className="flex flex-wrap items-end gap-3" onSubmit={event=>{event.preventDefault();try{const next=validateHistoryMovementQuery({from_date:draft.from||null,to_date:draft.to||null,include_inactive:draft.audit,page_size:50,after:null});setPrevious([]);setState("loading");setQuery(next);}catch{setState("invalid");}}}>
   <label>{copy.from}<input type="date" className={field} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
   <label>{copy.to}<input type="date" className={field} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
   <label className="flex gap-2 py-2"><input type="checkbox" checked={draft.audit} onChange={e=>setDraft({...draft,audit:e.target.checked})}/>{copy.audit}</label>
   <button className={button} disabled={!canRead}>{copy.filter}</button>
  </form>
  <p role="status" aria-live="polite">{!canRead?copy.denied:copy[state]}</p>
  {visible?<>
   <p className="text-sm">{copy.range}: {visible.result.from_date??copy.all} → {visible.result.to_date??copy.all} · {copy.revision}: {visible.result.revision??copy.unknown}</p>
   <section aria-label={copy.totals}><h3 className="font-medium">{copy.totals}</h3><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
    [copy.count,visible.result.totals.matched_count],[copy.gross,money(visible.result.totals.signed_active_gross_clp)],
    [copy.net,money(visible.result.totals.known_active_net_clp)],[copy.known,visible.result.totals.known_active_net_count],
   ].map(([label,value])=><div key={label} className="rounded-lg border border-current/20 p-3"><dt className="text-sm opacity-80">{label}</dt><dd className="mt-1 break-words text-lg tabular-nums">{value}</dd></div>)}</dl></section>
   {!visible.result.configured?<p>{copy.unconfigured}</p>:visible.result.rows.length===0?<p>{copy.empty}</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{[copy.clock,copy.merchant,copy.kind,copy.amounts,copy.state,copy.source].map(label=><th scope="col" className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{visible.result.rows.map(row=><tr key={row.id} className="border-t border-current/20 align-top">
    <td className="whitespace-nowrap p-2"><time dateTime={row.business_datetime}>{row.business_datetime.replace("T"," ")}</time></td>
    <td className="max-w-64 break-words p-2">{row.merchant_label}<div className="text-xs">{row.external_namespace} / {row.external_id}</div></td>
    <td className="p-2">{row.movement_kind==="Sale"?copy.sale:copy.cancellation}<div>{row.transaction_state}</div></td>
    <td className="whitespace-nowrap p-2 tabular-nums">{copy.gross}: {money(row.gross_clp)}<div>{copy.fee}: {money(row.fee_clp)}</div><div>{copy.vat}: {money(row.fee_vat_clp)}</div><div>{copy.netRow}: {money(row.net_clp)}</div></td>
    <td className="p-2">{row.active?copy.active:copy.inactive}<div className="text-xs">{row.batch_state}</div></td>
    <td className="min-w-48 max-w-96 p-2"><details><summary className="cursor-pointer">{copy.details}</summary><dl className="space-y-2 break-all text-xs">{[
     [copy.batch,row.batch_id],[copy.origin,row.batch_origin],[copy.sheet,`${row.source_sheet??copy.unknown} / ${row.source_row??copy.unknown}`],[copy.file,row.source_sha256],
     [copy.raw,row.timestamp_raw],[copy.utc,row.occurred_at_utc],[copy.offset,row.offset_minutes],[copy.interpretation,row.time_interpretation],[copy.policy,row.time_policy_version],[copy.evidence,row.time_evidence_reference],
    ].map(([label,value])=><div key={label}><dt className="font-medium">{label}</dt><dd>{value??copy.unknown}</dd></div>)}</dl></details></td>
   </tr>)}</tbody></table></div>}
   <div className="flex flex-wrap gap-3"><button className={button} disabled={!previous.length} onClick={()=>{const prior=previous.at(-1);if(prior){setPrevious(previous.slice(0,-1));setState("loading");setQuery(prior);}}}>{copy.previous}</button><button className={button} disabled={!visible.result.next} onClick={()=>{if(visible.result.next){setPrevious([...previous,visible.query]);setState("loading");setQuery({...visible.query,after:visible.result.next});}}}>{copy.next}</button>{canExport?<button className={button} disabled={exporting} onClick={()=>void exportPage()}>{copy.export}</button>:null}<button className={button} onClick={()=>{setState("loading");setNonce(n=>n+1);}} aria-label={copy.loading}>↻</button></div>
   {canExport?<p className="text-xs opacity-80">{copy.exportHelp}</p>:null}
  </>:null}
  <p className="text-sm opacity-80">{copy.coverage}</p>
 </div>;
}
