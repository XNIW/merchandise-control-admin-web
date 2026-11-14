import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {basename,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {readOwnedHistoryWorkbook} from '../../scripts/testing/asus019-owned-workbook.mjs';
const removeFixture=root=>{assert.equal(dirname(root),realpathSync(tmpdir()));assert.equal(realpathSync(root),root);assert.match(basename(root),/^(?:W7HC\.[0-9a-f]{32}|asus019-unowned-[A-Za-z0-9]+)$/);rmSync(root,{recursive:true});};

test('owned original and corrected CLR workbooks retain the same byte verification',()=>{
 const root=join(realpathSync(tmpdir()),'W7HC.'+randomUUID().replaceAll('-','')),output=join(root,'output'),bytes=Buffer.from('synthetic fixture bytes'),hash=createHash('sha256').update(bytes).digest('hex');mkdirSync(output,{recursive:true});
 try{for(const leaf of ['new-'+randomUUID().replaceAll('-','')+'.xlsx','corrected-legacy.xlsx']){const path=join(output,leaf);writeFileSync(path,bytes);assert.deepEqual(readOwnedHistoryWorkbook(path,hash),bytes);assert.throws(()=>readOwnedHistoryWorkbook(path,'0'.repeat(64)),/source_bytes/);}}
 finally{removeFixture(root);}
});
test('originals, invented names and sibling directories never become owned fixture inputs',()=>{
 const temporary=realpathSync(tmpdir()),root=mkdtempSync(join(temporary,'asus019-unowned-')),bytes=Buffer.from('synthetic fixture bytes'),hash=createHash('sha256').update(bytes).digest('hex');
 const owned=join(temporary,'W7HC.'+randomUUID().replaceAll('-',''));mkdirSync(join(owned,'output'),{recursive:true});
 try{for(const path of [join(root,'corrected-legacy.xlsx'),join(owned,'output','original.xlsx'),join(owned,'corrected-legacy.xlsx')]){writeFileSync(path,bytes);assert.throws(()=>readOwnedHistoryWorkbook(path,hash),/source_hash/);}assert.throws(()=>readOwnedHistoryWorkbook('corrected-legacy.xlsx',hash),/source_hash/);}
 finally{removeFixture(root);removeFixture(owned);}
});
