import {demandHistoryAccess,historyRequest,historyUploadUrl,HISTORY_OPERATIONS,HistoryRequestError,type HistoryOperation} from "@/server/payment-history/request-boundary";
import type {Json} from "@/lib/supabase/database.types";
export const dynamic="force-dynamic";
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function POST(request:Request){
 try{
  if(request.headers.get("origin")!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site"||request.headers.get("x-history-request")!=="1")throw new HistoryRequestError("history_origin_invalid",403);
  if(!request.headers.get("content-type")?.startsWith("application/json")||!request.body)throw new HistoryRequestError("history_input_invalid",400);
  const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>65536)throw new HistoryRequestError("history_capacity",413);chunks.push(next.value);}}finally{await reader.cancel();reader.releaseLock();}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
  const body:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buffer));
  if(!body||typeof body!=="object"||Array.isArray(body))throw new HistoryRequestError("history_input_invalid",400);
  const input=body as Record<string,unknown>;
  if(typeof input.shop_id!=="string"||typeof input.operation!=="string"||!HISTORY_OPERATIONS.includes(input.operation as HistoryOperation)||Object.keys(input).some(k=>!["shop_id","operation","payload"].includes(k)))throw new HistoryRequestError("history_input_invalid",400);
  const access=await demandHistoryAccess(input.shop_id),operation=input.operation as HistoryOperation;
  const result=await historyRequest(access,operation,(input.payload??{}) as Json);
  return response({ok:true,result:operation==="upload_create"?await historyUploadUrl(access,result):result});
 }catch(error){return response({ok:false,code:error instanceof HistoryRequestError?error.code:"history_input_invalid"},error instanceof HistoryRequestError?error.status:400);}
}
