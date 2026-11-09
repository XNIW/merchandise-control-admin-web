import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { qualifiedWorkerConfig, qualifiedPublicBuildTarget } from "../../scripts/qualified-worker-artifact.mjs";
const source = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
test("ASUS019 pins the public browser build to the reviewed staging project", () => {
  const result=qualifiedPublicBuildTarget("https://jpgoimipbothfgkokyvm.supabase.co","sb_publishable_synthetic");
  assert.deepEqual(result,{projectRef:"jpgoimipbothfgkokyvm",publishableKeyIncluded:true});
  assert.ok(!JSON.stringify(result).includes("synthetic"));
});
for(const [name,url,key] of [
  ["missing",undefined,undefined],
  ["wrong project","https://other.supabase.co","sb_publishable_synthetic"],
  ["secret key","https://jpgoimipbothfgkokyvm.supabase.co","sb_secret_synthetic"],
]) {
  test("ASUS019 refuses unsafe public browser build configuration: "+name,()=>{
    assert.throws(()=>qualifiedPublicBuildTarget(url,key));
  });
}
test("ASUS019 portable Worker keeps effective staging bindings and runtime flags", () => {
  const config=qualifiedWorkerConfig(source);
  assert.equal(config.name,source.env.staging.name);
  assert.deepEqual(config.services,source.env.staging.services);
  assert.deepEqual(config.compatibility_flags,source.compatibility_flags);
  assert.equal(config.compatibility_date,source.compatibility_date);
  assert.equal(config.assets.binding,"ASSETS");
  assert.equal(config.main,"bundle/worker.js");
  assert.equal(config.find_additional_modules,true);
  assert.equal(config.env,undefined);
  assert.ok(!JSON.stringify(config).includes('"service":"merchandise-control-admin-web"'));
});
for(const [name,change] of Object.entries({
  target:s=>{s.env.staging.name="other";},
  service:s=>{s.env.staging.services[0].service="merchandise-control-admin-web";},
  extraBinding:s=>{s.env.staging.services.push({binding:"OTHER",service:"other"});},
  assetDirectory:s=>{s.assets.directory=".";},
  entrypoint:s=>{s.main="other.js";},
})) {
  test("ASUS019 artifact refuses changed release configuration: "+name,()=>{
    const config=structuredClone(source);change(config);assert.throws(()=>qualifiedWorkerConfig(config));
  });
}
