import "server-only";
import {createHash,createHmac} from "node:crypto";
export function workerRequestSignature(secret:string,timestamp:string,nonce:string,body:Uint8Array){
 return createHmac("sha256",secret).update(`history-worker-v1\n${timestamp}\n${nonce}\n${createHash("sha256").update(body).digest("hex")}`).digest("hex");
}
