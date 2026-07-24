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
const catalogV2Migration = read(
  "supabase/migrations/20260719170600_task_139_pos_catalog_v2_pagination_snapshot.sql",
);
const leaseMigration = read(
  "supabase/migrations/20260722013109_cross_platform_sync_event_completeness.sql",
);

assert.match(catalogPull, /loadCatalogPageV2/);
assert.match(catalogPull, /buildCatalogV2Cursor/);
assert.match(catalogPull, /catalogVersion:\s*catalogRevision/);
assert.match(catalogPull, /cursorFingerprint/);
assert.doesNotMatch(catalogPull, /\.range\s*\(/);
assert.doesNotMatch(catalogPull, /sync_cursor:\s*syncCursor/);

assert.match(catalogRevision, /rpc\("pos_catalog_revision_for_lease_v3"/);
assert.match(catalogRevision, /rpc\("pos_catalog_pull_page_for_lease_v3"/);
assert.match(catalogRevision, /p_pos_session_id:/);
assert.match(catalogRevision, /p_shop_device_id:/);
assert.match(catalogRevision, /p_staff_id:/);
assert.doesNotMatch(catalogRevision, /rpc\("pos_catalog_(?:revision|pull_page)_v2"/);
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

assert.match(catalogV2Migration, /returns jsonb/);
assert.match(catalogV2Migration, /language plpgsql\s+stable/);
assert.match(catalogV2Migration, /limit p_limit \+ 1/);
assert.match(catalogV2Migration, /jsonb_array_length\(candidates\) > p_limit/);
assert.match(
  catalogV2Migration,
  /grant execute on function public\.pos_catalog_pull_page_v2[\s\S]*to service_role/,
);
assert.match(catalogV2Migration, /from public, anon, authenticated/);
assert.match(
  catalogV2Migration,
  /referencing old table as old_rows new table as new_rows/,
);
assert.match(
  catalogV2Migration,
  /created_at::timestamp without time zone at time zone 'UTC'/,
);
assert.doesNotMatch(
  catalogV2Migration,
  /pos_catalog_revisions[\s\S]{0,200}references public\.shops/,
);
assert.match(
  leaseMigration,
  /create or replace function public\.pos_catalog_revision_for_lease_v3[\s\S]*app_private\.pos_runtime_lease_is_valid_v1[\s\S]*return public\.pos_catalog_revision_v2/,
);
assert.match(
  leaseMigration,
  /create function public\.pos_catalog_pull_page_for_lease_v3[\s\S]*app_private\.pos_runtime_lease_is_valid_v1[\s\S]*return public\.pos_catalog_pull_page_v2/,
);
assert.match(
  leaseMigration,
  /revoke all on function public\.pos_catalog_revision_v2\(uuid\)\s+from service_role/,
);
assert.match(
  leaseMigration,
  /revoke all on function public\.pos_catalog_pull_page_v2\([\s\S]*\) from service_role/,
);
assert.match(
  leaseMigration,
  /grant execute on function public\.pos_catalog_revision_for_lease_v3[\s\S]*to service_role/,
);
assert.match(
  leaseMigration,
  /grant execute on function public\.pos_catalog_pull_page_for_lease_v3[\s\S]*to service_role/,
);

console.log(
  "PASS: POS catalog pull uses signed snapshot-bound keyset pagination with an internal limit+1 sentinel.",
);
