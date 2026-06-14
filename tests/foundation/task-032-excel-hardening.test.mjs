import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  const absolutePath = join(root, relativePath);
  const source = readFileSync(absolutePath, "utf8");
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
    Buffer,
    exports: cjsModule.exports,
    module: cjsModule,
    require: (specifier) =>
      specifier === "server-only" ? {} : requireForTranspiledModule(specifier),
  });

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    context,
  );

  return cjsModule.exports;
}

test("TASK-032 Excel header detection handles shifted supplier workbooks and multilingual aliases", () => {
  const helper = loadTypeScriptModule(
    "src/server/shop-admin/catalog-import-contract.ts",
  );
  const shiftedChineseRows = [
    ["", "\u8ba2\u5355ID", "716813", "\u9500\u552e\u5355\u53f7"],
    ["", "\u5ba2\u6237 1832", "\u9879\u654f77762015-0"],
    [],
    [
      "NO",
      "ignored_extra",
      "\u4ea7\u54c1\u8d27\u53f7",
      "\u6761\u7801",
      "\u4ea7\u54c1\u540d1",
      "\u4ea7\u54c1\u540d2",
      "extra_quantity_label",
      "\u6570\u91cf",
      "\u5355\u4ef7",
      "\u552e\u4ef7",
      "\u603b\u4ef7",
    ],
  ];
  const chineseDetection = helper.detectCatalogImportHeaderRow(shiftedChineseRows);

  assert.equal(chineseDetection?.headerRowIndex, 3);
  assert.equal(chineseDetection?.headers.get("itemNumber"), 2);
  assert.equal(chineseDetection?.headers.get("barcode"), 3);
  assert.equal(chineseDetection?.headers.get("productName"), 4);
  assert.equal(chineseDetection?.headers.get("secondProductName"), 5);
  assert.equal(chineseDetection?.headers.get("stockQuantity"), 7);
  assert.equal(chineseDetection?.headers.get("purchasePrice"), 8);
  assert.equal(chineseDetection?.headers.get("discountedPrice"), 9);
  assert.equal(chineseDetection?.headers.get("lineTotal"), 10);
  assert.equal(chineseDetection?.headers.has("retailPrice"), false);

  const spanishDetection = helper.detectCatalogImportHeaderRow([
    [
      "Codigo Producto",
      "Nombre Producto",
      "Cantidad",
      "Precio",
      "Codigo de Barra",
      "Proveedor",
    ],
  ]);

  assert.equal(spanishDetection?.headers.get("itemNumber"), 0);
  assert.equal(spanishDetection?.headers.get("productName"), 1);
  assert.equal(spanishDetection?.headers.get("stockQuantity"), 2);
  assert.equal(spanishDetection?.headers.get("purchasePrice"), 3);
  assert.equal(spanishDetection?.headers.get("barcode"), 4);
  assert.equal(spanishDetection?.headers.get("supplierName"), 5);
});

test("TASK-032 Excel validation warns on duplicate SKUs while preserving non-destructive import semantics", () => {
  const helper = loadTypeScriptModule(
    "src/server/shop-admin/catalog-import-contract.ts",
  );
  const validation = helper.validateCatalogImportRows(
    {
      categories: [],
      products: [
        {
          barcode: "B-001",
          itemNumber: "SKU-DUP",
          productName: "Alpha",
          rowNumber: 2,
        },
        {
          barcode: "B-002",
          itemNumber: " sku-dup ",
          productName: "Beta",
          rowNumber: 3,
        },
        {
          barcode: "B-003",
          productName: "Gamma",
          rowNumber: 4,
        },
      ],
      suppliers: [],
    },
    {
      categories: [],
      products: [],
      suppliers: [],
    },
  );

  assert.deepEqual(
    Array.from(validation.rowErrors, (error) => error.code),
    [],
  );
  assert.deepEqual(
    Array.from(validation.rowWarnings, (warning) => warning.code),
    ["duplicate_product_sku"],
  );
  assert.equal(validation.rowWarnings[0].field, "itemNumber");
  assert.equal(validation.rowWarnings[0].row, 3);
  assert.equal(validation.summary.errors, 0);
  assert.equal(validation.summary.warnings, 1);
  assert.equal(validation.summary.newProducts, 2);
});

test("TASK-032 Excel safety covers invalid numbers, workbook uploads and formula injection sanitization", () => {
  const workbookSource = readProjectFile(
    "src/server/shop-admin/import-export-workbook.ts",
  );
  const actionContext = readProjectFile("src/server/shop-admin/action-context.ts");
  const readiness = loadTypeScriptModule(
    "src/server/shop-admin/import-export-readiness.ts",
  );

  for (const value of ["=SUM(A1:A2)", "+cmd", "-cmd", "@cmd", "\tcmd", "\rcmd"]) {
    assert.equal(readiness.sanitizeSpreadsheetCell(value), `'${value}`);
  }

  assert.equal(readiness.sanitizeSpreadsheetCell("plain text"), "plain text");
  assert.match(workbookSource, /Value must be a non-negative number\./);
  assert.match(workbookSource, /productNumberValue\(/);
  assert.match(workbookSource, /\.endsWith\("\.xlsx"\) \|\| lowerName\.endsWith\("\.xls"\)/);
  assert.match(actionContext, /Upload a \.xlsx or \.xls workbook\./);
  assert.match(workbookSource, /stringCell\(product\.barcode\)/);
  assert.match(workbookSource, /stringCell\(supplier\.name\)/);
  assert.match(workbookSource, /stringCell\(category\.name\)/);
  assert.equal(
    existsSync(
      join(root, "docs/TASKS/EVIDENCE/TASK-032/README.md"),
    ),
    true,
  );
});
