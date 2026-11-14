import {runHistoryWorkerOnce} from "../../src/server/payment-history/job-worker";
import {runMigrationWorkerOnce} from "../../src/server/payment-history/migration-worker";
import {createWorkerGatewayPort} from "./gateway-port";
import {createWorkerDiagnosticSink,redactedWorkerEvent} from "./diagnostics";
const controller=new AbortController();let stopCause:"none"|"sigint"|"sigterm"="none";
let diagnosticSink:(event:unknown)=>void=()=>{};
process.once("SIGINT",()=>{stopCause="sigint";controller.abort(Error("history_worker_cancelled"));});process.once("SIGTERM",()=>{stopCause="sigterm";controller.abort(Error("history_worker_cancelled"));});
const once=process.argv.includes("--once");
async function main(){
 diagnosticSink=createWorkerDiagnosticSink(process.env.HISTORY_WORKER_DIAGNOSTICS_FILE);
 const endpoint=process.env.PAYMENT_HISTORY_WORKER_GATEWAY_URL,secret=process.env.PAYMENT_HISTORY_WORKER_GATEWAY_SECRET;
 if(!endpoint||!secret)throw Error("history_worker_configuration_missing");
 const write=(event:unknown)=>{const safe=redactedWorkerEvent(event);if(safe){diagnosticSink(safe);process.stdout.write(JSON.stringify(safe)+"\n");}};
 const gateway=createWorkerGatewayPort(endpoint,secret,process.env.PAYMENT_HISTORY_ALLOW_LOOPBACK==="yes",write,!once);
 do{
  const result=await runHistoryWorkerOnce({...gateway,rpc:(op,payload,signal)=>gateway.call("import",op,payload,signal)},controller.signal);
  let event:string=result.kind,code="code"in result?result.code:undefined;
  if(result.kind==="idle"){
   controller.signal.throwIfAborted();
   const migration=await runMigrationWorkerOnce({memoryBytes:gateway.memoryBytes,rpc:(op,payload,signal)=>gateway.call("migration",op,payload,signal??controller.signal),download:(path,signal)=>gateway.download(path,20971520,signal),diagnostic:write},controller.signal);
   event=`migration_${migration.state}`;code="code"in migration?migration.code:undefined;
  }
  write({event,...(code?{code}:{})});
  if(once)break;
  await new Promise<void>(resolve=>{const stop=()=>{clearTimeout(timer);resolve();},timer=setTimeout(()=>{controller.signal.removeEventListener("abort",stop);resolve();},2000);controller.signal.addEventListener("abort",stop,{once:true});});
 }while(!controller.signal.aborted);
 write({event:"history_worker_exit",cause:stopCause==="none"?"once":stopCause,exit_code:0});
}
main().catch(error=>{
 const known=new Set(["history_worker_configuration_missing","history_worker_gateway_unavailable","history_worker_rpc_rejected","history_worker_response_invalid","history_worker_response_limit","history_worker_payload_limit","history_worker_diagnostics_unavailable","history_worker_timeout"]);
 const code=controller.signal.aborted?"history_worker_cancelled":error instanceof Error&&known.has(error.message)?error.message:"history_worker_unexpected_stop";
 process.exitCode=controller.signal.aborted?0:1;
 const event={event:"history_worker_stopped",code,cause:stopCause==="none"?"unexpected":stopCause,exit_code:process.exitCode};
 try{diagnosticSink(event);}catch{/* Host status still records the actual child exit. */}
 process.stderr.write(JSON.stringify(event)+"\n");
});
