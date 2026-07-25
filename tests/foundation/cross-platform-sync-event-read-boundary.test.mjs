import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const SHOP_A = "10000000-0000-4000-8000-000000000001";
const SHOP_B = "10000000-0000-4000-8000-000000000002";
const OWNER_A = "20000000-0000-4000-8000-000000000001";
const OWNER_B = "20000000-0000-4000-8000-000000000002";

async function loadBoundaryModule() {
  const source = readFileSync(
    join(root, "src/server/sync-events/read-boundary.ts"),
    "utf8",
  )
    .replace(/^import "server-only";\r?\n\r?\n/, "")
    .replace(
      /import \{\s*canonicalPostgresUuid,\s*isCanonicalPostgresUuid,\s*\} from "@\/server\/shared\/postgres-uuid";\r?\n/,
      `const POSTGRES_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonicalPostgresUuid = (value) =>
  typeof value === "string" && POSTGRES_UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
const isCanonicalPostgresUuid = (value) =>
  typeof value === "string" &&
  value === value.toLowerCase() &&
  POSTGRES_UUID_PATTERN.test(value);
`,
    );
  const tempDir = await mkdtemp(join(tmpdir(), "sync-event-read-boundary-"));
  const modulePath = join(tempDir, "read-boundary.mjs");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "read-boundary.ts",
  });
  await writeFile(modulePath, outputText, "utf8");
  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    module: await import(pathToFileURL(modulePath).href),
  };
}

function row(overrides = {}) {
  return {
    authorized_shop_id: SHOP_A,
    batch_id: null,
    changed_count: 1,
    client_event_key: null,
    created_at: "2026-07-21T12:00:00.000000Z",
    domain: "catalog",
    entity_ids: { product_ids: ["30000000-0000-4000-8000-000000000001"] },
    event_type: "catalog_changed",
    expires_at: null,
    id: "41",
    metadata: {},
    owner_user_id: OWNER_A,
    registered_shop_device_id: null,
    requires_full_recovery: false,
    shop_id: SHOP_A,
    source: "database_atomic",
    source_device_key: null,
    source_scope: "shop_scoped",
    store_id: null,
    timestamp_valid: true,
    ...overrides,
  };
}

function envelope(eventRow, scope = {}) {
  return {
    eventMarker: "a".repeat(64),
    maxId: eventRow.id,
    maxResponseBytes: 4_194_304,
    payloadBytes: 512,
    rows: [eventRow],
    schemaVersion: "admin-sync-event-read-v1",
    scope: {
      kind: "shop_scoped",
      mappedLegacyOwnerUserId: null,
      ownerUserId: null,
      shopId: SHOP_A,
      ...scope,
    },
    totalCount: 1,
  };
}

function supabaseReturning(data) {
  return {
    async rpc() {
      return { data, error: null };
    },
  };
}

test("cross-platform sync-event reads reject mismatched post-RPC identities", async () => {
  const { cleanup, module } = await loadBoundaryModule();
  try {
    const cases = [
      {
        input: { limit: 10, shopId: SHOP_A },
        name: "other shop",
        response: envelope(row({ shop_id: SHOP_B })),
      },
      {
        input: { limit: 10, ownerUserId: OWNER_A },
        name: "other owner",
        response: envelope(
          row({
            authorized_shop_id: null,
            owner_user_id: OWNER_B,
            shop_id: null,
            source_scope: "legacy_owner_bridge",
          }),
          { kind: "platform_global", ownerUserId: OWNER_A, shopId: null },
        ),
      },
      {
        input: { domains: ["catalog"], limit: 10, shopId: SHOP_A },
        name: "other domain",
        response: envelope(row({
          domain: "prices",
          entity_ids: { price_ids: ["30000000-0000-4000-8000-000000000002"] },
          event_type: "prices_changed",
        })),
      },
      {
        input: { eventId: "41", limit: 10, shopId: SHOP_A },
        name: "other event",
        response: envelope(row({ id: "42" })),
      },
      {
        input: { limit: 10, shopId: SHOP_A },
        name: "legacy row in shop-only envelope",
        response: envelope(row({
          shop_id: null,
          source_scope: "legacy_owner_bridge",
        })),
      },
      {
        input: { limit: 10, shopId: SHOP_A },
        name: "missing IDs without recovery",
        response: envelope(row({ entity_ids: null })),
      },
      {
        input: { limit: 10, shopId: SHOP_A },
        name: "partial primary IDs",
        response: envelope(row({ changed_count: 2 })),
      },
      {
        input: { limit: 10, shopId: SHOP_A },
        name: "recovery row carrying IDs",
        response: envelope(row({ requires_full_recovery: true })),
      },
      {
        input: { limit: 10, shopId: SHOP_A },
        name: "invalid timestamp without recovery",
        response: envelope(row({ timestamp_valid: false })),
      },
      {
        input: { limit: 10, shopId: SHOP_A },
        name: "wrong mapped legacy owner",
        response: envelope(
          row({
            owner_user_id: OWNER_B,
            shop_id: null,
            source_scope: "legacy_owner_bridge",
          }),
          {
            kind: "authorized_shop_plus_legacy",
            mappedLegacyOwnerUserId: OWNER_A,
          },
        ),
      },
    ];

    for (const fixture of cases) {
      const result = await module.readSafeSyncEvents(
        supabaseReturning(fixture.response),
        fixture.input,
      );
      assert.equal(
        result.error,
        "sync_event_read_contract_invalid",
        fixture.name,
      );
      assert.equal(result.data, null, fixture.name);
    }
  } finally {
    await cleanup();
  }
});

test("cross-platform sync-event read accepts a bound legacy bridge row", async () => {
  const { cleanup, module } = await loadBoundaryModule();
  try {
    const legacy = row({
      authorized_shop_id: SHOP_A,
      shop_id: null,
      source_scope: "legacy_owner_bridge",
    });
    const result = await module.readSafeSyncEvents(
      supabaseReturning(envelope(legacy, {
        kind: "authorized_shop_plus_legacy",
        mappedLegacyOwnerUserId: OWNER_A,
      })),
      { domains: ["catalog"], limit: 10, shopId: SHOP_A },
    );

    assert.equal(result.error, null);
    assert.equal(result.data.rows.length, 1);
    assert.equal(result.data.rows[0].shopId, null);
    assert.equal(result.data.rows[0].authorizedShopId, SHOP_A);
  } finally {
    await cleanup();
  }
});

test("cross-platform sync-event read accepts a platform-global legacy row", async () => {
  const { cleanup, module } = await loadBoundaryModule();
  try {
    const legacy = row({
      authorized_shop_id: null,
      owner_user_id: OWNER_A,
      shop_id: null,
      source_scope: "legacy_owner_bridge",
    });
    const result = await module.readSafeSyncEvents(
      supabaseReturning(envelope(legacy, {
        kind: "platform_global",
        mappedLegacyOwnerUserId: null,
        ownerUserId: OWNER_A,
        shopId: null,
      })),
      { limit: 10, ownerUserId: OWNER_A },
    );

    assert.equal(result.error, null);
    assert.equal(result.data.rows[0].ownerUserId, OWNER_A);
  } finally {
    await cleanup();
  }
});
