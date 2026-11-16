import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {load} from './helpers/payment-history-harness.mjs';
const {WorkerAcquisitionUnavailableError}=load('tools/PaymentHistoryWorker/gateway-port.ts');
const {redactedWorkerEvent}=load('tools/PaymentHistoryWorker/diagnostics.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function boot(error,{once=false}={}){
 const events=[],waits=[],callbacks={},timers=[];let acquisitions=0,migrations=0;
 const process={argv:once?['--once']:[],env:{PAYMENT_HISTORY_WORKER_GATEWAY_URL:'synthetic',PAYMENT_HISTORY_WORKER_GATEWAY_SECRET:'synthetic'},once(name,action){callbacks[name]=action;},stdout:{write(line){events.push(JSON.parse(line));}},stderr:{write(line){events.push(JSON.parse(line));}}};
 const m={exports:{}};
 const imports={
  '../../src/server/payment-history/job-worker':{async runHistoryWorkerOnce(){acquisitions++;if(acquisitions===1)throw error;return {kind:'idle'};}},
  '../../src/server/payment-history/migration-worker':{async runMigrationWorkerOnce(){migrations++;return {state:'idle'};}},
  './gateway-port':{WorkerAcquisitionUnavailableError,createWorkerGatewayPort(){return {memoryBytes:()=>1024};}},
  './diagnostics':{redactedWorkerEvent,createWorkerDiagnosticSink:()=>()=>{}},
  'node:timers/promises':{setTimeout(ms,_value,{signal}){return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});waits.push({ms,release(){signal.removeEventListener('abort',abort);resolve();}});});}},
 };
 runInNewContext(ts.transpileModule(readFileSync('tools/PaymentHistoryWorker/main.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require(name){assert.ok(name in imports,name);return imports[name];},process,AbortController,Error,setTimeout(callback,ms){timers.push({callback,ms});return callback;},clearTimeout(){}});
 return {events,waits,process,stop(){callbacks.SIGTERM();},get acquisitions(){return acquisitions;},get migrations(){return migrations;}};
}

for(const [lane,operation,code] of [['import','claim_upload','history_worker_gateway_unavailable'],['import','claim','history_worker_gateway_unavailable'],['migration','claim','history_worker_timeout']])test('daemon waits a complete lease after uncertain '+lane+'.'+operation+' then resumes normal acquisition',async()=>{
 const x=boot(new WorkerAcquisitionUnavailableError(lane,operation,code));await tick();
 assert.equal(x.acquisitions,1);assert.equal(x.migrations,0);assert.equal(x.process.exitCode,undefined);assert.equal(x.waits.length,1);assert.equal(x.waits[0].ms,120000);
 assert.deepEqual(x.events,[{event:'history_worker_unavailable',lane,operation,code,backoff_ms:120000}]);
 await tick();assert.equal(x.acquisitions,1,'No new nonce/claim while unavailable');
 x.waits[0].release();await tick();assert.equal(x.acquisitions,2);assert.equal(x.migrations,1);assert.equal(x.process.exitCode,undefined);assert.equal(x.events.at(-1).event,'migration_idle');
 x.stop();await tick();assert.equal(x.events.at(-1).event,'history_worker_exit');assert.equal(x.events.at(-1).exit_code,0);
});
test('process cancellation interrupts unavailable cooldown and never acquires again',async()=>{
 const x=boot(new WorkerAcquisitionUnavailableError('import','claim_upload'));await tick();x.stop();await tick();
 assert.equal(x.acquisitions,1);assert.equal(x.process.exitCode,0);assert.equal(x.events.at(-1).cause,'sigterm');assert.equal(x.events.at(-1).code,'history_worker_cancelled');
});
for(const code of ['history_worker_rpc_rejected','history_worker_response_invalid','history_worker_gateway_unavailable'])test('untyped terminal or owned-operation '+code+' remains fatal',async()=>{
 const x=boot(Error(code));await tick();assert.equal(x.acquisitions,1);assert.equal(x.waits.length,0);assert.equal(x.process.exitCode,1);assert.equal(x.events.at(-1).code,code);
});
test('once mode never turns an uncertain acquisition into a daemon retry',async()=>{
 const x=boot(new WorkerAcquisitionUnavailableError('import','claim'),{once:true});await tick();assert.equal(x.waits.length,0);assert.equal(x.process.exitCode,1);
});
test('unavailable diagnostics contain closed metadata and cannot describe owned work as retryable',()=>{
 const safe={event:'history_worker_unavailable',lane:'import',operation:'claim_upload',code:'history_worker_gateway_unavailable',backoff_ms:120000};
 assert.deepEqual(JSON.parse(JSON.stringify(redactedWorkerEvent({...safe,nonce:'private',message:'private',payload:'private'}))),safe);
 for(const changed of [{operation:'finish'},{lane:'migration'},{backoff_ms:1},{code:'private'}])assert.equal(redactedWorkerEvent({...safe,...changed}),null);
});
