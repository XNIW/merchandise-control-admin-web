import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import assert from 'node:assert/strict';
const result=await build({stdin:{contents:`import {verifyWeChatMiniCode} from './src/server/auth/wechat-code2session'; export default { async fetch(){const identity=await verifyWeChatMiniCode('fresh_code',{configured:true,appId:'wx0000000000000001',appSecret:'0'.repeat(32),identityKey:'k'.repeat(43)});return Response.json({verified:/^v1:[0-9a-f]{64}$/.test(identity??'')});}}`,loader:'ts',resolveDir:process.cwd()},plugins:[{name:'server-only-test',setup(build){build.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));build.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}],bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto','node:https']});
let calls=0;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-06-10',compatibilityFlags:['nodejs_compat'],outboundService:async request=>{
  const url=new URL(request.url);assert.equal(url.hostname,'api.weixin.qq.com');assert.equal(url.pathname,'/sns/jscode2session');assert.equal(url.searchParams.get('grant_type'),'authorization_code');calls++;
  return Response.json({openid:'isolated_test_openid_123456',session_key:'AAAAAAAAAAAAAAAAAAAAAA=='});
}}));
try {const response=await mf.dispatchFetch('http://localhost/');assert.deepEqual(await response.json(),{verified:true});assert.equal(calls,1);console.log('WORKER_NODE_HTTPS_TRANSPORT=PASS; all outbound intercepted locally; no Tencent request');}finally{await mf.dispose();}
