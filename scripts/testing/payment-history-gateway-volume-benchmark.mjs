import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {nativeGateway,gatewayPort,byteHash} from '../../tests/foundation/helpers/payment-history-gateway-transport.mjs';
import {syntheticBaselineVolume} from '../../tests/foundation/helpers/payment-history-volume-fixture.mjs';
import {load} from '../../tests/foundation/helpers/payment-history-harness.mjs';

const output=process.argv[2],mode=process.argv[3]??'all';
const checkout=resolve(process.cwd()).toLowerCase(),destination=output?resolve(output).toLowerCase():'';
if(!output||!isAbsolute(output)||destination===checkout||destination.startsWith(checkout+'/')||destination.startsWith(checkout+'\\')||!['all','inspect'].includes(mode))throw Error('Absolute evidence directory outside checkout and mode all/inspect required');
if(existsSync(output)&&readdirSync(output).length)throw Error('Evidence output must be new or empty; historical results are immutable');
mkdirSync(output,{recursive:true});
const base='ca9f239b5cbe2e250f3429b26d853e7962df32d6',path='tools/PaymentHistoryWorker/gateway-port.ts';
const sources={identity:execFileSync('git',['show',base+':'+path],{encoding:'utf8'}),gzip:readFileSync(path,'utf8')};
const pipelinePath='src/server/payment-history/migration-worker.ts',pipelineSources={identity:execFileSync('git',['show',base+':'+pipelinePath],{encoding:'utf8'}),gzip:readFileSync(pipelinePath,'utf8')};
function pipeline(source){
 const loaded={exports:{}},require=createRequire(import.meta.url);
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,Buffer,AbortController,Error,setTimeout,clearTimeout,require(name){if(name==='server-only')return {};if(name.startsWith('node:'))return require(name);if(['./ledger-contract','./local-export-reader'].includes(name))return load('src/server/payment-history/'+name.slice(2)+'.ts');throw Error('Unexpected synthetic pipeline dependency');}});
 return loaded.exports.runMigrationWorkerOnce;
}
const fixture=await syntheticBaselineVolume();
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const run={run_id:id(2),shop_id:fixture.manifest.shopId,lease_token:id(3),lease_fence:'1',export_version:'history-local-export-v2',upload:{upload_id:id(4),object_key:`history/${fixture.manifest.shopId}/${id(4)}`,file_sha256:fixture.metadata.archiveSha256,byte_length:String(fixture.archive.length)}};
// Registered hypothetical link, NOT a measurement of the live DB/network:
// 300ms fixed RTT, 50KiB/s upload. All SQL is a constant owned stub. A fixed
// 3-4s SQL cost is separately reported and cannot be solved by compression.
const model={roundTripMs:300,uploadBytesPerSecond:50*1024,perAttemptDeadlineMs:15000,analysisDeadlineMs:120000,maxRows:200,maxBatchEstimateBytes:6*1024*1024};
const report={startedAtUtc:new Date().toISOString(),qualification:'SYNTHETIC_RPC_STUB_ONLY_NOT_REAL_SQL',node:process.version,workerd:{compatibilityDate:'2026-06-10',nodejsCompat:true},base,fixture:fixture.metadata,model,sourceHashes:Object.fromEntries(Object.entries(sources).map(([key,value])=>[key,byteHash(value)])),pipelineHashes:Object.fromEntries(Object.entries(pipelineSources).map(([key,value])=>[key,byteHash(value)])),runs:[]};
writeFileSync(resolve(output,'volume-protocol.private.json'),JSON.stringify(report,null,2));

async function measure(encoding,throttled){
 const native=await nativeGateway({run}),calls=[];let downloaded=false;
 const transport=gatewayPort(async(url,options)=>{
  options.signal.throwIfAborted();
  if(String(url).endsWith('/synthetic-source')){downloaded=true;return new Response(fixture.archive);}
  const wire=Buffer.from(options.body),decoded=options.headers['content-encoding']==='gzip'?gunzipSync(wire):wire,input=JSON.parse(decoded);
  assert.ok(wire.length<=8388608&&decoded.length<=8388608);
  if(input.payload.rows){assert.ok(input.payload.rows.length<=200);if(input.operation==='stage_objects')assert.ok(input.payload.rows.reduce((n,row)=>n+Buffer.byteLength(JSON.stringify(row.line))+256,0)<=6*1024*1024);}
  if(input.operation==='stage_vector_v2'){assert.ok(input.payload.chunks.length<=4);assert.ok(input.payload.chunks.every(c=>c.rows.length>0&&c.rows.length<=200));assert.ok(Buffer.byteLength(JSON.stringify(input.payload))<=6*1024*1024);}
  const cost=throttled?model.roundTripMs+wire.length*1000/model.uploadBytesPerSecond:0;
  const canonical=input.operation==='stage_vector_v2'?input.payload.chunks.map(chunk=>({operation:input.payload.phase,rows:chunk.rows.length,payloadHash:byteHash(JSON.stringify({run_id:input.payload.run_id,lease_token:input.payload.lease_token,lease_fence:input.payload.lease_fence,rows:chunk.rows}))})):null;
  const call={operation:input.operation,rows:input.payload.rows?.length??0,canonical,wireBytes:wire.length,decodedBytes:decoded.length,payloadHash:byteHash(JSON.stringify(input.payload)),delayMs:cost};calls.push(call);
  const started=performance.now();if(cost)await delay(cost,undefined,{signal:options.signal});const response=await native.dispatch(options);call.elapsedMs=performance.now()-started;
  return response;
 },{source:sources[encoding]});
 const started=performance.now();
 try{
  const result=await pipeline(pipelineSources[encoding])({memoryBytes:transport.memoryBytes,rpc:(operation,payload,signal)=>transport.call('migration',operation,payload,signal),download:(key,signal)=>transport.download(key,20*1024*1024,signal)});
  return {encoding,throttled,result,elapsedMs:performance.now()-started,downloaded,wireBytes:calls.reduce((n,c)=>n+c.wireBytes,0),decodedBytes:calls.reduce((n,c)=>n+c.decodedBytes,0),maxRows:Math.max(...calls.map(c=>c.rows)),calls};
 }finally{await native.mf.dispose();}
}

// First capture the full unchanged pipeline without injected latency. Identity
// and gzip must yield the same payload hashes for each staged chunk and finish.
for(const encoding of ['identity','gzip']){const result=await measure(encoding,false);report.runs.push(result);writeFileSync(resolve(output,`volume-${encoding}-unthrottled.private.json`),JSON.stringify(result,null,2));console.log(JSON.stringify({encoding,throttled:false,result:result.result,elapsedMs:result.elapsedMs,wireBytes:result.wireBytes}));assert.equal(result.result.state,'analysed');}
const stages=r=>r.calls.flatMap(c=>c.canonical??(['stage_objects','stage_movements','finish'].includes(c.operation)?[{operation:c.operation,rows:c.rows,payloadHash:c.payloadHash}]:[]));
assert.deepEqual(stages(report.runs[0]),stages(report.runs[1]));
if(mode==='all')for(const encoding of ['identity','gzip']){const result=await measure(encoding,true);report.runs.push(result);writeFileSync(resolve(output,`volume-${encoding}-throttled.private.json`),JSON.stringify(result,null,2));console.log(JSON.stringify({encoding,throttled:true,result:result.result,elapsedMs:result.elapsedMs,wireBytes:result.wireBytes}));}
report.completedAtUtc=new Date().toISOString();
report.fixedDatabaseCostLowerBoundMs={stageRequests:stages(report.runs[0]).length-1,threeSeconds:(stages(report.runs[0]).length-1)*3000,fourSeconds:(stages(report.runs[0]).length-1)*4000};
writeFileSync(resolve(output,'volume-results.private.json'),JSON.stringify(report,null,2));
if(mode==='all'){assert.equal(report.runs[2].result.state,'failed');assert.equal(report.runs[2].result.code,'history_worker_timeout');assert.equal(report.runs[3].result.state,'analysed');assert.ok(report.runs[3].elapsedMs<120000);assert.deepEqual(stages(report.runs[0]),stages(report.runs[3]));}
