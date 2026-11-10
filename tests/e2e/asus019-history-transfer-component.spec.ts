import {test,expect,type Page} from "@playwright/test";
import {build} from "esbuild";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {historyTransferCopy} from "../../src/i18n/history-transfer";
import {historyCutoverCopy} from "../../src/i18n/history-cutover";
import type {SupportedLocale} from "../../src/i18n/locales";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`,shop="10000000-0000-4000-8000-000000003019";let bundle="";
test.beforeAll(async()=>{const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {HistoryTransferPanel} from './src/components/shop/HistoryTransferPanel';import {HistoryCutoverPanel} from './src/components/shop/HistoryCutoverPanel';import {historyTransferCopy} from './src/i18n/history-transfer';import {historyCutoverCopy} from './src/i18n/history-cutover';const locale=new URL(location.href).searchParams.get('locale')||'en';createRoot(document.getElementById('root')).render(<><HistoryTransferPanel shopId="${shop}" copy={historyTransferCopy(locale)}/><HistoryCutoverPanel shopId="${shop}" copy={historyCutoverCopy(locale)}/></>);`,loader:"tsx",resolveDir:process.cwd()},bundle:true,write:false,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});bundle=result.outputFiles[0].text;expect(bundle).not.toContain("SUPABASE_SERVICE_ROLE_KEY");expect(bundle).not.toContain("readLocalHistoryExport");});
async function setup(page:Page,{resume=true,ready=false,timeout=false,denied=false,locale="en" as SupportedLocale,verified=true}={}){
 const calls:{lane:string;operation:string;payload:Record<string,unknown>}[]=[];let committed=false,writer=ready?"frozen":"local",inventory:Record<string,unknown>[]=[];
 const gates={inventory_resolved:ready,inventory_unchanged:ready,grants_drained:ready,sources_reconciled:ready,replicas_current:ready,native_overlap_clear:true,can_activate:ready};
 const source={movements:1,active:1,batches:1,originalOperations:1,activeGrossClp:"1200",knownActiveNetClp:"1180",knownActiveNetCount:1};
 const receipt={operation_id:id(30),source_run_id:id(2),source_snapshot_id:id(31),dataset_id:id(20),revision:"1",writer_epoch:"2",kind:"migrate",new_active:1,new_inactive:0,duplicates:0,new_batches:1,original_evidence_level:"legacy_attested"};
 await page.route("**/api/shop/payment-history",route=>route.fulfill({json:{ok:true,result:{merchants:[{merchant_id:id(3),label:"Synthetic merchant",evidence_id:id(4)}],aliases:[],evidence:[]}}}));
 await page.route("**/api/shop/payment-history/transfer",async route=>{
  const body=route.request().postDataJSON();calls.push(body);expect(body.shop_id).toBe(shop);
  if(denied&&body.operation==="review"){await route.fulfill({status:403,json:{ok:false,code:"history_access_denied"}});return;}
  if(body.operation==="apply"){committed=true;if(timeout){await route.abort("failed");return;}}
  if(body.operation==="activate_web")writer="web";
  if(body.operation==="inventory")inventory=[{id:id(40),device_id:body.payload.device_id,hardware_reference_sha256:body.payload.hardware_reference_sha256,disposition:body.payload.disposition,protocol_version:body.payload.protocol_version,client_build_sha:body.payload.client_build_sha,reference:body.payload.reference}];
  const result=body.lane==="cutover"?(body.operation==="devices"?{devices:[{device_id:id(9),name:"Synthetic POS",status:"active",revoked:false}]}:body.operation==="status"?{dataset_id:id(20),revision:"0",writer_epoch:"2",writer_authority:writer,inventory_verified:false,inventory_digest:"a".repeat(64),gates,inventory,known_devices:[]}:
   body.operation==="inventory"?{inventory_id:id(40)}:{writer_epoch:"2",writer_authority:writer}):
   body.operation==="upload_create"?{upload_id:id(5),signed_url:"http://127.0.0.1/synthetic-history-upload"}:body.operation==="upload_ready"||body.operation==="upload_status"?{upload_id:id(5),state:body.operation==="upload_ready"?"uploaded":verified?"verified":"verifying"}:
   body.operation==="start"||body.operation==="resume"?{run_id:id(2),state:"queued"}:body.operation==="status"?{run_id:id(2),state:committed?"applied":"review_ready",processed_objects:1,processed_movements:1,summary:source,manifest:null,error_code:null,scopes:[{id:"synthetic-scope",reference:"Synthetic local mapping"}],bindings:[{local_scope_id:"synthetic-scope",merchant_id:id(3),evidence_id:id(4)}]}:
   body.operation==="review"?{run_id:id(2),dataset_id:id(20),revision:"0",writer_epoch:"2",source,summary:{total:1,new_active:1,new_inactive:0,duplicates:0,conflicts:0,blocked:ready?0:1,new_active_gross_clp:"1200",known_new_active_net_clp:"1180",known_new_active_net_count:1},freeze_verified:ready,can_apply:ready,reasons:[],review_digest:"b".repeat(64)}:
   body.operation==="receipt"?{receipt:committed?receipt:null}:body.operation==="apply"?receipt:body.operation==="mapping"?{merchant_id:id(3),evidence_id:id(4)}:{run_id:id(2),state:"cancelled"};
  await route.fulfill({json:{ok:true,result}});
 });
 await page.route("**/synthetic-history-upload",route=>route.fulfill({json:{ok:true}}));
 await page.route("**/asus019-transfer-component?**",route=>route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="${locale}"><head><title>Synthetic history transfer</title></head><body><main id="root"></main><script>${bundle}</script></body></html>`}));
 await page.goto(`http://127.0.0.1/asus019-transfer-component?locale=${locale}${resume?"&history_transfer_run="+id(2):""}`);
 return {calls,setVerified(){verified=true;},copy:historyTransferCopy(locale),cutover:historyCutoverCopy(locale)};
}
test("incomplete device inventory cannot activate a writer or self-attest completeness",async({page})=>{
 const x=await setup(page,{resume:false});await page.getByText(x.cutover.title,{exact:true}).click();
 await expect(page.getByRole("button",{name:x.cutover.activate,exact:true})).toBeDisabled();await expect(page.getByRole("checkbox",{name:x.cutover.complete,exact:true})).not.toBeChecked();
 await page.getByRole("combobox",{name:x.cutover.device,exact:true}).selectOption(id(9));await page.getByLabel(x.cutover.asset).fill("SYNTHETIC-ASSET-1");await page.getByRole("combobox",{name:x.cutover.disposition,exact:true}).selectOption("active");await page.getByLabel(x.cutover.build).fill("c".repeat(40));await page.getByLabel(x.cutover.reference,{exact:true}).fill("Synthetic checked device evidence");await page.getByRole("button",{name:x.cutover.save,exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:x.cutover.saved})).toBeVisible();const saved=x.calls.find(c=>c.operation==="inventory")!;expect(saved.payload.hardware_reference_sha256).toBe(createHash("sha256").update("SYNTHETIC-ASSET-1").digest("hex"));expect(x.calls.some(c=>c.operation==="activate_web"||c.operation==="freeze")).toBe(false);
});
test("activation sends the current epoch and inventory digest only after server convergence",async({page})=>{
 const x=await setup(page,{resume:false,ready:true});await page.getByText(x.cutover.title,{exact:true}).click();page.on("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:x.cutover.activate,exact:true}).click();await expect(page.getByRole("button",{name:x.cutover.rollback,exact:true})).toBeVisible();
 expect(x.calls.filter(c=>c.operation==="activate_web")).toHaveLength(1);expect(x.calls.find(c=>c.operation==="activate_web")!.payload).toEqual({writer_epoch:"2",inventory_digest:"a".repeat(64)});await expect(page.getByRole("button",{name:x.cutover.rollback,exact:true})).toBeDisabled();
});
test("saved matches are reviewable but no freeze proof means no financial apply",async({page})=>{
 const x=await setup(page);await page.getByText(x.copy.title,{exact:true}).click();await page.getByRole("button",{name:x.copy.review,exact:true}).click();
 await expect(page.getByRole("button",{name:x.copy.confirm,exact:true})).toBeDisabled();await expect(page.getByText(x.copy.blocked,{exact:true})).toBeVisible();expect(x.calls.some(c=>c.operation==="apply")).toBe(false);
});
test("uncertain transfer recovers its receipt after reload without a second financial apply",async({page})=>{
 const x=await setup(page,{ready:true,timeout:true});await page.getByText(x.copy.title,{exact:true}).click();await page.getByRole("button",{name:x.copy.review,exact:true}).click();await page.getByRole("button",{name:x.copy.confirm,exact:true}).click();await expect(page.getByRole("heading",{name:x.copy.done})).toBeVisible();expect(x.calls.filter(c=>c.operation==="apply")).toHaveLength(1);
 expect(page.url()).not.toContain("1200");expect(page.url()).not.toContain("Synthetic");await page.reload();await page.getByText(x.copy.title,{exact:true}).click();await expect(page.getByRole("heading",{name:x.copy.done})).toBeVisible();expect(x.calls.filter(c=>c.operation==="apply")).toHaveLength(1);
});
test("prepared archive cannot start analysis until the worker verifies its bytes",async({page})=>{
 const x=await setup(page,{resume:false,verified:false});await page.getByText(x.copy.title,{exact:true}).click();const bytes=readFileSync("tests/fixtures/payment-history/local-export-v1/synthetic-local-history.w7history.zip");await page.getByLabel(x.copy.file).setInputFiles({name:"synthetic.w7history.zip",mimeType:"application/zip",buffer:bytes});await page.getByRole("button",{name:x.copy.upload,exact:true}).click();await expect(page.getByText(x.copy.waiting,{exact:true})).toBeVisible();expect(x.calls.some(c=>c.operation==="start")).toBe(false);
 expect(x.calls.find(c=>c.operation==="upload_create")!.payload.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));x.setVerified();await page.getByRole("button",{name:x.copy.continue,exact:true}).click();await expect(page.getByText(x.copy.mapping,{exact:true})).toBeVisible();expect(x.calls.filter(c=>c.operation==="start")).toHaveLength(1);
});
test("revoked transfer review displays a safe error and cannot apply",async({page})=>{
 const x=await setup(page,{ready:true,denied:true});await page.getByText(x.copy.title,{exact:true}).click();await page.getByRole("button",{name:x.copy.review,exact:true}).click();await expect(page.getByRole("alert")).toHaveText(x.copy.error);expect(x.calls.some(c=>c.operation==="apply")).toBe(false);
});
for(const locale of ["it","es","zh-CN"] as SupportedLocale[])test(`transfer and cutover controls support ${locale} keyboard labels`,async({page})=>{
 const x=await setup(page,{resume:false,locale});await page.keyboard.press("Tab");await expect(page.getByText(x.copy.title,{exact:true})).toBeFocused();await page.keyboard.press("Enter");await expect(page.getByLabel(x.copy.file)).toBeVisible();await page.getByText(x.cutover.title,{exact:true}).click();await expect(page.getByLabel(x.cutover.complete,{exact:true})).not.toBeChecked();await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
 const failures=await page.evaluate(async()=>{const axe=(window as unknown as {axe:{run:()=>Promise<{violations:{id:string;impact:string}[]}>}}).axe;return(await axe.run()).violations.filter(v=>v.impact==="critical").map(v=>v.id);});expect(failures).toEqual([]);
});
