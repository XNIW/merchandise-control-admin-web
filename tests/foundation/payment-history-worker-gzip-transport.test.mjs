import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import test from 'node:test';
import {nativeGateway,gatewayPort,byteHash,wireSignature,transportNonce} from './helpers/payment-history-gateway-transport.mjs';

const limit=8388608;
const payload=()=>({run_id:'10000000-0000-4000-8000-000000000002',rows:Array.from({length:200},(_,i)=>({table:'movements',ordinal:i+1,sourceOrdinal:i+1,line:JSON.stringify({id:String(i+1),reference:'SYNTHETIC-ONLY-'.repeat(20),label:'fixture "quote" \\ slash 中文',active:1})}))});
const envelope=p=>Buffer.from(JSON.stringify({lane:'migration',operation:'stage_objects',payload:p}));

test('native workerd authenticates and bounds gzip before its sole privileged RPC', {timeout:45000},async t=>{
 const native=await nativeGateway();
 async function rejected(bytes,encoding,status,signatureBytes=bytes){const response=await native.send(bytes,encoding,signatureBytes),body=await response.json();assert.equal(response.status,status,JSON.stringify(body));assert.equal(body.sqlCalls,0);}
 try{
  await t.test('Node gzip preserves exact 200-row Unicode/escape payload',async()=>{
   const p=payload(),raw=envelope(p),compressed=gzipSync(raw),response=await native.send(compressed,'gzip'),body=await response.json();
   assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.rpc_name,'payment_history_worker_gateway_v1');
   assert.equal(body.data.request_id,transportNonce);assert.equal(body.data.payload_hash,byteHash(JSON.stringify(p)));assert.equal(body.data.rows,200);assert.ok(compressed.length<raw.length/4);
  });
  await t.test('legacy absent/explicit identity encoding is preserved',async()=>{for(const encoding of [undefined,'identity']){const p={rows:[]},r=await native.send(envelope(p),encoding);assert.equal(r.status,200);assert.equal((await r.json()).data.payload_hash,byteHash(JSON.stringify(p)));}});
  await t.test('signing decoded JSON instead of exact compressed wire bytes is denied',async()=>{const raw=envelope(payload());await rejected(gzipSync(raw),'gzip',403,raw);});
  await t.test('bad HMAC is rejected before malformed or oversized decompression',async()=>{for(const bytes of [Buffer.from('not gzip'),gzipSync(Buffer.alloc(limit+1,0x61))])await rejected(bytes,'gzip',403,Buffer.from('other signature input'));});
  await t.test('decoded 8MiB exact boundary reaches admission, one byte over does not',async()=>{
   // Gateway byte boundary only: this stub does not accept a SQL staging limit.
   const base=envelope({padding:''}),raw=envelope({padding:'a'.repeat(limit-base.length)});assert.equal(raw.length,limit);
   const r=await native.send(gzipSync(raw),'gzip');assert.equal(r.status,200);await r.body.cancel();
   await rejected(gzipSync(envelope({padding:'a'.repeat(limit-base.length+1)})),'gzip',413);
  });
  await t.test('a 64MiB gzip bomb stops at the decoded bound without SQL',async()=>{await rejected(gzipSync(Buffer.alloc(64*1024*1024,0x61)),'gzip',413);});
  await t.test('wire 8MiB exact boundary is retained independently of decoded bound',async()=>{
   const base=envelope({padding:''}),raw=envelope({padding:'a'.repeat(limit-base.length)});
   const r=await native.send(raw);assert.equal(r.status,200);await r.body.cancel();await rejected(Buffer.alloc(limit+1,0x20),'gzip',413);
  });
  await t.test('truncated/corrupt gzip and invalid decoded UTF8 fail closed',async()=>{
   const raw=gzipSync(envelope({rows:[]})),badCrc=Buffer.from(raw);badCrc[badCrc.length-8]^=1;
   for(const bytes of [Buffer.from('not gzip'),raw.subarray(0,raw.length-1),badCrc,gzipSync(Buffer.from([0xff,0xfe]))])await rejected(bytes,'gzip',400);
  });
  await t.test('encoding is closed and gzip is decoded once',async()=>{for(const encoding of ['br','gzip, gzip'])await rejected(envelope({rows:[]}),encoding,415);await rejected(gzipSync(gzipSync(envelope({rows:[]}))),'gzip',400);});
  await t.test('compressed financial operation and non-closed envelope remain denied',async()=>{for(const input of [{lane:'migration',operation:'apply',payload:{}},{lane:'migration',operation:'stage_objects',payload:{},admin:true}])await rejected(gzipSync(Buffer.from(JSON.stringify(input))),'gzip',400);});
  await t.test('actual Node port and native gateway retain wire bytes/nonce on lost reply',async()=>{
   const attempts=[],p=payload(),port=gatewayPort(async(_url,options)=>{attempts.push({body:Buffer.from(options.body),headers:{...options.headers}});const response=await native.dispatch(options);if(attempts.length===1){await response.body.cancel();throw Error('Synthetic reply lost after admission');}return response;});
   const r=await port.call('migration','stage_objects',p);assert.equal(r.rows,200);assert.equal(r.payload_hash,byteHash(JSON.stringify(p)));assert.equal(attempts.length,2);
   assert.deepEqual(attempts[0].body,attempts[1].body);assert.equal(attempts[0].headers['x-history-nonce'],attempts[1].headers['x-history-nonce']);assert.equal(attempts[0].headers['content-encoding'],'gzip');
   for(const a of attempts)assert.equal(a.headers['x-history-signature'],wireSignature(a.headers['x-history-time'],a.body,a.headers['x-history-nonce']));
   assert.deepEqual(JSON.parse(gunzipSync(attempts[0].body)).payload,p);
  });
  await t.test('native transport carries the versioned four canonical chunks without changing their hash',async()=>{
   const p={run_id:'10000000-0000-4000-8000-000000000002',lease_token:'10000000-0000-4000-8000-000000000003',lease_fence:'1',phase:'stage_objects',chunks:Array.from({length:4},(_,chunk)=>({rows:payload().rows.map((row,i)=>({...row,ordinal:chunk*200+i+1}))}))};
   const port=gatewayPort((_url,options)=>native.dispatch(options)),result=await port.call('migration','stage_vector_v2',p);
   assert.equal(result.accepted_chunks,4);assert.equal(result.last_ordinal,800);assert.equal(result.phase,p.phase);assert.equal(result.payload_hash,byteHash(JSON.stringify(p)));
   // This proves transport/admission only; the real SQL negative/atomicity gate
   // separately owns validation of each chunk and the transactional ACK.
  });
 }finally{await native.mf.dispose();}
});

test('Node sender preserves identity for small bodies and checks decoded limit before compression',async()=>{
 const calls=[],port=gatewayPort(async(_url,options)=>{calls.push(options);return Response.json({data:{ok:true},downloads:[]});});
 await port.call('migration','heartbeat',{});assert.equal(calls[0].headers['content-encoding'],undefined);
 await assert.rejects(()=>port.call('migration','stage_objects',{padding:'a'.repeat(limit)}),/history_worker_payload_limit/);assert.equal(calls.length,1);
 const controller=new AbortController();controller.abort();await assert.rejects(()=>port.call('migration','stage_objects',payload(),controller.signal));assert.equal(calls.length,1);
});
