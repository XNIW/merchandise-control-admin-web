import {test,expect,type Page} from "@playwright/test";
import {build} from "esbuild";
import {readFileSync} from "node:fs";
// Genuine React DOM and HTTP interception on loopback. No shop credentials,
// Supabase service, real uploads or financial mutations are used by this suite.
let bundle="";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const shop=id(1),job=id(2),merchant=id(3),upload=id(4);
const source={upload_id:upload,sha256:"a".repeat(64),file_name:"synthetic-legacy.xlsx",byte_length:"100"};
const candidate={alias_key:"b".repeat(64),source_identity:{local:"Synthetic merchant",seller:"",sellerId:"",localNumber:"",rut:"",hasEvidence:true}};
const metadata={merchants:[{merchant_id:merchant,label:"Synthetic merchant",evidence_id:id(10)}],aliases:[{alias_key:candidate.alias_key,merchant_id:merchant,evidence_id:id(10)}],evidence:["merchant_mapping","legacy_currency","native_start"].map((kind,i)=>({evidence_id:id(10+i),kind,verification_level:"operator_attested",policy_version:"synthetic-v1",reference:"Synthetic evidence",scope:{}}))};
const counts={total:1,new_count:1,duplicate_count:0,conflicts:0,blocked:0,new_gross_clp:"1200",known_new_net_clp:"1180",known_new_net_count:1};
const caps={capabilities:{read:true,import:true,cancel:true,export:true,migrate:false},runtime:{dataset_id:id(20),revision:"0",writer_epoch:"1",writer_authority:"local",inventory_verified:false}};
test.beforeAll(async()=>{const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {PaymentHistoryWorkbench} from './src/components/shop/PaymentHistoryWorkbench';import {paymentHistoryCopy} from './src/i18n/payment-history';const locale=new URL(location.href).searchParams.get('locale')||'en';createRoot(document.getElementById('root')).render(<PaymentHistoryWorkbench shopId="${shop}" locale={locale} copy={paymentHistoryCopy(locale)} initialCapabilities={${JSON.stringify(caps)}}/>);`,loader:"tsx",resolveDir:process.cwd()},bundle:true,write:false,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});bundle=result.outputFiles[0].text;
 expect(bundle).not.toContain("SUPABASE_SERVICE_ROLE_KEY");expect(bundle).not.toContain("openGetnetWorkbook");
});
async function setup(page:Page,{resume=true,writer=false,timeout=false,denied=false,modern=false,locale="en"}={}){
 const actions:{operation:string;payload:Record<string,unknown>}[]=[];
 let committed=false;
 await page.route("**/api/shop/payment-history",async route=>{
  const body=route.request().postDataJSON();actions.push(body);expect(body.shop_id).toBe(shop);
  if(denied&&body.operation==="review"){await route.fulfill({status:403,json:{ok:false,code:"history_access_denied"}});return;}
  if(body.operation==="commit"){committed=true;if(timeout){await route.abort("failed");return;}}
  const receipt={operation_id:id(50),batch_id:id(51),kind:"apply",dataset_id:id(20),revision:"1",writer_epoch:"1",summary:counts};
  const result=body.operation==="metadata"?metadata:body.operation==="read"||body.operation==="export"?{configured:true,coverage:"observed_records_only",dataset_id:id(20),revision:"0",writer_epoch:"1",writer_authority:writer?"web":"local",rows:[],batches:[]}:
   body.operation==="capabilities"?caps:body.operation==="upload_create"?{upload_id:upload,signed_url:"http://127.0.0.1/synthetic-signed-upload"}:body.operation==="upload_ready"||body.operation==="upload_status"?{...source,state:body.operation==="upload_ready"?"uploaded":"verified"}:
   body.operation==="start"?{job_id:job,state:"queued"}:body.operation==="cancel_job"?{job_id:job,state:"cancelled"}:
   body.operation==="status"?{job_id:job,state:committed?"committed":"review_ready",processed_rows:modern?0:1,summary:{needsTimeDecision:modern,candidates:{isoFrom:"2024-01-31T16:12:13",isoTo:"2024-01-31T16:12:13",localFrom:"2024-01-31T20:12:13",localTo:"2024-01-31T20:12:13"}},merchants:[candidate],diagnostics:[],error_code:null}:
   body.operation==="review"?{shop_id:shop,dataset_id:id(20),revision:"0",writer_epoch:"1",writer_ready:writer,summary:counts,can_commit:writer,reasons:[],review_digest:"c".repeat(64)}:
   body.operation==="commit"?receipt:body.operation==="receipt"?{receipt:committed?receipt:null}:{job_id:job,state:"review_ready"};
  await route.fulfill({json:{ok:true,result}});
 });
 await page.route("**/synthetic-signed-upload",route=>route.fulfill({json:{ok:true}}));
 await page.route("**/asus019-payment-component?**",route=>route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="${locale}"><head><title>Synthetic payment history</title></head><body><main id="root"></main><script>${bundle}</script></body></html>`}));
 await page.goto(`http://127.0.0.1/asus019-payment-component?locale=${locale}${resume?"&history_job="+job+"&history_uploads="+upload:""}`);return actions;
}
test("restored analysis uses verified metadata and refuses web commit before cutover",async({page})=>{
 const actions=await setup(page);
 await expect(page.getByRole("heading",{name:"Review evidence",exact:true})).toBeFocused();
 await page.getByRole("button",{name:"Save evidence and review"}).click();
 await expect(page.getByText("Import is waiting for the verified transfer from all POS devices. Consultation remains available.")).toBeVisible();
 await expect(page.getByRole("button",{name:"Confirm import",exact:true})).toBeDisabled();
 expect(actions.filter(a=>a.operation==="commit")).toHaveLength(0);
 expect(actions.find(a=>a.operation==="configure")?.payload.evidence_ids).toEqual(metadata.evidence.map(e=>e.evidence_id));
});
test("network failure after commit recovers the original receipt without applying twice",async({page})=>{
 const actions=await setup(page,{writer:true,timeout:true});
 await page.getByRole("button",{name:"Save evidence and review"}).click();
 await page.getByRole("button",{name:"Confirm import",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Import completed"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Confirm import",exact:true})).toBeDisabled();
 expect(actions.filter(a=>a.operation==="commit")).toHaveLength(1);expect(actions.filter(a=>a.operation==="receipt")).toHaveLength(1);
 await page.reload();await expect(page.getByRole("heading",{name:"Import completed"})).toBeVisible();
 expect(actions.filter(a=>a.operation==="commit")).toHaveLength(1);
});
test("missing modern provider evidence preserves both candidates and blocks confirmation",async({page})=>{
 const actions=await setup(page,{modern:true});
 await expect(page.getByText("2024-01-31T16:12:13",{exact:false})).toBeVisible();
 await expect(page.getByText("2024-01-31T20:12:13",{exact:false})).toBeVisible();
 await expect(page.getByRole("button",{name:"Analyze under the verified policy"})).toBeDisabled();
 await expect(page.getByRole("button",{name:"Save evidence and review"})).toBeDisabled();expect(actions.filter(a=>a.operation==="commit")).toHaveLength(0);
});
test("source transfer completion does not bypass worker verification before a new job",async({page})=>{
 const actions=await setup(page,{resume:false});
 await page.getByLabel("Getnet Excel files").setInputFiles({name:"synthetic-legacy.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:readFileSync("tests/fixtures/payment-history/getnet-v1/synthetic-legacy.xlsx")});
 await page.getByRole("button",{name:"Upload and analyze"}).click();
 await expect(page.getByRole("heading",{name:"Review evidence",exact:true})).toBeVisible();
 const order=actions.map(a=>a.operation);expect(order.indexOf("upload_ready")).toBeLessThan(order.indexOf("upload_status"));expect(order.indexOf("upload_status")).toBeLessThan(order.indexOf("start"));
 expect(actions.find(a=>a.operation==="start")?.payload.request_key).toMatch(/^[a-f0-9-]{36}$/);
});
test("revoked authorization produces a localized error and no commit",async({page})=>{
 const actions=await setup(page,{denied:true,locale:"it"});await page.getByRole("button",{name:"Salva le prove e rivedi"}).click();
 await expect(page.getByRole("alert")).toHaveText("La tua autorizzazione è cambiata. Accedi di nuovo prima di continuare.");expect(actions.some(a=>a.operation==="commit")).toBe(false);
});
for(const [locale,title] of [["it","Storico pagamenti con carta"],["es","Historial de pagos con tarjeta"],["zh-CN","银行卡付款历史"]])test(`copy and keyboard labels render in ${locale}`,async({page})=>{
 await setup(page,{resume:false,locale});await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();await page.keyboard.press("Tab");await expect(page.locator("input[type=file]")).toBeFocused();
 await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
 const failures=await page.evaluate(async()=>{const axe=(window as unknown as {axe:{run:()=>Promise<{violations:{id:string;impact:string}[]}>}}).axe;return(await axe.run()).violations.filter(v=>v.impact==="critical").map(v=>v.id);});expect(failures).toEqual([]);
});
