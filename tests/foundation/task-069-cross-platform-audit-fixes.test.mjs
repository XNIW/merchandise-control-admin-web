import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Script, createContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTranspiledModule = createRequire(import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function loadTypeScriptModule(relativePath) {
  const source = readProjectFile(relativePath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };
  const context = createContext({
    exports: cjsModule.exports,
    module: cjsModule,
    require: requireForTranspiledModule,
  });

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    context,
  );

  return cjsModule.exports;
}

test("TASK-069 localized number parsing handles CLP and thousands separators consistently", () => {
  const { parseLocalizedNumberText } = loadTypeScriptModule(
    "src/lib/localized-number.ts",
  );

  assert.equal(parseLocalizedNumberText("1.234"), 1234);
  assert.equal(parseLocalizedNumberText("CLP 1.234"), 1234);
  assert.equal(parseLocalizedNumberText("12.345"), 12345);
  assert.equal(parseLocalizedNumberText("1.234,56"), 1234.56);
  assert.equal(parseLocalizedNumberText("1,234.56"), 1234.56);
  assert.equal(parseLocalizedNumberText("1234,56"), 1234.56);
  assert.equal(parseLocalizedNumberText("1234.56"), 1234.56);
  assert.equal(Number.isNaN(parseLocalizedNumberText("CLP foo")), true);
  assert.equal(Number.isNaN(parseLocalizedNumberText("1/2")), true);
  assert.equal(Number.isNaN(parseLocalizedNumberText("12:30")), true);
  assert.equal(Number.isNaN(parseLocalizedNumberText("1_234")), true);
});

test("TASK-069 product detail uses exact server-side catalog lookup, not the first read-model page", () => {
  const sectionData = readProjectFile(
    "src/server/shop-admin/shop-section-data.ts",
  );
  const inventoryReadModel = readProjectFile(
    "src/server/shop-admin/inventory-read-model.ts",
  );

  assert.match(sectionData, /getShopInventoryProductDetailReadModel/);
  assert.match(sectionData, /productId: catalogId/);
  assert.match(inventoryReadModel, /getShopInventoryProductDetailReadModel/);
  assert.match(inventoryReadModel, /idColumn: "id"/);
  assert.match(inventoryReadModel, /\.eq\("product_id", input\.productId\)/);
  assert.match(inventoryReadModel, /range\(0, 99\)/);
  const productDetailBranch = sectionData.match(
    /if \(kind === "product"\) \{[\s\S]*?return buildProductDetailSection/,
  )?.[0];

  assert.ok(productDetailBranch, "product detail branch is missing");
  assert.doesNotMatch(
    productDetailBranch,
    /getShopInventoryReadModel\(\{ requestedShopId \}\)/,
  );
});

test("TASK-069 sync_events RPC accepts compacted large change counters while preserving payload budgets", () => {
  const migration = readProjectFile(
    "supabase/migrations/20260619044500_task_069_sync_events_compacted_changed_count.sql",
  );

  assert.match(migration, /create or replace function public\.record_sync_event/);
  assert.match(migration, /p_changed_count < 0 or p_changed_count > 100000/);
  assert.match(migration, /pg_column_size\(v_metadata\) > 4096/);
  assert.match(migration, /pg_column_size\(p_entity_ids\) > 16384/);
  assert.match(migration, /if v_array_count > 250 then/);
  assert.match(migration, /grant execute on function public\.record_sync_event/);
});
