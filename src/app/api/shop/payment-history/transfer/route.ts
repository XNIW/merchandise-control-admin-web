import {demandHistoryAccess,historyUploadUrl,HistoryRequestError} from "@/server/payment-history/request-boundary";
import {TRANSFER_OPERATIONS,TransferApplyRejectedError,transferRequest,type TransferLane} from "@/server/payment-history/transfer-boundary";
import type {Json} from "@/lib/supabase/database.types";
export const dynamic="force-dynamic";
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function POST(request:Request){
 try{
  if(request.headers.get("origin")!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site"||request.headers.get("x-history-request")!=="1")throw new HistoryRequestError("history_origin_invalid",403);
  if(!request.body||!request.headers.get("content-type")?.startsWith("application/json"))throw new HistoryRequestError("history_input_invalid",400);
  const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>65536)throw new HistoryRequestError("history_capacity",413);parts.push(r.value);}}finally{await reader.cancel();reader.releaseLock();}
  const value:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts,size)));
  if(!value||typeof value!=="object"||Array.isArray(value))throw new HistoryRequestError("history_input_invalid",400);const input=value as Record<string,unknown>;
  if(Object.keys(input).length!==4||Object.keys(input).some(k=>!["shop_id","lane","operation","payload"].includes(k))||typeof input.shop_id!=="string"||typeof input.lane!=="string"||!Object.hasOwn(TRANSFER_OPERATIONS,input.lane)||typeof input.operation!=="string")throw new HistoryRequestError("history_input_invalid",400);
  const access=await demandHistoryAccess(input.shop_id),lane=input.lane as TransferLane,result=await transferRequest(access,lane,input.operation,input.payload as Json);
  return response({ok:true,result:input.operation==="upload_create"?await historyUploadUrl(access,result):result});
 }catch(error){return response({ok:false,code:error instanceof HistoryRequestError?error.code:"history_input_invalid",...(error instanceof TransferApplyRejectedError?{outcome:"rejected"}:{})},error instanceof HistoryRequestError?error.status:400);}
}
