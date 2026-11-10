import {test,expect,type Page} from "@playwright/test";
import {build} from "esbuild";
import {commercialDateTimeTicks} from "../../src/lib/payment-history/time-rules";
// React DOM + synthetic loopback HTTP interception. This is not authenticated
// backend or cross-device qualification and creates no financial operations.
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const shop=id(1),dataset=id(4),ticks=commercialDateTimeTicks("2026-03-01T10:00:00.0000001");
const permissions={read:true,import:true,cancel:false,export:true,migrate:false};
let bundle="";
test.beforeAll(async()=>{
 const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {PaymentHistoryWorkbench} from './src/components/shop/PaymentHistoryWorkbench';import {paymentHistoryCopy} from './src/i18n/payment-history';createRoot(document.getElementById('root')).render(<PaymentHistoryWorkbench shopId="${shop}" locale="en" copy={paymentHistoryCopy('en')} initialCapabilities={{capabilities:${JSON.stringify(permissions)},runtime:{dataset_id:'${dataset}',revision:'1',writer_epoch:'1',writer_authority:'local',inventory_verified:false}}}/>);`,loader:"tsx",resolveDir:process.cwd()},bundle:true,write:false,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});bundle=result.outputFiles[0].text;
});
async function setup(page:Page){
 const requests:{operation:string;payload:Record<string,unknown>}[]=[];let revision="1",denied=false,unavailable=false,delay=0;
 await page.route("**/api/shop/payment-history",async route=>{
  const body=route.request().postDataJSON();requests.push(body);const q=body.payload;
  if(delay&&body.operation==="movements")await new Promise(resolve=>setTimeout(resolve,delay));
  if(denied){await route.fulfill({status:403,json:{ok:false,code:"history_access_denied"}});return;}
  if(unavailable&&body.operation==="movements"){await route.fulfill({status:503,json:{ok:false,code:"history_unavailable"}});return;}
  if(q.after&&q.after.revision!==revision){await route.fulfill({status:409,json:{ok:false,code:"history_view_changed"}});return;}
  let result:unknown={};
  if(body.operation==="capabilities")result={capabilities:permissions,runtime:{dataset_id:dataset,revision,writer_epoch:"1",writer_authority:"local",inventory_verified:false}};
  if(body.operation==="metadata")result={merchants:[],aliases:[],evidence:[]};
  if(body.operation==="read")result={configured:true,revision,rows:[],batches:[]};
  if(["movements","movements_export"].includes(body.operation)){
   const row={id:id(q.after?11:12),merchant_id:id(2),merchant_label:"Synthetic merchant",batch_id:id(3),batch_origin:"local_migration",batch_state:"active",active:true,business_ticks:ticks,business_datetime:"2026-03-01T10:00:00.0000001",gross_clp:revision==="1"?"1000":"2000",fee_clp:"100",fee_vat_clp:null,net_clp:null,movement_kind:"Sale",transaction_state:"ABONADO",external_namespace:"getnet.legacy.transaction",external_id:q.after?"synthetic-previous":"synthetic-current",source_sheet:"Synthetic",source_row:"2",source_sha256:"a".repeat(64),timestamp_raw:"01/03/2026 10:00:00",offset_minutes:null,occurred_at_utc:null,time_interpretation:"Unresolved",time_policy_version:"synthetic-v1",time_evidence_reference:"synthetic-attested",created_revision:"1"};
   result={configured:true,coverage:"observed_records_only",dataset_id:dataset,revision,writer_epoch:"1",writer_authority:"local",from_date:q.from_date,to_date:q.to_date,include_inactive:q.include_inactive,
    totals:{matched_count:"2",active_count:"2",inactive_count:"0",signed_active_gross_clp:revision==="1"?"2000":"4000",known_active_net_clp:null,known_active_net_count:"0"},rows:[row],next:q.after?null:{dataset_id:dataset,revision,business_ticks:ticks,id:row.id,query_key:`${q.from_date??"*"}/${q.to_date??"*"}/${q.include_inactive?"all":"active"}`}};
  }
  await route.fulfill({json:{ok:true,result}});
 });
 await page.route("http://127.0.0.1/synthetic-movements",route=>route.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));
 await page.goto("http://127.0.0.1/synthetic-movements");await page.addScriptTag({content:bundle});
 await expect(page.getByRole("table")).toBeVisible();
 return {requests,revision:(value:string)=>{revision=value;},deny:()=>{denied=true;},unavailable:()=>{unavailable=true;},delay:(ms:number)=>{delay=ms;},
  signal:async(status="ready",marker="b".repeat(64),scope=shop)=>page.evaluate(({status,marker,scope})=>window.dispatchEvent(new CustomEvent("shop:sync-event-marker",{detail:{shopId:scope,paymentHistoryStatus:status,paymentHistoryMarker:marker}})),{status,marker,scope})};
}
test("reader shows global totals, exact commercial clock and unknown net; filters and paging retain their scope",async({page})=>{
 const x=await setup(page);const totals=page.getByRole("region",{name:"Totals for the entire filtered result"});
 await expect(totals).toContainText("2,000");await expect(page.getByRole("table")).toContainText("2026-03-01 10:00:00.0000001");await expect(page.getByRole("table")).toContainText("Unknown");
 await page.getByLabel("From commercial date").fill("2026-03-01");await page.getByLabel("To commercial date").fill("2026-03-31");await page.getByRole("button",{name:"Apply filters"}).click();
 await expect.poll(()=>x.requests.filter(r=>r.operation==="movements").at(-1)?.payload.from_date).toBe("2026-03-01");
 await page.getByRole("button",{name:"Next page"}).click();await expect(page.getByRole("table")).toContainText("synthetic-previous");
 await expect(totals).toContainText("2,000");await page.getByRole("button",{name:"Previous page"}).click();await expect(page.getByRole("table")).toContainText("synthetic-current");
 await page.getByText("Provenance",{exact:true}).click();await expect(page.getByRole("table")).toContainText("01/03/2026 10:00:00");
});
test("global discovery updates the open page while preserving draft input, file selection and focus",async({page})=>{
 const x=await setup(page);const input=page.getByLabel("From commercial date");await input.fill("2026-04-01");await input.focus();
 const files=page.locator('input[type="file"]');await files.setInputFiles({name:"synthetic.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:Buffer.from("synthetic")});await input.focus();
 x.revision("2");await x.signal();await expect(page.getByRole("table")).toContainText("2,000");await expect(input).toHaveValue("2026-04-01");await expect(input).toBeFocused();
 expect(await files.evaluate((node:HTMLInputElement)=>node.files?.[0]?.name)).toBe("synthetic.xlsx");expect(x.requests.some(r=>["commit","cancel_batch","start"].includes(r.operation))).toBe(false);
});
test("background revision change keeps the commercial page anchor and global totals consistent",async({page})=>{
 const x=await setup(page);await page.getByRole("button",{name:"Next page"}).click();await expect(page.getByRole("table")).toContainText("synthetic-previous");x.revision("2");await x.signal();
 await expect(page.getByRole("table")).toContainText("2,000");await expect(page.getByRole("table")).toContainText("synthetic-previous");
 expect(x.requests.filter(r=>r.operation==="movements").at(-1)?.payload.after).toMatchObject({revision:"2",id:id(12)});
});
test("unavailable updates retain a verified page; confirmed revocation removes financial data",async({page})=>{
 const x=await setup(page);x.unavailable();await page.getByRole("button",{name:"Updating historical movements…"}).click();await expect(page.getByText("Update unavailable. The last verified page remains visible.")).toBeVisible();await expect(page.getByRole("table")).toBeVisible();
 x.deny();await x.signal();await expect(page.getByRole("table")).toHaveCount(0);await expect(page.getByText("Access to historical data is no longer permitted.")).toBeVisible();
});
test("another shop's signal does not issue requests or change this view",async({page})=>{
 const x=await setup(page);await page.waitForTimeout(100);const before=x.requests.length;await x.signal("ready","a".repeat(64),id(99));await page.waitForTimeout(100);expect(x.requests.length).toBe(before);
});
