import {runHistoryWorkerOnce} from "../../src/server/payment-history/job-worker";
import {runMigrationWorkerOnce} from "../../src/server/payment-history/migration-worker";
import {createWorkerGatewayPort} from "./gateway-port";
const endpoint=process.env.PAYMENT_HISTORY_WORKER_GATEWAY_URL,secret=process.env.PAYMENT_HISTORY_WORKER_GATEWAY_SECRET;
if(!endpoint||!secret)throw Error("history_worker_configuration_missing");
const gateway=createWorkerGatewayPort(endpoint,secret,process.env.PAYMENT_HISTORY_ALLOW_LOOPBACK==="yes"),controller=new AbortController();
process.once("SIGINT",()=>controller.abort());process.once("SIGTERM",()=>controller.abort());
const once=process.argv.includes("--once");
async function main(){
 do{
  const result=await runHistoryWorkerOnce({...gateway,rpc:(op,payload,signal)=>gateway.call("import",op,payload,signal)},controller.signal);
  let event:string=result.kind,code="code"in result?result.code:undefined;
  if(result.kind==="idle"){
   controller.signal.throwIfAborted();
   const migration=await runMigrationWorkerOnce({memoryBytes:gateway.memoryBytes,rpc:(op,payload)=>gateway.call("migration",op,payload,controller.signal),download:(path,signal)=>gateway.download(path,20971520,AbortSignal.any([signal,controller.signal]))});
   event=`migration_${migration.state}`;code="code"in migration?migration.code:undefined;
  }
  process.stdout.write(JSON.stringify({event,...(code?{code}:{})})+"\n");
  if(once)break;
  await new Promise<void>(resolve=>{const stop=()=>{clearTimeout(timer);resolve();},timer=setTimeout(()=>{controller.signal.removeEventListener("abort",stop);resolve();},2000);controller.signal.addEventListener("abort",stop,{once:true});});
 }while(!controller.signal.aborted);
}
main().catch(()=>{process.stderr.write("history_worker_stopped\n");process.exitCode=1;});
