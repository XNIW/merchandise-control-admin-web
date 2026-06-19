#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertLocalTargetEnv,
  assertNoProductionProjectRef,
  assertStagingTargetEnv,
} from "../testing/target-guardrails.mjs";

const root = process.cwd();
const defaultEnvFile = ".env.local";
const defaultPrefix = "TASK072D_";
const allowedCommands = new Set([
  "cleanup-tombstone",
  "idempotency",
  "negative-rls",
  "run",
  "seed",
  "status",
  "verify",
]);
const mutatingCommands = new Set([
  "cleanup-tombstone",
  "idempotency",
  "run",
  "seed",
]);
const historyOverlayMaxBytes = 512 * 1024;
const maxRows = 250;
const usage = `
Usage:
  TEST_TARGET=local ALLOW_TASK072D_MUTATIONS=yes CONFIRM_TASK072D_MUTATIONS=yes \\
    node scripts/platform/task-072d-admin-runtime-harness.mjs run --shop-id=<uuid>

  TEST_TARGET=staging ALLOW_STAGING_E2E=yes CONFIRM_STAGING_E2E=yes \\
    ALLOWED_STAGING_SUPABASE_PROJECT_REFS=<ref> \\
    ALLOW_TASK072D_MUTATIONS=yes CONFIRM_TASK072D_MUTATIONS=yes \\
    node scripts/platform/task-072d-admin-runtime-harness.mjs idempotency --shop-id=<uuid> --prefix=TASK072D_<run>_

Commands:
  verify              Read TASK072D_* catalog/history/sync rows, redacted.
  status              Alias of verify.
  seed                Insert synthetic TASK072D_* catalog + History v2 rows and sync_events.
  cleanup-tombstone   Tombstone active synthetic TASK072D_* rows; never hard-delete.
  idempotency         Insert the same sync_event twice and verify one client_event_id row.
  negative-rls        Verify anon reads are blocked/empty and no same-prefix cross-shop rows exist.
  run                 seed -> verify -> idempotency -> negative-rls -> cleanup-tombstone -> verify.

Options:
  --shop-id=<uuid>      Required verified Admin Web shop_id.
  --prefix=<text>       Synthetic prefix. Defaults to TASK072D_.
  --env-file=<path>     Runtime env file. Defaults to .env.local.
  --require-data        Exit non-zero when verify sees no prefixed rows/events.
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
  console.error(`[task-072d-admin] FAIL ${code}: ${message}`);
  process.exit(status);
}

function info(message) {
  console.log(`[task-072d-admin] ${message}`);
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

function loadRuntimeEnv({ command, envFile, target }) {
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

  if (
    (command === "negative-rls" || command === "run") &&
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
    !env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  ) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (missing.length > 0) {
    fail(
      "BLOCKED_SERVER_ENV_REQUIRED",
      `Missing runtime env names: ${Array.from(new Set(missing)).join(", ")}.`,
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

function assertMutationConsent({ command, env }) {
  if (!mutatingCommands.has(command)) {
    return;
  }

  if (
    env.ALLOW_TASK072D_MUTATIONS !== "yes" ||
    env.CONFIRM_TASK072D_MUTATIONS !== "yes"
  ) {
    fail(
      "BLOCKED_TASK072D_MUTATION_CONFIRMATION_REQUIRED",
      "Set ALLOW_TASK072D_MUTATIONS=yes and CONFIRM_TASK072D_MUTATIONS=yes for TASK-072D synthetic writes.",
    );
  }
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
            "merchandise-control-admin-web/task-072d-admin-runtime-harness",
        },
      },
    },
  );
}

function createAnonClient(env) {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          "X-Client-Info":
            "merchandise-control-admin-web/task-072d-admin-runtime-harness-anon-negative-rls",
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

function isDuplicateSyncEventError(error) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    error.code === "23505"
  );
}

function sanitizePrefix(value) {
  const normalized = String(value ?? defaultPrefix)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  if (!/^TASK[0-9A-Z_-]{3,96}$/i.test(normalized)) {
    fail(
      "BLOCKED_SYNTHETIC_PREFIX_REQUIRED",
      "Use a synthetic TASK-prefixed marker such as TASK072D_.",
    );
  }

  return normalized;
}

function nowIso() {
  return new Date().toISOString();
}

function prefixOrFilter(textColumns, prefix) {
  return textColumns.map((column) => `${column}.ilike.*${prefix}*`).join(",");
}

function prefixMatch(value, prefix) {
  return String(value ?? "").toLowerCase().includes(prefix.toLowerCase());
}

function buildAdminWebClientEventId(seed) {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 48);

  return `admin_web:${digest}`;
}

function numericBarcodeFromId(id) {
  const digits = BigInt(`0x${id.replace(/-/g, "").slice(0, 14)}`)
    .toString()
    .replace(/\D/g, "");

  return digits.padEnd(13, "0").slice(0, 13);
}

function syntheticLabel(prefix, label) {
  return `${prefix}${label}`.slice(0, 110);
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
    .select("shop_id,shop_code,shop_name,shop_status,created_by_profile_id")
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

async function resolveOwner({ admin, mapping, shop }) {
  if (mapping.mapped?.owner_user_id) {
    return {
      catalogScope: "legacy_owner_bridge",
      ownerUserId: mapping.mapped.owner_user_id,
    };
  }

  if (shop.created_by_profile_id) {
    return {
      catalogScope: "shop_scoped",
      ownerUserId: shop.created_by_profile_id,
    };
  }

  const rows = await expectOk(
    "shop_member_owner_read_failed",
    admin
      .from("shop_members")
      .select("profile_id,role_key")
      .eq("shop_id", shop.shop_id)
      .eq("membership_status", "active")
      .in("role_key", ["shop_owner", "shop_manager"])
      .order("role_key", { ascending: false })
      .limit(1),
  );

  if (!rows[0]?.profile_id) {
    throw new Error("owner_user_id_not_resolved");
  }

  return {
    catalogScope: "shop_scoped",
    ownerUserId: rows[0].profile_id,
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

function withoutKey(row, key) {
  const copy = { ...row };

  delete copy[key];

  return copy;
}

async function buildReadModel({ admin, mapping, prefix, shop, owner }) {
  const legacyOwnerUserId = mapping.mapped?.owner_user_id ?? owner.ownerUserId ?? null;
  const [products, categories, suppliers, history] = await Promise.all([
    loadCatalogRows({
      admin,
      kind: "product",
      legacyOwnerUserId,
      prefix,
      select:
        "id,shop_id,owner_user_id,barcode,item_number,product_name,second_product_name,supplier_id,category_id,deleted_at,updated_at",
      shopId: shop.shop_id,
      table: "inventory_products",
      textColumns: ["barcode", "item_number", "product_name", "second_product_name"],
    }),
    loadCatalogRows({
      admin,
      kind: "category",
      legacyOwnerUserId,
      prefix,
      select: "id,shop_id,owner_user_id,name,deleted_at,updated_at",
      shopId: shop.shop_id,
      table: "inventory_categories",
      textColumns: ["name"],
    }),
    loadCatalogRows({
      admin,
      kind: "supplier",
      legacyOwnerUserId,
      prefix,
      select: "id,shop_id,owner_user_id,name,deleted_at,updated_at",
      shopId: shop.shop_id,
      table: "inventory_suppliers",
      textColumns: ["name"],
    }),
    loadHistoryRows({
      admin,
      legacyOwnerUserId,
      prefix,
      shopId: shop.shop_id,
    }),
  ]);
  const ids = buildIds({ categories, history, products, suppliers });
  const syncEvents = await loadSyncEvents({
    admin,
    ids,
    legacyOwnerUserId,
    prefix,
    shopId: shop.shop_id,
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

  return {
    cleanupCounts,
    totalData:
      cleanupCounts.categories +
      cleanupCounts.historySessions +
      cleanupCounts.products +
      cleanupCounts.suppliers +
      cleanupCounts.syncEvents,
    products: {
      counts: summarizeStates(products),
      rows: products.map((row) => withoutKey(row, "rawId")),
    },
    categories: {
      counts: summarizeStates(categories),
      rows: categories.map((row) => withoutKey(row, "rawId")),
    },
    suppliers: {
      counts: summarizeStates(suppliers),
      rows: suppliers.map((row) => withoutKey(row, "rawId")),
    },
    history: {
      counts: summarizeStates(history),
      overlaySummary,
      rows: history.map((row) => withoutKey(row, "rawRemoteId")),
    },
    syncEvents: {
      countsByOrigin: summarizeOrigins(syncEvents),
      rows: syncEvents,
    },
  };
}

async function insertRowWithLegacyFallback(admin, table, row, select) {
  const result = await admin
    .from(table)
    .insert(row)
    .select(select)
    .maybeSingle();

  if (!result.error || !isLegacySchemaError(result.error) || !("shop_id" in row)) {
    return result;
  }

  const legacyRow = withoutKey(row, "shop_id");

  return admin.from(table).insert(legacyRow).select(select).maybeSingle();
}

async function writeSyntheticSyncEvent({
  admin,
  changedCount,
  clientEventSeed,
  domain,
  entityIds,
  eventType,
  metadata,
  ownerUserId,
  shopId,
}) {
  const clientEventId = buildAdminWebClientEventId(clientEventSeed);
  const row = {
    changed_count: changedCount,
    client_event_id: clientEventId,
    domain,
    entity_ids: entityIds,
    event_type: eventType,
    metadata: {
      harness: "TASK-072D",
      redaction: "ids_only",
      source: "admin_web_test_harness",
      status: "success",
      ...metadata,
    },
    owner_user_id: ownerUserId,
    shop_id: shopId,
    source: "admin_web",
    source_device_id: null,
  };
  const result = await admin
    .from("sync_events")
    .insert(row)
    .select("id,client_event_id,created_at")
    .maybeSingle();

  if (!result.error) {
    return {
      clientEventId,
      duplicate: false,
      eventId: result.data?.id ?? null,
      inserted: true,
      ok: true,
    };
  }

  if (isDuplicateSyncEventError(result.error)) {
    return {
      clientEventId,
      duplicate: true,
      eventId: null,
      inserted: false,
      ok: true,
    };
  }

  if (isLegacySchemaError(result.error)) {
    const legacyRow = withoutKey(row, "shop_id");
    const legacyResult = await admin
      .from("sync_events")
      .insert(legacyRow)
      .select("id,client_event_id,created_at")
      .maybeSingle();

    if (!legacyResult.error) {
      return {
        clientEventId,
        duplicate: false,
        eventId: legacyResult.data?.id ?? null,
        inserted: true,
        ok: true,
      };
    }

    if (isDuplicateSyncEventError(legacyResult.error)) {
      return {
        clientEventId,
        duplicate: true,
        eventId: null,
        inserted: false,
        ok: true,
      };
    }
  }

  return {
    clientEventId,
    code: result.error.code ?? "db_failure",
    duplicate: false,
    eventId: null,
    inserted: false,
    ok: false,
  };
}

async function seedSyntheticRows({ admin, owner, prefix, shop }) {
  const createdAt = nowIso();
  const supplierId = randomUUID().toLowerCase();
  const categoryId = randomUUID().toLowerCase();
  const productId = randomUUID().toLowerCase();
  const remoteId = randomUUID().toLowerCase();
  const supplierLabel = syntheticLabel(prefix, "SUPPLIER");
  const categoryLabel = syntheticLabel(prefix, "CATEGORY");
  const productLabel = syntheticLabel(prefix, "PRODUCT");
  const historyLabel = syntheticLabel(prefix, "HISTORY_CREATE");
  const rows = [
    ["Barcode", "Item", "Qty"],
    [numericBarcodeFromId(productId), productLabel, "1"],
  ];
  const overlay = {
    complete: rows.map((_, index) => index === 0),
    editable: rows.map(() => ["", ""]),
    overlay_schema: 1,
  };
  const supplier = await insertRowWithLegacyFallback(
    admin,
    "inventory_suppliers",
    {
      deleted_at: null,
      id: supplierId,
      name: supplierLabel,
      owner_user_id: owner.ownerUserId,
      shop_id: shop.shop_id,
      updated_at: createdAt,
    },
    "id,shop_id,owner_user_id,name,deleted_at,updated_at",
  );

  if (supplier.error) {
    throw new Error(`supplier_seed_failed:${supplier.error.code ?? "db_error"}`);
  }

  const category = await insertRowWithLegacyFallback(
    admin,
    "inventory_categories",
    {
      deleted_at: null,
      id: categoryId,
      name: categoryLabel,
      owner_user_id: owner.ownerUserId,
      shop_id: shop.shop_id,
      updated_at: createdAt,
    },
    "id,shop_id,owner_user_id,name,deleted_at,updated_at",
  );

  if (category.error) {
    throw new Error(`category_seed_failed:${category.error.code ?? "db_error"}`);
  }

  const product = await insertRowWithLegacyFallback(
    admin,
    "inventory_products",
    {
      barcode: numericBarcodeFromId(productId),
      category_id: categoryId,
      deleted_at: null,
      id: productId,
      item_number: syntheticLabel(prefix, "ITEM"),
      owner_user_id: owner.ownerUserId,
      product_name: productLabel,
      purchase_price: 1,
      retail_price: 2,
      second_product_name: syntheticLabel(prefix, "PRODUCT_ALT"),
      shop_id: shop.shop_id,
      stock_quantity: 1,
      supplier_id: supplierId,
      updated_at: createdAt,
    },
    "id,shop_id,owner_user_id,barcode,item_number,product_name,second_product_name,supplier_id,category_id,deleted_at,updated_at",
  );

  if (product.error) {
    throw new Error(`product_seed_failed:${product.error.code ?? "db_error"}`);
  }

  const history = await insertRowWithLegacyFallback(
    admin,
    "shared_sheet_sessions",
    {
      category: categoryLabel,
      data: rows,
      deleted_at: null,
      display_name: historyLabel,
      is_manual_entry: true,
      owner_user_id: owner.ownerUserId,
      payload_version: 2,
      remote_id: remoteId,
      session_overlay: overlay,
      shop_id: shop.shop_id,
      supplier: supplierLabel,
      timestamp: createdAt,
      updated_at: createdAt,
    },
    "remote_id,shop_id,owner_user_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,data,session_overlay,is_manual_entry",
  );

  if (history.error) {
    throw new Error(`history_seed_failed:${history.error.code ?? "db_error"}`);
  }

  const catalogEvent = await writeSyntheticSyncEvent({
    admin,
    changedCount: 3,
    clientEventSeed: [
      "TASK-072D",
      "seed",
      "catalog",
      prefix,
      productId,
      createdAt,
    ].join(":"),
    domain: "catalog",
    entityIds: {
      category_ids: [categoryId],
      product_ids: [productId],
      supplier_ids: [supplierId],
    },
    eventType: "catalog_changed",
    metadata: {
      catalog_scope: owner.catalogScope,
      operation: "seed",
      payload_version: 1,
    },
    ownerUserId: owner.ownerUserId,
    shopId: shop.shop_id,
  });
  const historyEvent = await writeSyntheticSyncEvent({
    admin,
    changedCount: 1,
    clientEventSeed: [
      "TASK-072D",
      "seed",
      "history",
      prefix,
      remoteId,
      createdAt,
    ].join(":"),
    domain: "history",
    entityIds: {
      session_ids: [remoteId],
    },
    eventType: "history_changed",
    metadata: {
      catalog_scope: owner.catalogScope,
      operation: "seed",
      overlay_schema: 1,
      payload_version: 2,
      row_count: rows.length,
    },
    ownerUserId: owner.ownerUserId,
    shopId: shop.shop_id,
  });

  if (!catalogEvent.ok || !historyEvent.ok) {
    throw new Error("sync_event_seed_failed");
  }

  return {
    events: {
      catalog: {
        clientEventId: catalogEvent.clientEventId,
        duplicate: catalogEvent.duplicate,
        eventId: catalogEvent.eventId,
        inserted: catalogEvent.inserted,
      },
      history: {
        clientEventId: historyEvent.clientEventId,
        duplicate: historyEvent.duplicate,
        eventId: historyEvent.eventId,
        inserted: historyEvent.inserted,
      },
    },
    rows: {
      categoryId: redactId(categoryId),
      historyRemoteId: redactId(remoteId),
      productId: redactId(productId),
      supplierId: redactId(supplierId),
    },
  };
}

async function tombstoneCatalogTable({
  admin,
  legacyOwnerUserId,
  prefix,
  select,
  shopId,
  table,
  textColumns,
  timestamp,
}) {
  const row = {
    deleted_at: timestamp,
    updated_at: timestamp,
  };
  const directResult = await admin
    .from(table)
    .update(row)
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .or(prefixOrFilter(textColumns, prefix))
    .select(select);
  const directRows =
    directResult.error && isLegacySchemaError(directResult.error)
      ? []
      : directResult.error
        ? (() => {
            throw new Error(`${table}_tombstone_failed:${directResult.error.code}`);
          })()
        : directResult.data ?? [];

  if (!legacyOwnerUserId) {
    return directRows;
  }

  const legacySelect = select
    .split(",")
    .map((column) => column.trim())
    .filter((column) => column !== "shop_id")
    .join(",");
  const legacyQuery = admin
    .from(table)
    .update(row)
    .eq("owner_user_id", legacyOwnerUserId)
    .is("deleted_at", null)
    .or(prefixOrFilter(textColumns, prefix));
  const legacyResult =
    directResult.error && isLegacySchemaError(directResult.error)
      ? await legacyQuery.select(legacySelect)
      : await legacyQuery.is("shop_id", null).select(legacySelect);

  if (legacyResult.error) {
    throw new Error(`${table}_legacy_tombstone_failed:${legacyResult.error.code}`);
  }

  return [
    ...directRows,
    ...(legacyResult.data ?? []).map((legacyRow) => ({
      ...legacyRow,
      shop_id: legacyRow.shop_id ?? null,
    })),
  ];
}

async function tombstoneHistoryRows({
  admin,
  legacyOwnerUserId,
  prefix,
  shopId,
  timestamp,
}) {
  const row = {
    deleted_at: timestamp,
    updated_at: timestamp,
  };
  const select =
    "remote_id,shop_id,owner_user_id,display_name,supplier,category,deleted_at,updated_at";
  const directResult = await admin
    .from("shared_sheet_sessions")
    .update(row)
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .or(prefixOrFilter(["display_name", "supplier", "category"], prefix))
    .select(select);
  const directRows =
    directResult.error && isLegacySchemaError(directResult.error)
      ? []
      : directResult.error
        ? (() => {
            throw new Error(
              `shared_sheet_sessions_tombstone_failed:${directResult.error.code}`,
            );
          })()
        : directResult.data ?? [];

  if (!legacyOwnerUserId) {
    return directRows;
  }

  const legacySelect = select
    .split(",")
    .map((column) => column.trim())
    .filter((column) => column !== "shop_id")
    .join(",");
  const legacyQuery = admin
    .from("shared_sheet_sessions")
    .update(row)
    .eq("owner_user_id", legacyOwnerUserId)
    .is("deleted_at", null)
    .or(prefixOrFilter(["display_name", "supplier", "category"], prefix));
  const legacyResult =
    directResult.error && isLegacySchemaError(directResult.error)
      ? await legacyQuery.select(legacySelect)
      : await legacyQuery.is("shop_id", null).select(legacySelect);

  if (legacyResult.error) {
    throw new Error(
      `shared_sheet_sessions_legacy_tombstone_failed:${legacyResult.error.code}`,
    );
  }

  return [
    ...directRows,
    ...(legacyResult.data ?? []).map((legacyRow) => ({
      ...legacyRow,
      shop_id: legacyRow.shop_id ?? null,
    })),
  ];
}

async function cleanupSyntheticRows({ admin, owner, prefix, shop }) {
  const timestamp = nowIso();
  const legacyOwnerUserId = owner.ownerUserId;
  const [products, categories, suppliers, history] = await Promise.all([
    tombstoneCatalogTable({
      admin,
      legacyOwnerUserId,
      prefix,
      select: "id,shop_id,owner_user_id,product_name,deleted_at,updated_at",
      shopId: shop.shop_id,
      table: "inventory_products",
      textColumns: ["barcode", "item_number", "product_name", "second_product_name"],
      timestamp,
    }),
    tombstoneCatalogTable({
      admin,
      legacyOwnerUserId,
      prefix,
      select: "id,shop_id,owner_user_id,name,deleted_at,updated_at",
      shopId: shop.shop_id,
      table: "inventory_categories",
      textColumns: ["name"],
      timestamp,
    }),
    tombstoneCatalogTable({
      admin,
      legacyOwnerUserId,
      prefix,
      select: "id,shop_id,owner_user_id,name,deleted_at,updated_at",
      shopId: shop.shop_id,
      table: "inventory_suppliers",
      textColumns: ["name"],
      timestamp,
    }),
    tombstoneHistoryRows({
      admin,
      legacyOwnerUserId,
      prefix,
      shopId: shop.shop_id,
      timestamp,
    }),
  ]);
  const entityIds = {
    category_ids: categories.map((row) => row.id).filter(Boolean),
    product_ids: products.map((row) => row.id).filter(Boolean),
    supplier_ids: suppliers.map((row) => row.id).filter(Boolean),
  };
  const historyIds = history.map((row) => row.remote_id).filter(Boolean);
  const events = {};

  if (
    entityIds.category_ids.length +
      entityIds.product_ids.length +
      entityIds.supplier_ids.length >
    0
  ) {
    events.catalog = await writeSyntheticSyncEvent({
      admin,
      changedCount:
        entityIds.category_ids.length +
        entityIds.product_ids.length +
        entityIds.supplier_ids.length,
      clientEventSeed: [
        "TASK-072D",
        "cleanup",
        "catalog",
        prefix,
        timestamp,
        JSON.stringify(entityIds),
      ].join(":"),
      domain: "catalog",
      entityIds,
      eventType: "catalog_tombstone",
      metadata: {
        catalog_scope: owner.catalogScope,
        operation: "cleanup_tombstone",
        payload_version: 1,
      },
      ownerUserId: owner.ownerUserId,
      shopId: shop.shop_id,
    });
  }

  if (historyIds.length > 0) {
    events.history = await writeSyntheticSyncEvent({
      admin,
      changedCount: historyIds.length,
      clientEventSeed: [
        "TASK-072D",
        "cleanup",
        "history",
        prefix,
        timestamp,
        historyIds.join(","),
      ].join(":"),
      domain: "history",
      entityIds: {
        session_ids: historyIds,
      },
      eventType: "history_tombstone",
      metadata: {
        catalog_scope: owner.catalogScope,
        operation: "cleanup_tombstone",
        overlay_schema: 1,
        payload_version: 2,
      },
      ownerUserId: owner.ownerUserId,
      shopId: shop.shop_id,
    });
  }

  return {
    events: Object.fromEntries(
      Object.entries(events).map(([key, event]) => [
        key,
        {
          clientEventId: event.clientEventId,
          duplicate: event.duplicate,
          eventId: event.eventId,
          inserted: event.inserted,
        },
      ]),
    ),
    tombstoned: {
      categories: categories.length,
      historySessions: history.length,
      products: products.length,
      suppliers: suppliers.length,
    },
  };
}

async function countClientEventRows(admin, ownerUserId, clientEventId) {
  const { count, error } = await admin
    .from("sync_events")
    .select("*", { count: "exact", head: true })
    .eq("owner_user_id", ownerUserId)
    .eq("client_event_id", clientEventId);

  if (error) {
    throw new Error(`sync_events_idempotency_count_failed:${error.code}`);
  }

  return count ?? 0;
}

async function verifySyncEventIdempotency({ admin, owner, prefix, shop }) {
  const markerRemoteId = randomUUID().toLowerCase();
  const seed = ["TASK-072D", "idempotency", prefix, shop.shop_id].join(":");
  const commonInput = {
    admin,
    changedCount: 0,
    clientEventSeed: seed,
    domain: "history",
    entityIds: {
      session_ids: [markerRemoteId],
    },
    eventType: "history_changed",
    metadata: {
      catalog_scope: owner.catalogScope,
      operation: "idempotency_replay",
      overlay_schema: 1,
      payload_version: 2,
      prefix,
    },
    ownerUserId: owner.ownerUserId,
    shopId: shop.shop_id,
  };
  const first = await writeSyntheticSyncEvent(commonInput);
  const second = await writeSyntheticSyncEvent(commonInput);
  const count = await countClientEventRows(
    admin,
    owner.ownerUserId,
    first.clientEventId,
  );

  return {
    clientEventId: first.clientEventId,
    count,
    duplicateAccepted: second.duplicate || count === 1,
    first: {
      duplicate: first.duplicate,
      inserted: first.inserted,
      ok: first.ok,
    },
    ok: first.ok && second.ok && count === 1,
    second: {
      duplicate: second.duplicate,
      inserted: second.inserted,
      ok: second.ok,
    },
  };
}

async function anonVisibilityCheck({ anon, prefix, select, shopId, table, textColumns }) {
  const query = anon
    .from(table)
    .select(select)
    .eq("shop_id", shopId)
    .or(prefixOrFilter(textColumns, prefix))
    .limit(5);
  const result = await query;

  if (result.error) {
    return {
      code: result.error.code ?? "read_blocked",
      count: 0,
      status: "blocked",
      table,
    };
  }

  return {
    code: null,
    count: result.data?.length ?? 0,
    status: (result.data?.length ?? 0) === 0 ? "empty" : "visible",
    table,
  };
}

async function anonSyncEventsVisibilityCheck({ anon, shopId, table }) {
  const result = await anon
    .from(table)
    .select("id,domain,event_type")
    .eq("shop_id", shopId)
    .in("domain", ["catalog", "history", "prices"])
    .limit(5);

  if (result.error) {
    return {
      code: result.error.code ?? "read_blocked",
      count: 0,
      status: "blocked",
      table,
    };
  }

  return {
    code: null,
    count: result.data?.length ?? 0,
    status: (result.data?.length ?? 0) === 0 ? "empty" : "visible",
    table,
  };
}

async function crossShopMatches({
  admin,
  prefix,
  select,
  shopId,
  table,
  textColumns,
}) {
  const result = await admin
    .from(table)
    .select(select)
    .not("shop_id", "is", null)
    .neq("shop_id", shopId)
    .or(prefixOrFilter(textColumns, prefix))
    .limit(20);

  if (result.error && isLegacySchemaError(result.error)) {
    return [];
  }

  if (result.error) {
    throw new Error(`${table}_cross_shop_check_failed:${result.error.code}`);
  }

  return (result.data ?? []).filter((row) =>
    textColumns.some((column) => prefixMatch(row[column], prefix)),
  );
}

async function crossShopSyncEventMatches({ admin, prefix, shopId }) {
  const result = await admin
    .from("sync_events")
    .select(
      "id,shop_id,client_event_id,domain,event_type,source,source_device_id,entity_ids,metadata",
    )
    .not("shop_id", "is", null)
    .neq("shop_id", shopId)
    .in("domain", ["catalog", "history", "prices"])
    .limit(200);

  if (result.error && isLegacySchemaError(result.error)) {
    return [];
  }

  if (result.error) {
    throw new Error(`sync_events_cross_shop_check_failed:${result.error.code}`);
  }

  return (result.data ?? []).filter((row) =>
    syncEventReferences(row, new Set(), prefix),
  );
}

async function verifyNegativeRlsAndCrossShop({ admin, anon, prefix, shop }) {
  const anonChecks = await Promise.all([
    anonVisibilityCheck({
      anon,
      prefix,
      select: "id,shop_id,product_name",
      shopId: shop.shop_id,
      table: "inventory_products",
      textColumns: ["barcode", "item_number", "product_name", "second_product_name"],
    }),
    anonVisibilityCheck({
      anon,
      prefix,
      select: "id,shop_id,name",
      shopId: shop.shop_id,
      table: "inventory_categories",
      textColumns: ["name"],
    }),
    anonVisibilityCheck({
      anon,
      prefix,
      select: "id,shop_id,name",
      shopId: shop.shop_id,
      table: "inventory_suppliers",
      textColumns: ["name"],
    }),
    anonVisibilityCheck({
      anon,
      prefix,
      select: "remote_id,shop_id,display_name,supplier,category",
      shopId: shop.shop_id,
      table: "shared_sheet_sessions",
      textColumns: ["display_name", "supplier", "category"],
    }),
    anonSyncEventsVisibilityCheck({
      anon,
      shopId: shop.shop_id,
      table: "sync_events",
    }),
  ]);
  const crossShop = await Promise.all([
    crossShopMatches({
      admin,
      prefix,
      select: "id,shop_id,product_name",
      shopId: shop.shop_id,
      table: "inventory_products",
      textColumns: ["barcode", "item_number", "product_name", "second_product_name"],
    }),
    crossShopMatches({
      admin,
      prefix,
      select: "id,shop_id,name",
      shopId: shop.shop_id,
      table: "inventory_categories",
      textColumns: ["name"],
    }),
    crossShopMatches({
      admin,
      prefix,
      select: "id,shop_id,name",
      shopId: shop.shop_id,
      table: "inventory_suppliers",
      textColumns: ["name"],
    }),
    crossShopMatches({
      admin,
      prefix,
      select: "remote_id,shop_id,display_name,supplier,category",
      shopId: shop.shop_id,
      table: "shared_sheet_sessions",
      textColumns: ["display_name", "supplier", "category"],
    }),
    crossShopSyncEventMatches({ admin, prefix, shopId: shop.shop_id }),
  ]);
  const crossShopCounts = {
    categories: crossShop[1].length,
    historySessions: crossShop[3].length,
    products: crossShop[0].length,
    suppliers: crossShop[2].length,
    syncEvents: crossShop[4].length,
  };
  const anonVisible = anonChecks.filter((check) => check.status === "visible");
  const crossShopTotal = Object.values(crossShopCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  return {
    anonChecks,
    crossShopCounts,
    ok: anonVisible.length === 0 && crossShopTotal === 0,
    status:
      anonVisible.length === 0 && crossShopTotal === 0
        ? "blocked_or_empty"
        : "visible_or_cross_shop_rows",
  };
}

function buildBasePayload({ command, env, mapping, owner, prefix, shop }) {
  return {
    command,
    prefix,
    target: {
      class: env.TEST_TARGET,
      projectRef: redactRef(
        env.SUPABASE_PROJECT_REF || projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL),
      ),
    },
    shop: {
      id: redactId(shop.shop_id),
      code: shop.shop_code ? "present" : null,
      name: shop.shop_name ? "present" : null,
      status: cleanText(shop.shop_status),
    },
    mapping: {
      blocking: Boolean(mapping.blocking),
      mapped: Boolean(mapping.mapped),
      ownerUserId: redactId(owner.ownerUserId),
      sourceKind: cleanText(mapping.mapped?.source_kind),
    },
    limits: {
      allowedPrefix: "TASK072D_* synthetic rows only",
      hardDelete: "forbidden",
      mutations:
        mutatingCommands.has(command) ? "synthetic_insert_or_tombstone" : "none",
      negativeRls: "anon blocked or empty; service-role cross-shop check redacted",
      serviceRoleBoundary: "node_cli_only",
    },
  };
}

async function runCommand({ admin, anon, args, command, env, mapping, owner, prefix, shop }) {
  const payload = buildBasePayload({ command, env, mapping, owner, prefix, shop });

  if (command === "verify" || command === "status") {
    const readModel = await buildReadModel({ admin, mapping, owner, prefix, shop });

    return {
      ...payload,
      verdict:
        args["require-data"] && readModel.totalData === 0
          ? "BLOCKED_NO_TASK072D_DATA"
          : "DONE_READONLY_HARNESS",
      ...readModel,
    };
  }

  if (command === "seed") {
    const seed = await seedSyntheticRows({ admin, owner, prefix, shop });
    const readModel = await buildReadModel({ admin, mapping, owner, prefix, shop });

    return {
      ...payload,
      verdict: "DONE_SYNTHETIC_SEED",
      seed,
      ...readModel,
    };
  }

  if (command === "cleanup-tombstone") {
    const cleanup = await cleanupSyntheticRows({ admin, owner, prefix, shop });
    const readModel = await buildReadModel({ admin, mapping, owner, prefix, shop });

    return {
      ...payload,
      verdict: "DONE_SYNTHETIC_TOMBSTONE_CLEANUP",
      cleanup,
      ...readModel,
    };
  }

  if (command === "idempotency") {
    const idempotency = await verifySyncEventIdempotency({
      admin,
      owner,
      prefix,
      shop,
    });

    return {
      ...payload,
      verdict: idempotency.ok
        ? "DONE_SYNC_EVENTS_IDEMPOTENCY"
        : "BLOCKED_SYNC_EVENTS_IDEMPOTENCY",
      idempotency,
    };
  }

  if (command === "negative-rls") {
    const negative = await verifyNegativeRlsAndCrossShop({
      admin,
      anon,
      prefix,
      shop,
    });

    return {
      ...payload,
      verdict: negative.ok
        ? "DONE_NEGATIVE_RLS_NO_CROSS_SHOP"
        : "BLOCKED_NEGATIVE_RLS_OR_CROSS_SHOP",
      negative,
    };
  }

  const seed = await seedSyntheticRows({ admin, owner, prefix, shop });
  const beforeCleanup = await buildReadModel({ admin, mapping, owner, prefix, shop });
  const idempotency = await verifySyncEventIdempotency({
    admin,
    owner,
    prefix,
    shop,
  });
  const negative = await verifyNegativeRlsAndCrossShop({
    admin,
    anon,
    prefix,
    shop,
  });
  const cleanup = await cleanupSyntheticRows({ admin, owner, prefix, shop });
  const afterCleanup = await buildReadModel({ admin, mapping, owner, prefix, shop });
  const ok = idempotency.ok && negative.ok;

  return {
    ...payload,
    verdict: ok ? "DONE_TASK072D_SYNTHETIC_RUN" : "BLOCKED_TASK072D_SYNTHETIC_RUN",
    seed,
    beforeCleanup,
    idempotency,
    negative,
    cleanup,
    afterCleanup,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage.trim());
    return;
  }

  const command = args._[0] ?? "verify";

  if (!allowedCommands.has(command)) {
    fail(
      "BLOCKED_COMMAND_REQUIRED",
      "Use verify, status, seed, cleanup-tombstone, idempotency, negative-rls, or run.",
    );
  }

  const shopId = String(args["shop-id"] ?? "").trim();

  if (!shopId) {
    fail("BLOCKED_SHOP_ID_REQUIRED", "--shop-id is required.");
  }

  const prefix = sanitizePrefix(args.prefix ?? defaultPrefix);
  const env = loadRuntimeEnv({
    command,
    envFile: String(args["env-file"] ?? defaultEnvFile),
    target: args.target ? String(args.target) : undefined,
  });
  assertMutationConsent({ command, env });

  const admin = createAdminClient(env);
  const anon =
    command === "negative-rls" || command === "run" ? createAnonClient(env) : null;
  const [shop, mapping] = await Promise.all([
    loadShop(admin, shopId),
    loadMapping(admin, shopId),
  ]);
  const owner = await resolveOwner({ admin, mapping, shop });
  const payload = await runCommand({
    admin,
    anon,
    args,
    command,
    env,
    mapping,
    owner,
    prefix,
    shop,
  });

  if (!args.json) {
    info(`${command} complete for ${prefix}; verdict=${payload.verdict}`);
  }

  console.log(JSON.stringify(payload, null, 2));

  if (String(payload.verdict).startsWith("BLOCKED_")) {
    process.exitCode = 1;
  }
}

try {
  await run();
} catch (error) {
  fail("BLOCKED_TASK072D_ADMIN_HARNESS", error.message, 1);
}
