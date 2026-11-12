import {URL} from "node:url";
import {projectBaselineSqlResult} from "./local-baseline-contract";
import {closedHistoryObject as closed,historyObject} from "./replica-contract";

export type BaselineSourceStorage={
 info(path:string):Promise<{data:unknown;error:{status?:number;statusCode?:string;name?:string}|null}>;
 createSignedUploadUrl(path:string,options:{upsert:boolean}):Promise<{data:{signedUrl:string}|null;error:unknown}>;
};
const fail=():never=>{throw Error("history_baseline_upload_target_invalid");};
function origin(value:string){
 let url:URL;try{url=new URL(value);}catch{return fail();}
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||
  !(url.protocol==="https:"||url.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(url.hostname)))return fail();
 return url.origin;
}
export function validateBaselineUploadTarget(value:unknown,scope:{shopId:string;deviceId:string},storageOrigin:string){
 const r=closed(value,["upload_id","object_key","upload_required","signed_url"]);
 projectBaselineSqlResult("baseline_upload_create",{upload_id:r.upload_id,object_key:r.object_key},scope);
 if(typeof r.upload_required!=="boolean")return fail();
 if(!r.upload_required){if(r.signed_url!==null)return fail();return r;}
 if(typeof r.signed_url!=="string"||r.signed_url.length>8192)return fail();
 let url:URL;try{url=new URL(r.signed_url);}catch{return fail();}
 if(url.origin!==origin(storageOrigin)||url.username||url.password||url.hash||
  url.pathname!==`/storage/v1/object/upload/sign/payment-history-sources/${r.object_key}`||
  !url.search.startsWith("?token=")||url.search.length<=7||url.search.includes("&")||!url.searchParams.get("token"))return fail();
 return r;
}
export async function baselineSourceExists(value:unknown,scope:{shopId:string;deviceId:string},storage:BaselineSourceStorage){
 const r=projectBaselineSqlResult("baseline_upload_create",value,scope),path=String(r.object_key);
 const info=await storage.info(path);
 // Presence recovers a lost PUT ACK, never source validity. The unchanged
 // verification worker must still download and hash the original object.
 if(info.error===null&&historyObject(info.data))return true;
 // Storage's actual object-info endpoint can wrap its machine-readable404
 // in HTTP400. Admit that specific SDK error; other400/auth/network failures
 // remain failures rather than being reinterpreted as a missing source.
 const missing=info.error?.status===404||info.error?.status===400&&info.error.statusCode==="404"&&info.error.name==="StorageApiError";
 if(info.data!==null||!missing)return fail();
 return false;
}
export async function baselineUploadTarget(value:unknown,scope:{shopId:string;deviceId:string},storage:BaselineSourceStorage,storageOrigin:string){
 const r=projectBaselineSqlResult("baseline_upload_create",value,scope),path=String(r.object_key);
 if(await baselineSourceExists(r,scope,storage))return validateBaselineUploadTarget({...r,upload_required:false,signed_url:null},scope,storageOrigin);
 const signed=await storage.createSignedUploadUrl(path,{upsert:false});
 if(signed.error||!signed.data)return fail();
 return validateBaselineUploadTarget({...r,upload_required:true,signed_url:signed.data.signedUrl},scope,storageOrigin);
}
