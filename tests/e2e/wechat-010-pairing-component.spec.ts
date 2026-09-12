import { test, expect } from "@playwright/test";
import { build } from "esbuild";

// Local component harness: genuine React DOM with deterministic HTTP responses.
// This is not an authenticated Admin/WeChat E2E.
let bundle = "";
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PairingPanel} from './src/app/account/wechat-mini/PairingPanel'; const params=new URL(location.href).searchParams;createRoot(document.getElementById('root')).render(<PairingPanel accountName="Isolated owner" enabled={params.get('enabled')==='1'} canManage={true} locale={params.get('locale')||'en'}/>);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  });
  bundle = result.outputFiles[0].text;
});
test("expired pairing discards capabilities and requires fresh intent before restart", async ({ page }) => {
  const actions: string[] = [];
  await page.route("**/api/auth/wechat/mini/admin", async route => {
    const body = route.request().postDataJSON(); actions.push(body.action);
    expect(body.consent).toBe(body.action === "start");
    await route.fulfill({ json: body.action === "start" ? {ok:true,pairingId:"isolated-pair",adminCapability:"isolated-capability",transferCode:"isolated-transfer"} : {ok:false,code:"pairing_expired"} });
  });
  await page.route("**/wechat010-component?**", route => route.fulfill({contentType:"text/html",body:`<div id="root"></div><script>${bundle}</script>`}));
  await page.goto("http://127.0.0.1/wechat010-component?enabled=1");
  await expect(page.getByRole("button",{name:"Start linking"})).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:"Start linking"}).click();
  await expect(page.getByText("isolated-transfer")).toBeVisible();
  await page.getByRole("button",{name:"Check Mini confirmation"}).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("isolated-transfer")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Start linking"})).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:"Start linking"}).click();
  expect(actions).toEqual(["start","status","start"]);
});
test("enrollment OFF still exposes consent-protected unlink without starting pairing",async({page})=>{
  const actions:string[]=[];
  await page.route("**/api/auth/wechat/mini/admin",async route=>{
    const body=route.request().postDataJSON();actions.push(body.action);
    if(body.action==="unlink")expect(body.consent).toBe(true);
    await route.fulfill({json:body.action==="list"?{ok:true,mappings:[{mapping_id:"isolated-mapping",provider:"wechat-mini"}]}:{ok:true,state:"unlinked"}});
  });
  await page.route("**/wechat010-component?**",route=>route.fulfill({contentType:"text/html",body:`<div id="root"></div><script>${bundle}</script>`}));
  await page.goto("http://127.0.0.1/wechat010-component?enabled=0");
  await expect(page.getByRole("button",{name:"Start linking"})).toHaveCount(0);
  await page.getByRole("button",{name:"Show links"}).click();
  const unlink=page.getByRole("button",{name:"Unlink and revoke Mini sessions"});
  await expect(unlink).toBeDisabled();await page.getByRole("checkbox").check();await unlink.click();
  await expect(unlink).toHaveCount(0);expect(actions).toEqual(["list","unlink"]);
});
