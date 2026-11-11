import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './helpers/payment-history-harness.mjs';
import {StorageApiError} from '@supabase/storage-js';
const c=load('src/server/payment-history/baseline-upload-target.ts');
const id=n=>`${n}0000000-0000-4000-8000-000000000019`,scope={shopId:id(1),deviceId:id(2)};
const value={upload_id:id(3),object_key:`history/${id(1)}/${id(3)}`},base='https://synthetic.supabase.co';
const url=()=>`${base}/storage/v1/object/upload/sign/payment-history-sources/${value.object_key}?token=synthetic-signed-token`;
test('an existing owned source resolves lost PUT acknowledgement without overwrite or another signed upload',async()=>{
 let signed=0;const storage={info:async path=>{assert.equal(path,value.object_key);return {data:{id:'synthetic-object'},error:null};},createSignedUploadUrl:async()=>{signed++;throw Error('not expected');}};
 const r=await c.baselineUploadTarget(value,scope,storage,base);assert.equal(r.upload_required,false);assert.equal(r.signed_url,null);assert.equal(signed,0);
});
test('a missing owned source receives one non-overwriting URL at the configured origin',async()=>{
 let signed=0;const storage={info:async()=>({data:null,error:{status:404}}),createSignedUploadUrl:async(path,options)=>{signed++;assert.equal(path,value.object_key);assert.equal(options.upsert,false);return {data:{signedUrl:url()},error:null};}};
 const r=await c.baselineUploadTarget(value,scope,storage,base);assert.equal(r.upload_required,true);assert.equal(r.signed_url,url());assert.equal(signed,1);
});
test('storage failure does not get reinterpreted as missing source or create another object',async()=>{
 for(const status of [400,401,403,429,500]){
  let signed=0;await assert.rejects(()=>c.baselineUploadTarget(value,scope,{info:async()=>({data:null,error:{status}}),createSignedUploadUrl:async()=>{signed++;return {data:{signedUrl:url()},error:null};}},base));assert.equal(signed,0);
 }
});

test('actual Storage SDK object-info404 wrapped in HTTP400 admits only the owned missing source',async()=>{
 let signed=0;
 const storage={info:async()=>({data:null,error:new StorageApiError('Object not found',400,'404')}),createSignedUploadUrl:async(path,options)=>{signed++;assert.equal(path,value.object_key);assert.equal(options.upsert,false);return {data:{signedUrl:url()},error:null};}};
 const r=await c.baselineUploadTarget(value,scope,storage,base);
 assert.equal(r.upload_required,true);assert.equal(signed,1);
});

test('an unrelated400 or an auth failure with a404-like storage code never becomes missing',async()=>{
 for(const error of [new StorageApiError('synthetic',400,'400'),new StorageApiError('synthetic',403,'404'),new StorageApiError('synthetic',500,'404'),{status:400,statusCode:'404',name:'StorageUnknownError'}]){
  let signed=0;await assert.rejects(()=>c.baselineUploadTarget(value,scope,{info:async()=>({data:null,error}),createSignedUploadUrl:async()=>{signed++;return {data:{signedUrl:url()},error:null};}},base));assert.equal(signed,0);
 }
});
test('foreign shop/object path and signed URL origin, token or destination substitutions are rejected',()=>{
 const target={...value,upload_required:true,signed_url:url()};c.validateBaselineUploadTarget(target,scope,base);
 for(const signed_url of [url().replace('synthetic.supabase.co','other.supabase.co'),url().replace(value.object_key,'history/other/'+id(3)),
  url().replace('https:','http:'),url()+'&other=1',url()+'#fragment',url().replace('synthetic-signed-token','')])
  assert.throws(()=>c.validateBaselineUploadTarget({...target,signed_url},scope,base));
 assert.throws(()=>c.validateBaselineUploadTarget({...target,object_key:`history/${id(9)}/${id(3)}`},scope,base));
 assert.throws(()=>c.validateBaselineUploadTarget({...target,upload_required:false},scope,base));
});
test('local service fixtures may use only their explicit configured loopback origin',()=>{
 const target={...value,upload_required:true,signed_url:url().replace(base,'http://127.0.0.1:54321')};
 c.validateBaselineUploadTarget(target,scope,'http://127.0.0.1:54321');
 assert.throws(()=>c.validateBaselineUploadTarget(target,scope,base));
 assert.throws(()=>c.validateBaselineUploadTarget(target,scope,'http://arbitrary.invalid'));
});
