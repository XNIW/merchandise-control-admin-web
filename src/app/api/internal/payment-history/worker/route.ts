import {handleWorkerGateway,WorkerGatewayError} from "@/server/payment-history/worker-gateway";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 try{return Response.json(await handleWorkerGateway(request),{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
 catch(error){return Response.json({ok:false,code:"history_worker_request_rejected"},{status:error instanceof WorkerGatewayError?error.status:503,headers:{"Cache-Control":"no-store"}});}
}
