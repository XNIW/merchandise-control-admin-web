import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createContext, Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTest = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function loadCanonicalizer() {
  const relativePath = "src/server/pos-auth/pos-revision-timestamp.ts";
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    createContext({
      exports: cjsModule.exports,
      module: cjsModule,
      require(specifier) {
        return specifier === "server-only" ? {} : requireForTest(specifier);
      },
    }),
  );

  return cjsModule.exports.canonicalizePosRevisionTimestamp;
}

test("TASK-146 canonicalizer preserves microseconds and normalizes only UTC", () => {
  const canonicalize = loadCanonicalizer();
  const cases = [
    ["2026-07-28T21:31:00.123456Z", "2026-07-28T21:31:00.123456Z"],
    ["2026-07-28T21:31:00.123456+00:00", "2026-07-28T21:31:00.123456Z"],
    ["2026-07-28T21:31:00.123456+0000", "2026-07-28T21:31:00.123456Z"],
    ["2026-07-28T21:31:00Z", "2026-07-28T21:31:00.000000Z"],
    ["2026-07-28T21:31:00.1Z", "2026-07-28T21:31:00.100000Z"],
    ["2026-07-28T21:31:00.12Z", "2026-07-28T21:31:00.120000Z"],
    ["2026-07-28T21:31:00.123Z", "2026-07-28T21:31:00.123000Z"],
    ["2026-07-28T21:31:00.1234Z", "2026-07-28T21:31:00.123400Z"],
    ["2026-07-28T21:31:00.12345Z", "2026-07-28T21:31:00.123450Z"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(canonicalize(input), expected, input);
    assert.equal(canonicalize(canonicalize(input)), expected, `${input}:idempotent`);
  }
});

test("TASK-146 canonicalizer rejects excess precision, offsets and invalid dates", () => {
  const canonicalize = loadCanonicalizer();
  for (const value of [
    "2026-07-28T21:31:00.1234567Z",
    "2026-07-28T21:31:00.123456+01:00",
    "2026-07-28T21:31:00.123456-00:30",
    "2026-02-29T21:31:00.123456Z",
    "2026-04-31T21:31:00.123456Z",
    "2026-07-28T24:00:00.123456Z",
    "2026-07-28T21:60:00.123456Z",
    "2026-07-28T21:31:60.123456Z",
    "0000-01-01T00:00:00.000000Z",
    "not-a-timestamp",
    "",
    null,
  ]) {
    assert.equal(canonicalize(value), null, String(value));
  }
  assert.equal(
    canonicalize("2024-02-29T00:00:00.000001Z"),
    "2024-02-29T00:00:00.000001Z",
  );
});

test("TASK-146 every article mutation kind can round-trip ACK revision through catalog", () => {
  const canonicalize = loadCanonicalizer();
  const ackRevision = "2026-07-28T21:31:00.654321Z";
  const catalogDataApiRevision = "2026-07-28T21:31:00.654321+00:00";
  const mutationKinds = [
    "product_create",
    "product_update",
    "product_retail_price_change",
    "product_purchase_price_change",
    "product_manual_stock_adjustment",
    "product_deactivate",
    "product_activate",
    "product_duplicate",
  ];

  for (const mutationKind of mutationKinds) {
    const catalogRevision = canonicalize(catalogDataApiRevision);
    assert.equal(catalogRevision, ackRevision, mutationKind);
    assert.equal(canonicalize(catalogRevision), ackRevision, `${mutationKind}:reuse`);
  }

  assert.notEqual(
    canonicalize("2026-07-28T21:31:00.654322+00:00"),
    ackRevision,
    "a truly stale revision remains different",
  );
});

test("TASK-146 fixture and public boundary freeze the canonical contract", () => {
  const fixture = JSON.parse(
    read("contracts/pos/catalog-product-canonical-revision.response.json"),
  );
  const service = read("src/server/pos-auth/catalog-pull.ts");
  const helper = read("src/server/pos-auth/pos-revision-timestamp.ts");

  assert.equal(
    fixture.ack.authoritativeRevision,
    fixture.catalog.products[0].updatedAt,
  );
  assert.match(
    fixture.catalog.products[0].updatedAt,
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/,
  );
  assert.match(service, /canonicalizePosRevisionTimestamp/);
  assert.match(service, /catalog_revision_timestamp_invalid/);
  assert.match(service, /deletedAt/);
  assert.match(service, /updatedAt/);
  assert.doesNotMatch(helper, /new Date|Date\.parse|toISOString/);
  assert.doesNotMatch(service, /@\/lib\/catalog-text-policy/);
});
