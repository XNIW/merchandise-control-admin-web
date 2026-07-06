import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function functionBody(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);

  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing ${endNeedle}`);

  return source.slice(start, end);
}

const catalogPull = read("src/server/pos-auth/catalog-pull.ts");
const catalogContract = read("src/server/pos-auth/catalog-sync-contract.ts");

const handlerBody = functionBody(
  catalogPull,
  "export async function handlePosCatalogPull",
  "  return {",
);
const pageBody = functionBody(
  catalogPull,
  "function pageCatalogScopeRows",
  "async function includeReferencedCatalogRows",
);

assert.match(catalogContract, /from\s*=\s*options\.offsets\[entity\]/);
assert.match(catalogContract, /to:\s*from\s*\+\s*options\.limit/);
assert.match(catalogContract, /rows\.length\s*>\s*limit/);
assert.match(catalogContract, /rows\.slice\(0,\s*limit\)/);

assert.match(catalogPull, /async function hasShopCatalogRows/);
assert.match(handlerBody, /const useLegacyOwnerBridge = Boolean\(ownerUserId\) && !shopCatalogRowsProbe\.hasRows/);
assert.match(handlerBody, /const catalogScope = useLegacyOwnerBridge[\s\S]*\? "legacy_owner_bridge"[\s\S]*: "shop_scoped"/);

for (const [entity, range] of [
  ["products", "productRange"],
  ["categories", "categoryRange"],
  ["suppliers", "supplierRange"],
  ["prices", "priceRange"],
]) {
  const boundedRange = new RegExp(
    `${entity === "prices" ? "pricesQuery" : `${entity}Query`}\\.range\\(${range}\\.from,\\s*${range}\\.to\\)`,
  );
  const legacyBoundedRange = new RegExp(
    `legacy${entity[0].toUpperCase()}${entity.slice(1)}Query\\.range\\(${range}\\.from,\\s*${range}\\.to\\)`,
  );

  assert.match(handlerBody, boundedRange, `${entity} query must use bounded range`);
  assert.match(
    handlerBody,
    legacyBoundedRange,
    `legacy ${entity} query must use bounded range`,
  );
  assert.doesNotMatch(
    handlerBody,
    new RegExp(`\\.range\\(0,\\s*${range}\\.to\\)`),
    `${entity} query must not grow from zero on deep pages`,
  );
}

assert.doesNotMatch(
  pageBody,
  /slice\(range\.from,\s*range\.to\s*\+\s*1\)/,
  "page helper must not slice deep offsets in memory after Supabase range",
);
assert.doesNotMatch(
  handlerBody,
  /rows\.slice\(range\.from/,
  "handler must not slice deep offsets in memory",
);

console.log("PASS: POS catalog pull paging is bounded by cursor offsets.");
