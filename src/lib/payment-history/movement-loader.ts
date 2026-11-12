import {validateHistoryMovementRead,type HistoryMovementQuery,type HistoryMovementRead} from "./movement-read-contract";
type Call=(operation:string,payload:HistoryMovementQuery,signal:AbortSignal)=>Promise<unknown>;
// A changed snapshot requires a new anchor at the same commercial position.
// Only one recovery is allowed per request; concurrent changes stay visible as
// unavailable rather than causing an unbounded retry or mixed-revision page.
export async function loadHistoryMovementPage(call:Call,query:HistoryMovementQuery,signal:AbortSignal,operation="movements"):
 Promise<{query:HistoryMovementQuery;result:HistoryMovementRead}>{
 try{return {query,result:validateHistoryMovementRead(await call(operation,query,signal),query)};}
 catch(error){
  if(signal.aborted||!query.after||!(error instanceof Error)||error.message!=="history_view_changed")throw error;
  const first={...query,after:null},current=validateHistoryMovementRead(await call(operation,first,signal),first);
  if(signal.aborted)throw Error("history_page_closed");
  if(current.dataset_id!==query.after.dataset_id||!current.configured)return {query:first,result:current};
  const rebased={...query,after:{...query.after,revision:current.revision!}};
  return {query:rebased,result:validateHistoryMovementRead(await call(operation,rebased,signal),rebased)};
 }
}
