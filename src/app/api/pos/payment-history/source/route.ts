import {createSupabaseAdminClient,resolveSupabaseAdminConfig} from "@/lib/supabase/admin";
import {deviceHistoryRequest,PosHistoryError} from "@/server/payment-history/device-boundary";
import {transferHistorySource,HistorySourceError} from "@/server/payment-history/baseline-source-transfer";
import {historySourceFailureStage,type HistorySourcePhase} from "@/server/payment-history/baseline-source-diagnostic";
import {putHistorySource} from "@/server/payment-history/baseline-source-put";
import {createPosRouteRequestContext,emitPosRouteRejectionAudit,posJsonResponse} from "../../_shared/pos-route-security";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 const context=createPosRouteRequestContext(request,"pos.payment-history-source");
 const started=performance.now();let phase:HistorySourcePhase="configuration";
 try{
  const db=createSupabaseAdminClient(),config=resolveSupabaseAdminConfig();
  if(!db||config.status!=="configured")throw new HistorySourceError("history_cloud_unavailable",503);
  const result=await transferHistorySource(request,{request:deviceHistoryRequest,storage:db.storage.from("payment-history-sources"),storageOrigin:config.url,observePhase:value=>{phase=value;},
   put:putHistorySource});
  return posJsonResponse(result.body,result.status,context);
 }catch(error){
  try{emitPosRouteRejectionAudit(context,historySourceFailureStage(error,phase,performance.now()-started));}catch{/* Preserve the original response if logging fails. */}
  const known=error instanceof PosHistoryError||error instanceof HistorySourceError;
  return posJsonResponse({ok:false,code:known?error.code:"history_baseline_upload_failed",message:"History source transfer could not complete."},known?error.status:503,context);
 }
}
