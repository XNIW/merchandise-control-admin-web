import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const catalogPull = read("src/server/pos-auth/catalog-pull.ts");
const catalogContract = read("src/server/pos-auth/catalog-sync-contract.ts");
const catalogRevision = read("src/server/pos-auth/catalog-revision.ts");
const migration = read(
  "supabase/migrations/20260719170600_task_139_pos_catalog_v2_pagination_snapshot.sql",
);

assert.match(catalogPull, /loadCatalogPageV2/);
assert.match(catalogPull, /buildCatalogV2Cursor/);
assert.match(catalogPull, /catalogVersion:\s*catalogRevision/);
assert.match(catalogPull, /cursorFingerprint/);
assert.doesNotMatch(catalogPull, /\.range\s*\(/);
assert.doesNotMatch(catalogPull, /sync_cursor:\s*syncCursor/);

assert.match(catalogRevision, /rpc\("pos_catalog_pull_page_v2"/);
assert.match(catalogRevision, /snapshotAt,/);
assert.doesNotMatch(
  catalogRevision,
  /snapshotAt:\s*new Date\(snapshotAt\)\.toISOString\(\)/,
);

assert.match(catalogContract, /createHmac\("sha256"/);
assert.match(catalogContract, /timingSafeEqual/);
assert.match(catalogContract, /MAX_CATALOG_V2_CURSOR_LENGTH\s*=\s*512/);
assert.match(catalogContract, /validateTimestampPreservingPrecision/);
assert.match(
  catalogContract,
  /"categories",\s*"suppliers",\s*"products",\s*"prices"/,
);

assert.match(migration, /returns jsonb/);
assert.match(migration, /language plpgsql\s+stable/);
assert.match(migration, /limit p_limit \+ 1/);
assert.match(migration, /jsonb_array_length\(candidates\) > p_limit/);
assert.match(
  migration,
  /grant execute on function public\.pos_catalog_pull_page_v2[\s\S]*to service_role/,
);
assert.match(migration, /from public, anon, authenticated/);
assert.match(
  migration,
  /referencing old table as old_rows new table as new_rows/,
);
assert.match(
  migration,
  /created_at::timestamp without time zone at time zone 'UTC'/,
);
assert.doesNotMatch(
  migration,
  /pos_catalog_revisions[\s\S]{0,200}references public\.shops/,
);

console.log(
  "PASS: POS catalog pull uses signed snapshot-bound keyset pagination with an internal limit+1 sentinel.",
);
