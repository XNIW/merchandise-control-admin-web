import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { Script, createContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTranspiledModule = createRequire(import.meta.url);
const moduleCache = new Map();

function loadTypeScriptModule(relativePath, exportNames = []) {
  if (moduleCache.has(relativePath)) {
    return moduleCache.get(relativePath);
  }

  const source = readFileSync(join(root, relativePath), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };
  moduleCache.set(relativePath, cjsModule.exports);

  function requireFromTest(id) {
    if (id === "server-only") {
      return {};
    }
    if (id === "./catalog-import-contract") {
      return loadTypeScriptModule("src/server/shop-admin/catalog-import-contract.ts");
    }
    if (id === "./import-export-readiness") {
      return loadTypeScriptModule("src/server/shop-admin/import-export-readiness.ts");
    }
    if (id === "./action-context") {
      return {
        mapShopAdminRpcResult: () => ({ code: "stubbed", ok: false }),
        resolveShopActionContext: async () => ({
          result: { code: "stubbed", ok: false },
          status: "stubbed",
        }),
        shopAdminActionResult: (code, payload) => ({ code, ...payload }),
      };
    }
    if (id.startsWith("./") || id.startsWith("@/")) {
      return new Proxy(
        {},
        {
          get() {
            return () => {
              throw new Error(`Stubbed dependency ${id} was invoked`);
            };
          },
        },
      );
    }

    return requireForTranspiledModule(id);
  }

  const context = createContext({
    Buffer,
    console,
    crypto: globalThis.crypto,
    exports: cjsModule.exports,
    module: cjsModule,
    require: requireFromTest,
  });
  const privateExports = exportNames
    .map((name) => `module.exports.${name} = ${name};`)
    .join("\n");
  new Script(`${transpiled.outputText}\n${privateExports}`, {
    filename: relativePath,
  }).runInContext(context);
  moduleCache.set(relativePath, cjsModule.exports);
  return cjsModule.exports;
}

test("supplier Excel Drive smoke parses real workbooks without exposing rows", async (t) => {
  const folder = process.env.SUPPLIER_EXCEL_SMOKE_DIR;
  if (!folder) {
    t.skip("SUPPLIER_EXCEL_SMOKE_DIR not set");
    return;
  }
  assert.equal(existsSync(folder), true, "SUPPLIER_EXCEL_SMOKE_DIR missing");

  const { parseWorkbook } = loadTypeScriptModule(
    "src/server/shop-admin/import-export-workbook.ts",
    ["parseWorkbook"],
  );
  const { MAX_IMPORT_BYTES } = loadTypeScriptModule(
    "src/server/shop-admin/import-export-readiness.ts",
  );

  const files = readdirSync(folder)
    .filter((name) => /\.xlsx?$/i.test(name))
    .sort();
  assert.ok(files.length > 0, "No supplier Excel files found");

  const summaries = [];
  for (const fileName of files) {
    const path = join(folder, fileName);
    const sizeBytes = statSync(path).size;
    const extension = extname(fileName).toLowerCase();
    const parsed = await parseWorkbook({
      bytes: readFileSync(path),
      fileName,
      importMode: "supplier",
      mimeType: extension === ".xls"
        ? "application/vnd.ms-excel"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    if ("ok" in parsed) {
      assert.equal(
        parsed.code,
        "file_too_large",
        `${fileName} returned unexpected parser result`,
      );
      assert.ok(sizeBytes > MAX_IMPORT_BYTES, `${fileName} should exceed max import size`);
      summaries.push({
        fileName,
        result: "file_too_large",
        sizeCategory: "large",
      });
      continue;
    }

    summaries.push({
      errors: parsed.rowErrors.length,
      fileName,
      headerRow: parsed.detectedHeaderRow,
      parsedRows: parsed.products.length,
      result: "parsed",
      selectedSheet: parsed.selectedProductSheet,
      sheetsDetected: parsed.workbookMetadata.sheetNames.length,
      unmappedColumns: parsed.unmappedColumns.length,
      validRows: parsed.validRows,
      warnings: parsed.rowWarnings.length,
    });
  }

  console.log(JSON.stringify({ fileCount: summaries.length, ok: true, files: summaries }));
});
