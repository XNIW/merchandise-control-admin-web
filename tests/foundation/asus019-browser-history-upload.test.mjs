import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedHistoryMediaType,putBrowserHistorySource} from '../../scripts/testing/asus019-browser-history-upload.mjs';

const archive='freeze-'+'a'.repeat(32)+'.w7history.zip';
const workbook='new-'+'b'.repeat(32)+'.xlsx';
test('owned archive and workbook use the existing bucket MIME allowlist',()=>{
 assert.equal(ownedHistoryMediaType(archive),'application/zip');
 assert.equal(ownedHistoryMediaType(workbook),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 for(const invalid of ['../'+archive,'unknown.bin',archive+'\n','new-x.xlsx'])
  assert.throws(()=>ownedHistoryMediaType(invalid),/history_test_owned_export_type/);
});
test('multipart retains exact bytes, filename and MIME in the browser File',async t=>{
 const seen=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const file=options.body.get('');seen.push({url,method:options.method,headers:options.headers,
   cache:options.body.get('cacheControl'),name:file.name,type:file.type,bytes:[...new Uint8Array(await file.arrayBuffer())]});
  return new Response('{}',{status:200});
 });
 for(const fileName of [archive,workbook])assert.deepEqual(await putBrowserHistorySource({
  signedUrl:'http://127.0.0.1:9/synthetic-only',bytes:[0,1,254,255],fileName,contentType:ownedHistoryMediaType(fileName)}),
  {ok:true,httpStatus:200,storageCode:null});
 assert.equal(seen[0].type,'application/zip');
 assert.equal(seen[1].type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 for(const entry of seen){assert.deepEqual(entry.bytes,[0,1,254,255]);assert.equal(entry.cache,'3600');
  assert.equal(entry.method,'PUT');assert.deepEqual(entry.headers,{'x-upsert':'false'});}
 assert.equal(seen[0].name,archive);assert.equal(seen[1].name,workbook);
 // The previous fixture manufactured a File with no MIME, unlike a chooser.
 assert.equal(new File([new Uint8Array([1])],archive).type,'');
});
test('upload failure exposes only status and a closed code, never URL or body',async t=>{
 const secret='signed-token-must-not-be-logged';
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'InvalidMimeType',
  message:secret,signed_url:'http://127.0.0.1:9/?token='+secret}),{status:400}));
 const result=await putBrowserHistorySource({signedUrl:'http://127.0.0.1:9/?token='+secret,
  bytes:[1],fileName:archive,contentType:'application/zip'});
 assert.deepEqual(result,{ok:false,httpStatus:400,storageCode:'InvalidMimeType'});
 assert.ok(!JSON.stringify(result).includes(secret));
});
test('unknown error text and transport exceptions cannot become successful uploads',async t=>{
 const request=t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({
  code:'token-sensitive-value',error:'Unexpected secret text'}),{status:503}));
 const input={signedUrl:'http://127.0.0.1:9',bytes:[1],fileName:archive,contentType:'application/zip'};
 assert.deepEqual(await putBrowserHistorySource(input),{ok:false,httpStatus:503,storageCode:null});
 request.mock.mockImplementation(async()=>{throw Error('private URL must not escape');});
 assert.deepEqual(await putBrowserHistorySource(input),{ok:false,httpStatus:null,storageCode:'transport_error'});
});
