import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('the product signed-source PUT runs in workerd, preserves bytes and refuses every redirect without forwarding', {timeout:45000}, async()=>{
 const source=`import {putHistorySource} from './src/server/payment-history/baseline-source-put';
 export default {async fetch(request){const bytes=Uint8Array.from({length:869952},(_,i)=>i%251);
 const cancel=new AbortController();if(new URL(request.url).searchParams.has('abort'))cancel.abort();
 try{return Response.json(await putHistorySource('https://synthetic.supabase.co/storage/v1/object/upload/sign/payment-history-sources/history/synthetic?token=synthetic-only-019',bytes,AbortSignal.any([request.signal,cancel.signal,AbortSignal.timeout(15000)])));}
 catch(error){return Response.json({name:error.name,message:error.message},{status:500});}}};`;
 const compiled=await build({stdin:{contents:source,loader:'ts',resolveDir:process.cwd()},plugins:[{name:'server-only-test',setup(builder){builder.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));builder.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}],bundle:true,write:false,format:'esm',platform:'neutral',external:['node:buffer']});
 let calls=0,status=200;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-06-10',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],outboundService:async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://synthetic.supabase.co');assert.equal(url.searchParams.get('token'),'synthetic-only-019');
  assert.equal(request.method,'PUT');assert.equal(request.headers.get('content-type'),'application/zip');assert.equal(request.headers.get('x-upsert'),'false');
  assert.deepEqual(new Uint8Array(await request.arrayBuffer()),Uint8Array.from({length:869952},(_,i)=>i%251));calls++;
  return new Response(null,{status,headers:status>=300&&status<400?{location:'https://foreign.invalid/must-never-be-called'}:{}});
 }}));
 try{
  for(status of [200,201,204,300,301,302,303,304,307,308,399,400,403,500]){
   const before=calls,response=await mf.dispatchFetch('http://localhost/'),body=await response.json();
   assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,{ok:status>=200&&status<300,status});assert.equal(calls,before+1,'exactly one owned target request; no redirect follow');
  }
  const before=calls,response=await mf.dispatchFetch('http://localhost/?abort=1'),body=await response.json();
  assert.equal(response.status,500);assert.equal(body.name,'AbortError');assert.equal(calls,before,'cancelled source never reaches Storage');
 }finally{await mf.dispose();}
});
