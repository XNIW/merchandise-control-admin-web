import assert from "node:assert/strict";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  statSync,
} from "node:fs";
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

  const files = listExcelLikeFiles(folder);
  assert.ok(files.length > 0, "No supplier Excel files found");

  const summaries = [];
  for (const path of files) {
    const fileName = path.slice(folder.length + 1);
    const sizeBytes = statSync(path).size;
    const workbookType = workbookTypeFor(path);
    if (sizeBytes > MAX_IMPORT_BYTES) {
      const parsed = await parseWorkbook({
        bytes: Buffer.alloc(MAX_IMPORT_BYTES + 1),
        fileName,
        importMode: "supplier",
        mimeType: workbookType === "xls"
          ? "application/vnd.ms-excel"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      assert.ok("ok" in parsed, `${fileName} should return a size guard result`);
      assert.equal(
        parsed.code,
        "file_too_large",
        `${fileName} returned unexpected parser result`,
      );
      summaries.push({
        fileName,
        result: "file_too_large",
        sizeCategory: "large",
      });
      continue;
    }

    const parsed = await parseWorkbook({
      bytes: readFileSync(path),
      fileName,
      importMode: "supplier",
      mimeType: workbookType === "xls"
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

function listExcelLikeFiles(folder) {
  const files = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      files.push(...listExcelLikeFiles(path));
      continue;
    }
    if (!entry.isFile() || entry.name.startsWith("~$")) {
      continue;
    }
    if (workbookTypeFor(path)) {
      files.push(path);
    }
  }
  return files.sort();
}

function workbookTypeFor(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".xls") return "xls";
  if (extension === ".xlsx") return "xlsx";
  if (extension.length > 0) return "";
  const head = Buffer.alloc(8);
  const fd = openSync(path, "r");
  let bytesRead = 0;
  try {
    bytesRead = readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  const signature = head.subarray(0, bytesRead);
  if (signature.length >= 4 && signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 0x03 && signature[3] === 0x04) {
    return "xlsx";
  }
  if (
    signature.length >= 8 &&
    signature[0] === 0xd0 &&
    signature[1] === 0xcf &&
    signature[2] === 0x11 &&
    signature[3] === 0xe0 &&
    signature[4] === 0xa1 &&
    signature[5] === 0xb1 &&
    signature[6] === 0x1a &&
    signature[7] === 0xe1
  ) {
    return "xls";
  }
  return "";
}
