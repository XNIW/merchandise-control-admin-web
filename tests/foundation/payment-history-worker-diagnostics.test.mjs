import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {load} from './helpers/payment-history-harness.mjs';
const {redactedWorkerEvent,createWorkerDiagnosticSink}=load('tools/PaymentHistoryWorker/diagnostics.ts');
const clone=value=>JSON.parse(JSON.stringify(value));
const stopped=()=>({event:'history_worker_stopped',code:'history_worker_unexpected_stop',cause:'unexpected',exit_code:1});
function owned(action){const root=mkdtempSync(join(tmpdir(),'history-worker-diagnostic-'));try{return action(root);}finally{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});}}
test('fatal metadata is reconstructed from closed fields with no raw message/stack/URL',()=>{
 const value={...stopped(),code:'private database detail https://secret.invalid',message:'private message',stack:'private stack',payload:{financial_sentinel:true},url:'https://private.invalid'};
 assert.deepEqual(clone(redactedWorkerEvent(value)),stopped());assert.equal(redactedWorkerEvent(Error('private error')),null);assert.equal(redactedWorkerEvent({event:'unknown',message:'private'}),null);
 const hostile={toString(){return 'unexpected';},private:'sentinel'};assert.equal(redactedWorkerEvent({...stopped(),cause:hostile}),null);
});
test('fatal event remains available in the persistent atomic ring when stdout/stderr are discarded',()=>owned(root=>{
 const path=join(root,'worker-diagnostics.ndjson'),sink=createWorkerDiagnosticSink(path);sink(stopped());const rows=readFileSync(path,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(rows.length,1);assert.equal(rows[0].event,'history_worker_stopped');assert.equal(rows[0].exit_code,1);assert.match(rows[0].utc,/^\d{4}-/);assert.equal(existsSync(path+'.tmp'),false);
}));
test('diagnostic history is bounded, valid records retained, arbitrary previous content never copied',()=>owned(root=>{
 const path=join(root,'worker-diagnostics.ndjson'),line=JSON.stringify({...stopped(),utc:'2026-11-14T00:00:00.000Z'})+'\n';
 writeFileSync(path,'private_sentinel\n'+line.repeat(Math.ceil(600*1024/line.length)));const sink=createWorkerDiagnosticSink(path);sink({event:'migration_failed',code:'history_worker_timeout',private:'sentinel'});
 const text=readFileSync(path,'utf8');assert.ok(statSync(path).size<=512*1024);assert.equal(text.includes('sentinel'),false);assert.equal(JSON.parse(text.trim().split('\n').at(-1)).code,'history_worker_timeout');
}));
test('unavailable or relative diagnostic destination returns only a closed configuration error',()=>{
 for(const path of ['relative.ndjson',join(tmpdir(),'missing-history-worker-diagnostic-parent','events.ndjson')])assert.throws(()=>createWorkerDiagnosticSink(path),error=>error.message==='history_worker_diagnostics_unavailable');
});
test('actual Node24 CJS records a closed fatal cause before exit even with discarded standard streams',()=>owned(root=>{
 const bundle=join(root,'worker.cjs'),path=join(root,'worker-diagnostics.ndjson');
 execFileSync(process.execPath,['scripts/build-payment-history-worker.mjs',bundle],{encoding:'utf8'});
 const child=spawnSync(process.execPath,['--max-old-space-size=640',bundle,'--once'],{encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,TEMP:root,TMP:root,HISTORY_WORKER_DIAGNOSTICS_FILE:path,UNRELATED_PRIVATE_SENTINEL:'never serialize this'}});
 assert.equal(child.status,1);const event=JSON.parse(child.stderr.trim());assert.equal(event.event,'history_worker_stopped');assert.equal(event.code,'history_worker_configuration_missing');assert.equal(event.exit_code,1);
 const log=readFileSync(path,'utf8');assert.equal(log.includes('never serialize this'),false);assert.equal(log.includes(root.replaceAll('\\','\\\\')),false);assert.equal(JSON.parse(log.trim()).code,event.code);
}));
