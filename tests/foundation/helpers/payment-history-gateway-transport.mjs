import {createHash,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import ts from 'typescript';

const require=createRequire(import.meta.url);
export const transportSecret='synthetic-gzip-gateway-key-at-least32bytes';
export const transportNonce='10000000-0000-4000-8000-000000000019';
export const byteHash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const wireSignature=(time,bytes,nonce=transportNonce)=>createHmac('sha256',transportSecret).update(`history-worker-v1\n${time}\n${nonce}\n${byteHash(bytes)}`).digest('hex');

// Only the real transport, signature, admission and decoder run in workerd.
// This owned RPC stub never opens Supabase or asserts SQL/lease qualification.
export async function nativeGateway({run=null}={}){
 const entry=`import {Buffer} from 'node:buffer';import process from 'node:process';
 import {handleWorkerGateway} from './src/server/payment-history/worker-gateway';
 globalThis.Buffer=Buffer;process.env.PAYMENT_HISTORY_WORKER_GATEWAY_SECRET=${JSON.stringify(transportSecret)};
 export default {async fetch(request){globalThis.__sqlCalls=0;try{return Response.json(await handleWorkerGateway(request));}
 catch(e){return Response.json({ok:false,sqlCalls:globalThis.__sqlCalls},{status:e.status??500});}}};`;
 const empty={name:'server-only-test',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}};
 const admin={name:'owned-database-test',setup(b){b.onResolve({filter:/^@\/lib\/supabase\/admin$/},()=>({path:'owned-db',namespace:'test-db'}));b.onLoad({filter:/.*/,namespace:'test-db'},()=>({loader:'js',contents:`import {createHash} from 'node:crypto';export function createSupabaseAdminClient(){return {async rpc(name,args){globalThis.__sqlCalls++;return {data:{ok:true,rpc_name:name,request_id:args.p_request_id,lane:args.p_lane,operation:args.p_operation,payload_hash:createHash('sha256').update(JSON.stringify(args.p_payload)).digest('hex'),rows:args.p_payload.rows?.length??0,...(args.p_operation==='claim'?{run:${JSON.stringify(run)}}:{}),...(args.p_operation==='stage_vector_v2'?{phase:args.p_payload.phase,accepted_chunks:args.p_payload.chunks.length,last_ordinal:args.p_payload.chunks.at(-1).rows.at(-1).ordinal,sql_elapsed_ms:0}:{})},error:null};},storage:{from(bucket){if(bucket!=='payment-history-sources')throw Error('Wrong synthetic bucket');return {async createSignedUrl(){return {data:{signedUrl:'http://127.0.0.1/synthetic-source'},error:null};}};}}};}`}));}};
 const compiled=await build({stdin:{contents:entry,loader:'ts',resolveDir:process.cwd()},plugins:[empty,admin],bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto','node:buffer','node:process']});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-06-10',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],outboundService(){throw Error('Synthetic gateway cannot contact an external service');}}));
 const dispatch=options=>mf.dispatchFetch('http://localhost/api/internal/payment-history/worker',{method:options.method,headers:options.headers,body:options.body});
 return {mf,dispatch,async send(bytes,encoding,signatureBytes=bytes){const time=String(Date.now());return dispatch({method:'POST',headers:{'content-type':'application/json','x-history-time':time,'x-history-nonce':transportNonce,'x-history-signature':wireSignature(time,signatureBytes),...(encoding?{'content-encoding':encoding}:{})},body:bytes});}};
}

export function gatewayPort(fetch,{source=readFileSync('tools/PaymentHistoryWorker/gateway-port.ts','utf8'),extra={}}={}){
 const signature={exports:{}};
 const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(compile(readFileSync('src/server/payment-history/worker-signature.ts','utf8')),{module:signature,exports:signature.exports,require(name){return name==='server-only'?{}:require(name);}});
 const loaded={exports:{}};
 runInNewContext(compile(source),{module:loaded,exports:loaded.exports,Buffer,URL,AbortSignal,Error,Date,process,fetch,require(name){if(name==='../../src/server/payment-history/worker-signature')return signature.exports;if(name.startsWith('node:'))return require(name);throw Error('Unexpected synthetic transport import');},...extra});
 return loaded.exports.createWorkerGatewayPort('http://127.0.0.1/api/internal/payment-history/worker',transportSecret,true);
}
