import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Open} from 'unzipper-esm';
import {zip} from './payment-history-harness.mjs';
const byteHash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Expand the checked-in synthetic CLR export, never a shop profile/export.
// Only aggregate target byte/row counts come from the diagnostic hypothesis.
export async function syntheticBaselineVolume({rows=25947,movementBytes=20274917,shopId}={}){
 const source=await Open.buffer(readFileSync('tests/fixtures/payment-history/local-export-v2/synthetic-local-baseline.w7history.zip'));
 const parts=await Promise.all(source.files.map(async file=>({name:file.path,bytes:await file.buffer()})));
 const read=name=>parts.find(p=>p.name===name+'.ndjson').bytes.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const manifest=JSON.parse(parts.find(p=>p.name==='manifest.json').bytes);
 if(shopId!==undefined){if(typeof shopId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(shopId))throw Error('Synthetic fixture shop must be a UUID');manifest.shopId=shopId;}
 const scope=read('scopes')[0],binding=read('bindings')[0],operation=read('operations')[0],batch=read('batches')[0],template=read('movements')[0],file=read('files')[0];
 if(shopId!==undefined)for(const row of [scope,binding,operation,batch,template])if('shop_id' in row)row.shop_id=shopId;
 scope.id='synthetic-scope';binding.id='synthetic-binding';binding.scope_id=scope.id;
 const files=Array.from({length:4},(_,i)=>({...file,id:byteHash('synthetic-volume-file-'+i).slice(0,32),source_sha256:byteHash('synthetic-volume-content-'+i),source_rows:String(Math.floor(rows/4)+(i<rows%4?1:0))}));
 const movements=Array.from({length:rows},(_,i)=>({...template,id:String(i+1),file_id:files[i%4].id,merchant_scope_id:scope.id,binding_id:binding.id,
  external_id:byteHash('synthetic-volume-movement-'+i).slice(0,16),source_row:String(Math.floor(i/4)+2),source_sheet:'Synthetic',signed_amount_clp:'1000',signed_fee_clp:'10',signed_net_clp:'990'}));
 const lines=movements.map(row=>JSON.stringify(row)+'\n'),originalBytes=lines.reduce((n,line)=>n+Buffer.byteLength(line),0),padding=movementBytes-originalBytes;
 if(padding<0||Math.ceil(padding/rows)>240)throw Error('Synthetic volume target cannot fit the validated text field');
 for(let i=0;i<rows;i++){movements[i].source_sheet+='x'.repeat(Math.floor(padding/rows)+(i<padding%rows?1:0));lines[i]=JSON.stringify(movements[i])+'\n';}
 operation.inserted_count=String(rows);operation.signed_amount_clp=String(rows*1000);const receipt=JSON.parse(operation.receipt_json);
 receipt.InsertedCount=rows;receipt.SignedAmountClp=rows*1000;receipt.RejectedCount=0;operation.receipt_json=JSON.stringify(receipt);
 const tables={scopes:[scope],bindings:[binding],operations:[operation],batches:[batch],files,movements,observations:[]};
 for(const part of parts.filter(p=>p.name.endsWith('.ndjson'))){const table=part.name.slice(0,-7);part.bytes=Buffer.from(table==='movements'?lines.join(''):tables[table].map(row=>JSON.stringify(row)+'\n').join(''));
  Object.assign(manifest.entries.find(e=>e.name===part.name),{rows:String(tables[table].length),byteLength:String(part.bytes.length),sha256:byteHash(part.bytes)});}
 manifest.backupSha256=byteHash('synthetic-volume-backup');manifest.backupByteLength='1';
 parts.find(p=>p.name==='manifest.json').bytes=Buffer.from(JSON.stringify(manifest));
 const archive=zip(parts);
 return {archive,manifest,metadata:{syntheticOnly:true,rows,movementBytes:parts.find(p=>p.name==='movements.ndjson').bytes.length,archiveBytes:archive.length,archiveSha256:byteHash(archive),entries:manifest.entries.map(({name,rows,byteLength})=>({name,rows,byteLength}))}};
}
