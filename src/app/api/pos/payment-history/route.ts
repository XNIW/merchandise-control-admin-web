import {deviceHistoryRequest,PosHistoryError} from "@/server/payment-history/device-boundary";
import {createPosRouteRequestContext,posJsonResponse,readPosJsonBody} from "../_shared/pos-route-security";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 const context=createPosRouteRequestContext(request,"pos.payment-history");
 try{return posJsonResponse(await deviceHistoryRequest(await readPosJsonBody(request),new URL("/api/pos/payment-history/source",request.url).href),200,context);}
 catch(error){return posJsonResponse({ok:false,code:error instanceof PosHistoryError?error.code:"history_input_invalid",message:"Historical operation could not complete."},error instanceof PosHistoryError?error.status:400,context);}
}
