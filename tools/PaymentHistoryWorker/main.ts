import {createClient} from "@supabase/supabase-js";
import {runHistoryWorkerOnce} from "../../src/server/payment-history/job-worker";
const url=process.env.PAYMENT_HISTORY_SUPABASE_URL,key=process.env.PAYMENT_HISTORY_SERVICE_ROLE_KEY;
if(!url||!key||new URL(url).protocol!=="https:"&&!(process.env.PAYMENT_HISTORY_ALLOW_LOOPBACK==="yes"&&["127.0.0.1","localhost"].includes(new URL(url).hostname)))throw Error("history_worker_configuration_missing");
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),controller=new AbortController();
process.once("SIGINT",()=>controller.abort());process.once("SIGTERM",()=>controller.abort());
const once=process.argv.includes("--once");
const port={memoryBytes:()=>process.memoryUsage().rss,
 async rpc(operation:string,payload:Record<string,unknown>,signal?:AbortSignal){
  const request=db.rpc("payment_history_worker_v1",{p_operation:operation,p_payload:payload});
  const {data,error}=await(signal?request.abortSignal(signal):request);
  if(error)throw Error("history_worker_rpc_rejected");
  if(!data||data.ok!==true)throw Error("history_worker_response_invalid");return data;
 },
 async download(objectKey:string,limit:number,signal:AbortSignal){
  // Signed URLs stay in process memory and are never printed. Streaming limits
  // apply before allocation, even if Storage metadata has been tampered with.
  const {data,error}=await db.storage.from("payment-history-sources").createSignedUrl(objectKey,120);
  if(error||!data)throw Error("history_source_not_ready");
  const response=await fetch(data.signedUrl,{signal});
  if(!response.ok||!response.body)throw Error("history_source_not_ready");
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>limit)throw Error("history_source_limit");parts.push(item.value);}}
  finally{await reader.cancel();reader.releaseLock();}
  return Buffer.concat(parts,size);
 }};
async function main(){do{const result=await runHistoryWorkerOnce(port,controller.signal);process.stdout.write(JSON.stringify({event:result.kind,...("code"in result?{code:result.code}:{})})+"\n");if(once)break;await new Promise<void>(resolve=>{const stop=()=>{clearTimeout(timer);resolve();},timer=setTimeout(()=>{controller.signal.removeEventListener("abort",stop);resolve();},2000);controller.signal.addEventListener("abort",stop,{once:true});});}while(!controller.signal.aborted);}
main().catch(()=>{process.stderr.write('history_worker_stopped\n');process.exitCode=1;});
