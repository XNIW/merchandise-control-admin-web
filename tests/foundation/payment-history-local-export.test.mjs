import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import test from "node:test";
import {Open} from "unzipper-esm";
import {load,zip} from "./helpers/payment-history-harness.mjs";
const reader=load("src/server/payment-history/local-export-reader.ts"),receipt=load("src/server/payment-history/lossless-receipt-json.ts");
const root="tests/fixtures/payment-history/local-export-v1/",input=readFileSync(root+"synthetic-local-history.w7history.zip"),provenance=JSON.parse(readFileSync(root+"provenance.json","utf8"));
const shop="10000000-0000-4000-8000-000000003019",sha=b=>createHash("sha256").update(b).digest("hex"),clone=x=>JSON.parse(JSON.stringify(x));
async function parts(){const d=await Open.buffer(input);return Promise.all(d.files.map(async f=>({name:f.path,bytes:await f.buffer()})));}
function rewrite(entries,name,change,repin=true){const part=entries.find(e=>e.name===name);const rows=part.bytes.toString("utf8").split("\n").filter(Boolean).map(JSON.parse);change(rows);part.bytes=Buffer.from(rows.map(r=>JSON.stringify(r)+"\n").join(""));if(repin){const metadata=entries.find(e=>e.name==="manifest.json"),manifest=JSON.parse(metadata.bytes);Object.assign(manifest.entries.find(e=>e.name===name),{rows:String(rows.length),sha256:sha(part.bytes),byteLength:String(part.bytes.length)});metadata.bytes=Buffer.from(JSON.stringify(manifest));}return entries;}
test("real product-backup exporter corpus reconciles literal totals without promoting local evidence",async()=>{
 assert.equal(sha(input),provenance.archiveSha256);const r=await reader.readLocalHistoryExport(input,shop);
 assert.deepEqual(clone(r.summary),{movements:5,active:5,batches:1,originalOperations:1,activeGrossClp:"3380",knownActiveNetClp:"3320",knownActiveNetCount:5});assert.equal(r.manifest.evidenceLevel,"legacy_attested");
 assert.ok(r.movements.every(m=>m.transaction.originalCashierId===null&&m.transaction.merchant.hasEvidence===false));
 const original=await parts(),source=JSON.parse(original.find(e=>e.name==="operations.ndjson").bytes.toString("utf8").trim());assert.equal(r.tables.operations[0].receipt_json,source.receipt_json);
 const clr=JSON.parse(readFileSync("tests/fixtures/payment-history/getnet-v1/clr-ledger-contracts.json","utf8"));
 for(const movement of r.movements)assert.equal(movement.economicDigest,clr.find(row=>row.externalId===movement.transaction.externalId).economicDigest);
});
test("another shop cannot accept a copied manifest",async()=>{await assert.rejects(()=>reader.readLocalHistoryExport(input,"10000000-0000-4000-8000-000000099019"),/scope_mismatch/);});
test("modified entry without checksum update cannot be staged",async()=>{const p=rewrite(await parts(),"movements.ndjson",rows=>rows[0].signed_amount_clp="1201",false);await assert.rejects(()=>reader.readLocalHistoryExport(zip(p),shop),/checksum_mismatch/);});
for(const [field,value,error] of [["signed_amount_clp","1201","economics_mismatch"],["signed_amount_clp",1200,"export_invalid"],["shop_id","10000000-0000-4000-8000-000000099019","scope_mismatch"],["binding_id","other-binding","export_invalid"],["original_cashier_id","1001","cashier_unverified"],["business_ticks","638423827330000001","timestamp_mismatch"],["source_row","9007199254740993","export_invalid"]])
 test(`tampered local ${field} is rejected even with recomputed ZIP metadata`,async()=>{const p=rewrite(await parts(),"movements.ndjson",rows=>rows[0][field]=value);await assert.rejects(()=>reader.readLocalHistoryExport(zip(p),shop),new RegExp(error));});
test("duplicate active identity cannot acquire two cloud owners",async()=>{const p=rewrite(await parts(),"movements.ndjson",rows=>{rows[1].merchant_scope_id=rows[0].merchant_scope_id;rows[1].binding_id=rows[0].binding_id;rows[1].external_namespace=rows[0].external_namespace;rows[1].external_id=rows[0].external_id;});await assert.rejects(()=>reader.readLocalHistoryExport(zip(p),shop),/duplicate_active_identity/);});
test("an original receipt remains content-bound to its immutable SQL row",async()=>{const p=rewrite(await parts(),"operations.ndjson",rows=>{const receipt=JSON.parse(rows[0].receipt_json);receipt.SignedAmountClp=1;rows[0].receipt_json=JSON.stringify(receipt);});await assert.rejects(()=>reader.readLocalHistoryExport(zip(p),shop),/receipt_mismatch/);});
test("receipt Int64 values are parsed without binary number coercion",()=>{const r=receipt.parseReceiptJson('{"SignedAmountClp":9223372036854775807,"Reference":"kept"}');assert.equal(r.SignedAmountClp.raw,"9223372036854775807");assert.equal(r.Reference,"kept");for(const raw of ['{"a":1,"a":2}','[true,]','{"a":"\\ud800"}','0 trailing'])assert.throws(()=>receipt.parseReceiptJson(raw),/receipt_invalid/);});
test("archive never accepts native sales, stock or outbox entries",async()=>{const p=await parts();p.push({name:"sales.ndjson",bytes:Buffer.from('{}\n')});await assert.rejects(()=>reader.readLocalHistoryExport(zip(p),shop),/export_limit/);});
test("pre-cancelled migration performs no partial read",async()=>{const controller=new AbortController();controller.abort();await assert.rejects(()=>reader.readLocalHistoryExport(input,shop,controller.signal));});

test("local baseline v2 is accepted only by an explicitly selected server contract",async()=>{
 const p=await parts(),part=p.find(e=>e.name==="manifest.json"),manifest=JSON.parse(part.bytes);
 manifest.schemaVersion=reader.LOCAL_BASELINE_VERSION;manifest.restoreLineageId="30000000-0000-4000-8000-000000003019";part.bytes=Buffer.from(JSON.stringify(manifest));
 const bytes=zip(p);
 await assert.rejects(()=>reader.readLocalHistoryExport(bytes,shop),/export_invalid/);
 const result=await reader.readLocalHistoryExport(bytes,shop,undefined,undefined,reader.LOCAL_BASELINE_VERSION);
 assert.equal(result.manifest.restoreLineageId,manifest.restoreLineageId);
 assert.deepEqual(clone(result.summary),clone((await reader.readLocalHistoryExport(input,shop)).summary));
 await assert.rejects(()=>reader.readLocalHistoryExport(input,shop,undefined,undefined,reader.LOCAL_BASELINE_VERSION),/export_invalid/);
 for(const value of [null,"", "copied-dataset",123,[manifest.restoreLineageId]]){
  manifest.restoreLineageId=value;part.bytes=Buffer.from(JSON.stringify(manifest));
  await assert.rejects(()=>reader.readLocalHistoryExport(zip(p),shop,undefined,undefined,reader.LOCAL_BASELINE_VERSION));
 }
});

test("manifest identity and checksums do not accept values coerced from arrays",async()=>{
 for(const key of ["deviceId","backupSha256","entrySha256"]){
  const p=await parts(),part=p.find(e=>e.name==="manifest.json"),manifest=JSON.parse(part.bytes);
  if(key==="entrySha256")manifest.entries[0].sha256=[manifest.entries[0].sha256];else manifest[key]=[manifest[key]];
  part.bytes=Buffer.from(JSON.stringify(manifest));
  await assert.rejects(()=>reader.readLocalHistoryExport(zip(p),shop),/export_invalid/);
 }
});

test("real CLR baseline exporter preserves the attested lineage and exact existing economics",async()=>{
 const root="tests/fixtures/payment-history/local-export-v2/",bytes=readFileSync(root+"synthetic-local-baseline.w7history.zip"),proof=JSON.parse(readFileSync(root+"provenance.json","utf8"));
 assert.equal(proof.syntheticOnly,true);assert.equal(proof.source,"HistoricalCloudExporter.ExportBaselineAsync");assert.equal(sha(bytes),proof.archiveSha256);
 const result=await reader.readLocalHistoryExport(bytes,shop,undefined,undefined,reader.LOCAL_BASELINE_VERSION);
 assert.equal(result.manifestSha256,proof.manifestSha256);assert.equal(result.manifest.backupSha256,proof.backupSha256);
 assert.equal(result.manifest.restoreLineageId,proof.restoreLineageId);assert.equal(result.manifest.localDatasetId,proof.datasetId);
 assert.deepEqual(clone(result.summary),{movements:5,active:5,batches:1,originalOperations:1,activeGrossClp:"3380",knownActiveNetClp:"3320",knownActiveNetCount:5});
 await assert.rejects(()=>reader.readLocalHistoryExport(bytes,shop),/export_invalid/);
});
