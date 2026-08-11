import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createContext, Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTranspiledModule = createRequire(import.meta.url);
const fixturePath = join(
  root,
  "tests",
  "fixtures",
  "catalog-text-policy-v1.json",
);
const sourcePath = join(root, "src", "lib", "catalog-text-policy.ts");
const fixtureBytes = readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString("utf8"));
const source = readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
});
const policy = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
);

function loadPosCatalogImportParser() {
  const relativePath = "src/server/pos-auth/catalog-import-sync.ts";
  const absolutePath = join(root, relativePath);
  const serviceSource = readFileSync(absolutePath, "utf8");
  const serviceTranspiled = ts.transpileModule(serviceSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };

  function requireFromTest(id) {
    if (id === "server-only") {
      return {};
    }

    if (id === "@/lib/catalog-text-policy") {
      return policy;
    }

    if (id === "./pos-contract") {
      return { POS_CATALOG_IMPORT_SCHEMA_VERSION: "pos-catalog-import-v1" };
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
    AbortController,
    AbortSignal,
    Buffer,
    TextEncoder,
    clearTimeout,
    exports: cjsModule.exports,
    module: cjsModule,
    require: requireFromTest,
    setTimeout,
  });

  new Script(
    `${serviceTranspiled.outputText}
module.exports.parseCatalogImportInput = parseCatalogImportInput;`,
    { filename: relativePath },
  ).runInContext(context);

  return cjsModule.exports.parseCatalogImportInput;
}

function posCatalogImportInput(items) {
  return {
    batch: {
      attemptCount: 1,
      clientImportId: "task142-functional",
      createdAt: "2026-07-27T12:00:00.000Z",
      idempotencyKey: "task142-functional-key",
      sourceFileName: "task142.xlsx",
    },
    deviceToken: "device-token",
    items,
    posSessionId: "00000000-0000-4000-8000-000000000001",
    schemaVersion: "pos-catalog-import-v1",
    sessionToken: "session-token",
    shopDeviceId: "00000000-0000-4000-8000-000000000002",
    source: "supplier_excel",
    summary: {
      newProducts: items.length,
      noChangeRows: 0,
      skippedRows: 0,
      updatedProducts: 0,
      warningCount: 0,
    },
  };
}

function posCatalogItem({
  barcode,
  clientItemId,
  itemNumber,
  rowNumber,
}) {
  return {
    barcode,
    changeKind: "new",
    clientItemId,
    itemNumber,
    productName: `Product ${rowNumber}`,
    rowNumber,
  };
}

function inputFor(testCase) {
  if (typeof testCase.input === "string") {
    return testCase.input;
  }

  assert.equal(testCase.inputGenerator?.kind, "repeat");
  return testCase.inputGenerator.value.repeat(testCase.inputGenerator.count);
}

function assertExpectedResult(testCase, result) {
  assert.equal(result.status, testCase.expectedStatus, testCase.id);

  if (result.status === "rejected") {
    assert.equal(result.reason, testCase.expectedReason, testCase.id);
    return;
  }

  assert.equal(result.value, testCase.expectedValue, testCase.id);

  if (testCase.expectedChanges) {
    for (const expectedChange of testCase.expectedChanges) {
      assert.ok(
        result.changes.includes(expectedChange),
        `${testCase.id}: missing ${expectedChange}`,
      );
    }
  }
}

test("TASK-142 golden fixture has the frozen cross-platform digest", () => {
  assert.equal(fixture.policyVersion, "catalog_text_policy_v1");
  assert.equal(
    createHash("sha256")
      .update(fixtureBytes.toString("utf8").replace(/\r\n/g, "\n"))
      .digest("hex"),
    "139d63eedea47b54bb63a9289bef5fc6f7372668f209aac7753b586da7ccd9f8",
  );
});

test("TASK-142 display vectors match typed results and remain idempotent", () => {
  for (const testCase of fixture.displayCases) {
    const result = policy.canonicalizeCatalogDisplayText(inputFor(testCase), {
      maxLength: testCase.maxLength,
      required: testCase.required,
    });

    assertExpectedResult(testCase, result);

    if (result.status !== "rejected") {
      const repeated = policy.canonicalizeCatalogDisplayText(result.value, {
        maxLength: testCase.maxLength,
        required: testCase.required,
      });

      assert.equal(repeated.status, "unchanged", testCase.id);
      assert.equal(repeated.value, result.value, testCase.id);
    }
  }
});

test("TASK-142 strict vectors reject controls instead of replacing them", () => {
  for (const testCase of fixture.strictCases) {
    const result = policy.validateCatalogIdentityText(inputFor(testCase), {
      maxLength: testCase.maxLength,
      required: testCase.required,
    });

    assertExpectedResult(testCase, result);

    if (result.status !== "rejected") {
      const repeated = policy.validateCatalogIdentityText(result.value, {
        maxLength: testCase.maxLength,
        required: testCase.required,
      });

      assert.equal(repeated.status, "unchanged", testCase.id);
      assert.equal(repeated.value, result.value, testCase.id);
    }
  }
});

test("TASK-142 malformed Unicode vectors fail with explicit reasons", () => {
  for (const testCase of fixture.encodingCases) {
    let result;

    if (testCase.inputEncoding === "utf16_code_units") {
      const value = String.fromCharCode(
        ...testCase.inputCodeUnitsHex.map((unit) => Number.parseInt(unit, 16)),
      );
      result = testCase.class === "display"
        ? policy.canonicalizeCatalogDisplayText(value, testCase)
        : policy.validateCatalogIdentityText(value, testCase);
    } else {
      result = policy.decodeCatalogUtf8(
        Uint8Array.from(
          testCase.inputBytesHex
            .match(/.{2}/g)
            .map((value) => Number.parseInt(value, 16)),
        ),
        testCase,
      );
    }

    assertExpectedResult(testCase, result);
  }
});

test("TASK-142 strict trim collision never merges identities", () => {
  for (const testCase of fixture.collisionCases) {
    const result = policy.findCatalogIdentityCollision(testCase.inputs, {
      maxLength: fixture.limits.itemNumber,
      required: true,
    });

    assertExpectedResult(testCase, result);
  }
});

test("TASK-142 POS parser blocks raw trim collisions and preserves case-distinct identities", () => {
  const parseCatalogImportInput = loadPosCatalogImportParser();
  const barcodeCollision = posCatalogImportInput([
    posCatalogItem({
      barcode: "12345678",
      clientItemId: "barcode-1",
      itemNumber: "ITEM-1",
      rowNumber: 1,
    }),
    posCatalogItem({
      barcode: " 12345678 ",
      clientItemId: "barcode-2",
      itemNumber: "ITEM-2",
      rowNumber: 2,
    }),
  ]);
  const itemCollision = posCatalogImportInput([
    posCatalogItem({
      barcode: "12345678",
      clientItemId: "item-1",
      itemNumber: "ITEM-1",
      rowNumber: 1,
    }),
    posCatalogItem({
      barcode: "87654321",
      clientItemId: "item-2",
      itemNumber: " ITEM-1 ",
      rowNumber: 2,
    }),
  ]);
  const caseDistinct = posCatalogImportInput([
    posCatalogItem({
      barcode: "CaseCode",
      clientItemId: "case-1",
      itemNumber: "CaseItem",
      rowNumber: 1,
    }),
    posCatalogItem({
      barcode: "casecode",
      clientItemId: "case-2",
      itemNumber: "caseitem",
      rowNumber: 2,
    }),
  ]);

  assert.equal(parseCatalogImportInput(barcodeCollision), null);
  assert.equal(parseCatalogImportInput(itemCollision), null);

  const parsedCaseDistinct = parseCatalogImportInput(caseDistinct);
  assert.notEqual(parsedCaseDistinct, null);
  assert.equal(parsedCaseDistinct.items.length, 2);
  assert.equal(parsedCaseDistinct.items[0].barcode, "CaseCode");
  assert.equal(parsedCaseDistinct.items[1].barcode, "casecode");
});

test("TASK-142 applies one policy at every Admin catalog write boundary", () => {
  const mutations = readFileSync(
    join(root, "src/server/shop-admin/catalog-mutations.ts"),
    "utf8",
  );
  const actions = readFileSync(join(root, "src/app/shop/actions.ts"), "utf8");
  const workbook = readFileSync(
    join(root, "src/server/shop-admin/import-export-workbook.ts"),
    "utf8",
  );
  const posImport = readFileSync(
    join(root, "src/server/pos-auth/catalog-import-sync.ts"),
    "utf8",
  );
  const posPull = readFileSync(
    join(root, "src/server/pos-auth/catalog-pull.ts"),
    "utf8",
  );
  const panel = readFileSync(
    join(root, "src/app/shop/_components/ImportExportActionPanel.tsx"),
    "utf8",
  );
  const migration = readFileSync(
    join(
      root,
      "supabase/migrations/20260727055520_task_142_catalog_text_policy_v1.sql",
    ),
    "utf8",
  );

  assert.match(mutations, /canonicalCatalogProductInput/);
  assert.match(mutations, /canonicalCatalogEntityName/);
  assert.match(actions, /normalizeCatalogRelationName/);
  assert.match(workbook, /catalogWorkbookDisplayText/);
  assert.match(workbook, /catalogWorkbookIdentityText/);
  assert.match(workbook, /CATALOG_TEXT_NORMALIZED_CODE/);
  assert.match(workbook, /textNormalizations/);
  assert.match(workbook, /applyRowAdjustments\(parsed, syncAdjustments\)/);
  assert.match(posImport, /validateCatalogIdentityText/);
  assert.match(posImport, /canonicalizeCatalogDisplayText/);
  assert.match(posImport, /hasIdentityCollisionAfterTrim/);
  assert.doesNotMatch(posImport, /barcode\.toUpperCase\(\)/);
  assert.match(posPull, /isCanonicalCatalogDisplayText/);
  assert.match(posPull, /isCanonicalCatalogIdentityText/);
  assert.match(
    posPull,
    /Boolean\(row\.product_name \|\| row\.second_product_name \|\| row\.item_number\)/,
  );
  assert.match(panel, /edit\.productName \?\? row\.productName/);
  assert.match(panel, /edit\.secondProductName/);
  assert.match(panel, /edit\.itemNumber/);
  assert.match(
    migration,
    /before insert or update of name, deleted_at, shop_id/,
  );
  assert.match(
    migration,
    /barcode, item_number, product_name, second_product_name, deleted_at, shop_id/,
  );
  assert.doesNotMatch(
    workbook,
    /function productTextValue[\s\S]*?return normalizeWorkbookText\(value\);/,
  );
  assert.doesNotMatch(
    posImport,
    /const barcode = normalizeText\(stringField\(input, "barcode"\)/,
  );
});
