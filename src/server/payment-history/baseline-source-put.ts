import "server-only";
import {Buffer} from "node:buffer";

/** The caller has already validated the one owned signed Storage target. */
export async function putHistorySource(url:string,bytes:Uint8Array,signal:AbortSignal) {
  const response=await fetch(url,{method:"PUT",redirect:"manual",signal,
    headers:{"Content-Type":"application/zip","x-upsert":"false"},body:Buffer.from(bytes)});
  return {ok:response.ok&&response.status>=200&&response.status<300,status:response.status};
}
