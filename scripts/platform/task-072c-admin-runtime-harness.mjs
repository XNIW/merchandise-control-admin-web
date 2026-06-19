#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertLocalTargetEnv,
  assertNoProductionProjectRef,
  assertStagingTargetEnv,
} from "../testing/target-guardrails.mjs";

const root = process.cwd();
const defaultEnvFile = ".env.local";
const defaultPrefix = "TASK072C_";
const allowedCommands = new Set(["cleanup-counts", "status", "verify"]);
const historyOverlayMaxBytes = 512 * 1024;
const maxRows = 250;
const usage = `
Usage:
  TEST_TARGET=local node scripts/platform/task-072c-admin-runtime-harness.mjs verify --shop-id=<uuid>
  TEST_TARGET=staging ALLOW_STAGING_E2E=yes CONFIRM_STAGING_E2E=yes \\
    ALLOWED_STAGING_SUPABASE_PROJECT_REFS=<ref> \\
    node scripts/platform/task-072c-admin-runtime-harness.mjs cleanup-counts --shop-id=<uuid>

Commands:
  verify          Query TASK072C_* catalog/history/sync rows and overlay status.
  cleanup-counts  Same read-only queries, labelled for post-cleanup checks.
  status          Alias of verify.

Options:
  --shop-id=<uuid>      Required verified Admin Web shop_id.
  --prefix=<text>       Synthetic prefix. Defaults to TASK072C_.
  --env-file=<path>     Runtime env file. Defaults to .env.local.
  --require-data        Exit non-zero when no prefixed rows/events are visible.
  --json                Print only the JSON payload.
`;

function parseArgs(argv) {
  const parsed = { _: [] };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const [key, ...valueParts] = withoutPrefix.split("=");

    parsed[key] = valueParts.length > 0 ? valueParts.join("=") : true;
  }

  return parsed;
}

function fail(code, message, status = 2) {
  console.error(`[task-072c-admin] FAIL ${code}: ${message}`);
  process.exit(status);
}

function info(message) {
  console.log(`[task-072c-admin] ${message}`);
}

function omitField(row, field) {
  const sanitized = { ...row };
  delete sanitized[field];
  return sanitized;
}

function parseEnvFile(relativePath) {
  const absolutePath = join(root, relativePath);

  if (!existsSync(absolutePath)) {
    return {};
  }

  const values = {};

  for (const rawLine of readFileSync(absolutePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadRuntimeEnv({ envFile, target }) {
  const fileEnv = parseEnvFile(envFile);
  const env = {
    ...fileEnv,
    ...process.env,
  };

  if (target) {
    env.TEST_TARGET = target;
  }

  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((key) => !env[key]?.trim());

  if (missing.length > 0) {
    fail(
      "BLOCKED_SERVER_ENV_REQUIRED",
      `Missing server-side runtime env names: ${missing.join(", ")}.`,
    );
  }

  try {
    if (env.TEST_TARGET === "local") {
      assertLocalTargetEnv(env);
    } else if (env.TEST_TARGET === "staging") {
      assertStagingTargetEnv(env, { requireConfirmation: true });
    } else {
      fail(
        "BLOCKED_TEST_TARGET_REQUIRED",
        "Set TEST_TARGET to local or staging. Production is not supported.",
      );
    }

    assertNoProductionProjectRef(env);
  } catch (error) {
    fail(error.code ?? "BLOCKED_TARGET_GUARD", error.message);
  }

  return env;
}

function projectRefFromUrl(value) {
  try {
    const hostname = new URL(value).hostname;

    return hostname.endsWith(".supabase.co") ? hostname.split(".")[0] : "local";
  } catch {
    return "unknown";
  }
}

function redactId(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= 12) {
    return `${normalized.slice(0, 4)}...`;
  }

  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

function redactRef(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "unknown";
  }

  if (normalized === "local") {
    return "local";
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-3)}`;
}

function cleanText(value, max = 96) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function isSensitiveJsonKey(key) {
  return /token|secret|password|pin|hash|credential|auth|email|path|file|workbook/i.test(
    key,
  );
}

function redactJson(value, depth = 0) {
  if (depth > 6) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactJson(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        isSensitiveJsonKey(key) ? "redacted" : key,
        isSensitiveJsonKey(key) ? "[redacted]" : redactJson(item, depth + 1),
      ]),
    );
  }

  if (typeof value === "string") {
    return cleanText(value, 160);
  }

  return value ?? null;
}

function stringifyRedactedJson(value, max = 500) {
  const rendered = JSON.stringify(redactJson(value));

  return rendered.length > max ? `${rendered.slice(0, max)}...` : rendered;
}

function createAdminClient(env) {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          "X-Client-Info":
            "merchandise-control-admin-web/task-072c-admin-runtime-harness",
        },
      },
    },
  );
}

function isLegacySchemaError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = error.code;

  return code === "42703" || code === "PGRST204" || code === "PGRST205";
}

function sanitizePrefix(value) {
  const normalized = String(value ?? defaultPrefix)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  if (!/^TASK[0-9A-Z_-]{3,80}$/i.test(normalized)) {
    fail(
      "BLOCKED_SYNTHETIC_PREFIX_REQUIRED",
      "Use a synthetic TASK-prefixed marker such as TASK072C_.",
    );
  }

  return normalized;
}

function prefixOrFilter(textColumns, prefix) {
  return textColumns.map((column) => `${column}.ilike.*${prefix}*`).join(",");
}

function prefixMatch(value, prefix) {
  return String(value ?? "").toLowerCase().includes(prefix.toLowerCase());
}

function gridFromJson(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => (Array.isArray(row) ? row : []));
}

function analyzeOverlay(row) {
  const dataRows = gridFromJson(row.data);
  const overlay = row.session_overlay;
  const overlayBytes =
    overlay === null || overlay === undefined
      ? 0
      : new TextEncoder().encode(JSON.stringify(overlay)).length;

  if (row.payload_version < 2) {
    return {
      completeRows: 0,
      editableRows: 0,
      overlayBytes,
      overlaySchema: null,
      overlayStatus: "legacy_v1",
      rowCount: dataRows.length,
    };
  }

  if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
    return {
      completeRows: 0,
      editableRows: 0,
      overlayBytes,
      overlaySchema: null,
      overlayStatus: "missing",
      rowCount: dataRows.length,
    };
  }

  if (overlayBytes > historyOverlayMaxBytes) {
    return {
      completeRows: 0,
      editableRows: 0,
      overlayBytes,
      overlaySchema: null,
      overlayStatus: "too_large",
      rowCount: dataRows.length,
    };
  }

  const overlaySchema = overlay.overlay_schema;
  const editable = overlay.editable;
  const complete = overlay.complete;
  const editableRows = Array.isArray(editable) ? editable.length : 0;
  const completeRows = Array.isArray(complete) ? complete.length : 0;
  const shapeOk =
    typeof overlaySchema === "number" &&
    Array.isArray(editable) &&
    editable.every((item) => Array.isArray(item)) &&
    Array.isArray(complete) &&
    complete.every((item) => typeof item === "boolean") &&
    editableRows === dataRows.length &&
    completeRows === dataRows.length;

  if (!shapeOk) {
    return {
      completeRows,
      editableRows,
      overlayBytes,
      overlaySchema: typeof overlaySchema === "number" ? overlaySchema : null,
      overlayStatus: "invalid_shape",
      rowCount: dataRows.length,
    };
  }

  if (overlaySchema !== 1) {
    return {
      completeRows,
      editableRows,
      overlayBytes,
      overlaySchema,
      overlayStatus: "schema_unsupported",
      rowCount: dataRows.length,
    };
  }

  return {
    completeRows,
    editableRows,
    overlayBytes,
    overlaySchema,
    overlayStatus: "ok",
    rowCount: dataRows.length,
  };
}

async function expectOk(label, promise) {
  const result = await promise;

  if (result.error) {
    throw new Error(`${label}:${result.error.code ?? "db_error"}`);
  }

  return result.data ?? [];
}

async function loadShop(admin, shopId) {
  const { data, error } = await admin
    .from("shops")
    .select("shop_id,shop_code,shop_name,shop_status")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) {
    throw new Error(`shop_read_failed:${error.code ?? "db_error"}`);
  }

  if (!data) {
    throw new Error("shop_not_found");
  }

  return data;
}

async function loadMapping(admin, shopId) {
  const rows = await expectOk(
    "shop_inventory_sources_read_failed",
    admin
      .from("shop_inventory_sources")
      .select(
        "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,disabled_at",
      )
      .eq("shop_id", shopId)
      .is("disabled_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
  );
  const mapped = rows.find((row) => row.mapping_state === "mapped");
  const blocking = rows.find((row) => row.mapping_state !== "mapped");

  return {
    blocking: blocking ?? null,
    mapped: mapped ?? null,
    rows,
  };
}

function mapCatalogRow(row, kind, sourceScope) {
  return {
    deletedAt: row.deleted_at ?? null,
    id: redactId(row.id),
    rawId: row.id,
    kind,
    label: cleanText(row.product_name ?? row.name ?? row.item_number ?? row.id),
    ownerUserId: redactId(row.owner_user_id),
    shopId: redactId(row.shop_id),
    sourceScope,
    state: row.deleted_at ? "tombstone" : "active",
    updatedAt: row.updated_at ?? null,
  };
}

function dedupeByRawId(rows) {
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    if (seen.has(row.rawId)) {
      continue;
    }

    seen.add(row.rawId);
    result.push(row);
  }

  return result;
}

async function loadCatalogRows({
  admin,
  kind,
  legacyOwnerUserId,
  prefix,
  select,
  table,
  textColumns,
  shopId,
}) {
  const directResult = await admin
    .from(table)
    .select(select)
    .eq("shop_id", shopId)
    .or(prefixOrFilter(textColumns, prefix))
    .limit(maxRows);
  const directRows =
    directResult.error && isLegacySchemaError(directResult.error)
      ? []
      : directResult.error
        ? (() => {
            throw new Error(`${table}_shop_read_failed:${directResult.error.code}`);
          })()
        : directResult.data ?? [];
  const matchedDirectRows = directRows
    .filter((row) =>
      textColumns.some((column) => prefixMatch(row[column], prefix)),
    )
    .map((row) => mapCatalogRow(row, kind, "shop_scoped"));

  if (!legacyOwnerUserId) {
    return dedupeByRawId(matchedDirectRows);
  }

  const legacySelect = select
    .split(",")
    .map((column) => column.trim())
    .filter((column) => column !== "shop_id")
    .join(",");
  const legacyQuery = admin
    .from(table)
    .select(legacySelect)
    .eq("owner_user_id", legacyOwnerUserId)
    .or(prefixOrFilter(textColumns, prefix))
    .limit(maxRows);
  const legacyResult =
    directResult.error && isLegacySchemaError(directResult.error)
      ? await legacyQuery
      : await legacyQuery.is("shop_id", null);

  if (legacyResult.error) {
    throw new Error(`${table}_legacy_read_failed:${legacyResult.error.code}`);
  }

  const matchedLegacyRows = (legacyResult.data ?? [])
    .filter((row) =>
      textColumns.some((column) => prefixMatch(row[column], prefix)),
    )
    .map((row) =>
      mapCatalogRow(
        {
          ...row,
          shop_id: row.shop_id ?? null,
        },
        kind,
        "legacy_owner_bridge",
      ),
    );

  return dedupeByRawId([...matchedDirectRows, ...matchedLegacyRows]);
}

function mapHistoryRow(row, sourceScope) {
  const overlay = analyzeOverlay(row);

  return {
    category: cleanText(row.category),
    deletedAt: row.deleted_at ?? null,
    displayName: cleanText(row.display_name),
    ownerUserId: redactId(row.owner_user_id),
    payloadVersion: row.payload_version,
    rawRemoteId: row.remote_id,
    remoteId: redactId(row.remote_id),
    shopId: redactId(row.shop_id),
    sourceScope,
    state: row.deleted_at ? "tombstone" : "active",
    supplier: cleanText(row.supplier),
    updatedAt: row.updated_at ?? null,
    ...overlay,
  };
}

async function loadHistoryRows({ admin, legacyOwnerUserId, prefix, shopId }) {
  const select =
    "remote_id,shop_id,owner_user_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,data,session_overlay,is_manual_entry";
  const directResult = await admin
    .from("shared_sheet_sessions")
    .select(select)
    .eq("shop_id", shopId)
    .or(prefixOrFilter(["display_name", "supplier", "category"], prefix))
    .limit(maxRows);
  const directRows =
    directResult.error && isLegacySchemaError(directResult.error)
      ? []
      : directResult.error
        ? (() => {
            throw new Error(
              `shared_sheet_sessions_shop_read_failed:${directResult.error.code}`,
            );
          })()
        : directResult.data ?? [];
  const matchedDirectRows = directRows
    .filter((row) =>
      [row.display_name, row.supplier, row.category].some((value) =>
        prefixMatch(value, prefix),
      ),
    )
    .map((row) => mapHistoryRow(row, "shop_scoped"));

  if (!legacyOwnerUserId) {
    return dedupeByRawId(matchedDirectRows);
  }

  const legacySelect = select
    .split(",")
    .map((column) => column.trim())
    .filter((column) => column !== "shop_id")
    .join(",");
  const legacyQuery = admin
    .from("shared_sheet_sessions")
    .select(legacySelect)
    .eq("owner_user_id", legacyOwnerUserId)
    .or(prefixOrFilter(["display_name", "supplier", "category"], prefix))
    .limit(maxRows);
  const legacyResult =
    directResult.error && isLegacySchemaError(directResult.error)
      ? await legacyQuery
      : await legacyQuery.is("shop_id", null);

  if (legacyResult.error) {
    throw new Error(
      `shared_sheet_sessions_legacy_read_failed:${legacyResult.error.code}`,
    );
  }

  const matchedLegacyRows = (legacyResult.data ?? [])
    .filter((row) =>
      [row.display_name, row.supplier, row.category].some((value) =>
        prefixMatch(value, prefix),
      ),
    )
    .map((row) =>
      mapHistoryRow(
        {
          ...row,
          shop_id: row.shop_id ?? null,
        },
        "legacy_owner_bridge",
      ),
    );

  return dedupeByRawId([...matchedDirectRows, ...matchedLegacyRows]);
}

function collectJsonStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonStrings(item, output);
    }
    return output;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectJsonStrings(item, output);
    }
  }

  return output;
}

function syncEventReferences(event, ids, prefix) {
  const eventStrings = [
    event.client_event_id,
    event.source,
    event.source_device_id,
    ...collectJsonStrings(event.entity_ids),
    ...collectJsonStrings(event.metadata),
  ].filter(Boolean);

  if (eventStrings.some((value) => prefixMatch(value, prefix))) {
    return true;
  }

  return eventStrings.some((value) => ids.has(String(value)));
}

function eventOrigin(row) {
  if (row.source === "admin_web" || String(row.client_event_id ?? "").startsWith("admin_web:")) {
    return "admin_web";
  }

  if (row.source_device_id || /android|ios|mobile/i.test(String(row.source ?? ""))) {
    return "mobile_like";
  }

  return "unknown";
}

function mapSyncEvent(row, sourceScope) {
  return {
    changedCount: row.changed_count,
    clientEventId: cleanText(row.client_event_id, 80),
    createdAt: row.created_at,
    domain: row.domain,
    entityIds: stringifyRedactedJson(row.entity_ids, 360),
    eventId: row.id,
    eventType: row.event_type,
    metadata: stringifyRedactedJson(row.metadata, 360),
    origin: eventOrigin(row),
    source: cleanText(row.source),
    sourceDeviceId: redactId(row.source_device_id),
    sourceScope,
  };
}

async function loadSyncEvents({ admin, ids, legacyOwnerUserId, prefix, shopId }) {
  const select =
    "id,shop_id,batch_id,client_event_id,domain,event_type,source,source_device_id,changed_count,entity_ids,metadata,created_at";
  const directResult = await admin
    .from("sync_events")
    .select(select)
    .eq("shop_id", shopId)
    .in("domain", ["catalog", "history", "prices"])
    .order("created_at", { ascending: false })
    .limit(1000);
  const directRows =
    directResult.error && isLegacySchemaError(directResult.error)
      ? []
      : directResult.error
        ? (() => {
            throw new Error(`sync_events_shop_read_failed:${directResult.error.code}`);
          })()
        : directResult.data ?? [];
  let rows = directRows.map((row) => ({
    ...row,
    sourceScope: "shop_scoped",
  }));

  if (legacyOwnerUserId) {
    const legacySelect = select
      .split(",")
      .map((column) => column.trim())
      .filter((column) => column !== "shop_id")
      .join(",");
    const legacyQuery = admin
      .from("sync_events")
      .select(legacySelect)
      .eq("owner_user_id", legacyOwnerUserId)
      .in("domain", ["catalog", "history", "prices"])
      .order("created_at", { ascending: false })
      .limit(1000);
    const legacyResult =
      directResult.error && isLegacySchemaError(directResult.error)
        ? await legacyQuery
        : await legacyQuery.is("shop_id", null);

    if (legacyResult.error) {
      throw new Error(`sync_events_legacy_read_failed:${legacyResult.error.code}`);
    }

    rows = [
      ...rows,
      ...(legacyResult.data ?? []).map((row) => ({
        ...row,
        shop_id: row.shop_id ?? null,
        sourceScope: "legacy_owner_bridge",
      })),
    ];
  }

  const seen = new Set();

  return rows
    .filter((row) => {
      const key = String(row.id);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return syncEventReferences(row, ids, prefix);
    })
    .map((row) => mapSyncEvent(row, row.sourceScope));
}

function summarizeOrigins(events) {
  return events.reduce(
    (summary, event) => ({
      ...summary,
      [event.origin]: (summary[event.origin] ?? 0) + 1,
    }),
    { admin_web: 0, mobile_like: 0, unknown: 0 },
  );
}

function summarizeStates(rows, stateKey = "state") {
  return rows.reduce(
    (summary, row) => ({
      ...summary,
      [row[stateKey]]: (summary[row[stateKey]] ?? 0) + 1,
    }),
    { active: 0, tombstone: 0 },
  );
}

function buildIds({ categories, history, products, suppliers }) {
  return new Set(
    [
      ...products.map((row) => row.rawId),
      ...categories.map((row) => row.rawId),
      ...suppliers.map((row) => row.rawId),
      ...history.map((row) => row.rawRemoteId),
    ].filter(Boolean),
  );
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage.trim());
    return;
  }

  const command = args._[0] ?? "verify";

  if (!allowedCommands.has(command)) {
    fail("BLOCKED_COMMAND_REQUIRED", "Use verify, status, or cleanup-counts.");
  }

  const shopId = String(args["shop-id"] ?? "").trim();

  if (!shopId) {
    fail("BLOCKED_SHOP_ID_REQUIRED", "--shop-id is required.");
  }

  const prefix = sanitizePrefix(args.prefix ?? defaultPrefix);
  const env = loadRuntimeEnv({
    envFile: String(args["env-file"] ?? defaultEnvFile),
    target: args.target ? String(args.target) : undefined,
  });
  const admin = createAdminClient(env);
  const [shop, mapping] = await Promise.all([
    loadShop(admin, shopId),
    loadMapping(admin, shopId),
  ]);
  const legacyOwnerUserId = mapping.mapped?.owner_user_id ?? null;
  const [products, categories, suppliers, history] = await Promise.all([
    loadCatalogRows({
      admin,
      kind: "product",
      legacyOwnerUserId,
      prefix,
      select:
        "id,shop_id,owner_user_id,barcode,item_number,product_name,second_product_name,supplier_id,category_id,deleted_at,updated_at",
      shopId,
      table: "inventory_products",
      textColumns: ["barcode", "item_number", "product_name", "second_product_name"],
    }),
    loadCatalogRows({
      admin,
      kind: "category",
      legacyOwnerUserId,
      prefix,
      select: "id,shop_id,owner_user_id,name,deleted_at,updated_at",
      shopId,
      table: "inventory_categories",
      textColumns: ["name"],
    }),
    loadCatalogRows({
      admin,
      kind: "supplier",
      legacyOwnerUserId,
      prefix,
      select: "id,shop_id,owner_user_id,name,deleted_at,updated_at",
      shopId,
      table: "inventory_suppliers",
      textColumns: ["name"],
    }),
    loadHistoryRows({
      admin,
      legacyOwnerUserId,
      prefix,
      shopId,
    }),
  ]);
  const ids = buildIds({ categories, history, products, suppliers });
  const syncEvents = await loadSyncEvents({
    admin,
    ids,
    legacyOwnerUserId,
    prefix,
    shopId,
  });
  const overlaySummary = history.reduce((summary, row) => {
    summary[row.overlayStatus] = (summary[row.overlayStatus] ?? 0) + 1;
    return summary;
  }, {});
  const cleanupCounts = {
    categories: categories.length,
    historySessions: history.length,
    products: products.length,
    suppliers: suppliers.length,
    syncEvents: syncEvents.length,
  };
  const totalData =
    cleanupCounts.categories +
    cleanupCounts.historySessions +
    cleanupCounts.products +
    cleanupCounts.suppliers +
    cleanupCounts.syncEvents;
  const payload = {
    verdict:
      args["require-data"] && totalData === 0
        ? "BLOCKED_NO_TASK072C_DATA"
        : "DONE_READONLY_HARNESS",
    command,
    prefix,
    target: {
      class: env.TEST_TARGET,
      projectRef: redactRef(env.SUPABASE_PROJECT_REF || projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL)),
    },
    shop: {
      id: redactId(shop.shop_id),
      code: shop.shop_code ? "present" : null,
      name: shop.shop_name ? "present" : null,
      status: cleanText(shop.shop_status),
    },
    mapping: {
      mapped: Boolean(mapping.mapped),
      blocking: Boolean(mapping.blocking),
      ownerUserId: redactId(legacyOwnerUserId),
      sourceKind: cleanText(mapping.mapped?.source_kind),
    },
    cleanupCounts,
    products: {
      counts: summarizeStates(products),
      rows: products.map((row) => omitField(row, "rawId")),
    },
    categories: {
      counts: summarizeStates(categories),
      rows: categories.map((row) => omitField(row, "rawId")),
    },
    suppliers: {
      counts: summarizeStates(suppliers),
      rows: suppliers.map((row) => omitField(row, "rawId")),
    },
    history: {
      counts: summarizeStates(history),
      overlaySummary,
      rows: history.map((row) => omitField(row, "rawRemoteId")),
    },
    syncEvents: {
      countsByOrigin: summarizeOrigins(syncEvents),
      rows: syncEvents,
    },
    limits: {
      createAdminOrigin:
        "not_implemented; use authenticated Admin Web UI/server actions so permission context and audit stay intact",
      maxRowsPerQuery: maxRows,
      mutations: "none",
      serviceRoleBoundary: "node_cli_only",
    },
  };

  if (!args.json) {
    info(
      `${command} complete for ${prefix}; rows/events=${totalData}; mutations=none`,
    );
  }

  console.log(JSON.stringify(payload, null, 2));

  if (payload.verdict === "BLOCKED_NO_TASK072C_DATA") {
    process.exitCode = 1;
  }
}

try {
  await run();
} catch (error) {
  fail("BLOCKED_TASK072C_ADMIN_HARNESS", error.message, 1);
}
