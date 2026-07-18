#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  assertLocalTargetEnv,
  assertStagingTargetEnv,
  parseSupabaseStatusEnv,
} from "../testing/target-guardrails.mjs";

const targetArg = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--target="));
const target = targetArg?.slice("--target=".length) ?? "";
const shopIdArg = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--shop-id="));
const shopId = shopIdArg?.slice("--shop-id=".length) ?? "";
const databasePageSize = 1_000;
const storagePageSize = 100;
const maximumRows = 50_000;
const maximumStorageObjects = 50_000;
const maximumStoragePrefixes = 100_000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidSegment =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const canonicalObjectPathPattern = new RegExp(
  `^shops/(${uuidSegment})/products/(${uuidSegment})/primary/(${uuidSegment})/(main|thumb)\\.jpg$`,
  "i",
);

function fail(code, message) {
  console.error(`[task137-image-report] FAIL ${code}: ${message}`);
  process.exit(2);
}

function info(key, value) {
  console.log(`[task137-image-report] ${key}=${value}`);
}

function hashShopId(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function localEnv() {
  let output;
  try {
    output = execFileSync("supabase", ["status", "--output", "env"], {
      encoding: "utf8",
      env: {
        ...process.env,
        DO_NOT_TRACK: "1",
        SUPABASE_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    fail("LOCAL_SUPABASE_REQUIRED", "Start the local Supabase stack first.");
  }

  const values = parseSupabaseStatusEnv(output);
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL || "",
    SUPABASE_PROJECT_REF: values.PROJECT_REF || "local",
    SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY || "",
    TEST_TARGET: "local",
  };
  try {
    assertLocalTargetEnv(env);
  } catch (error) {
    fail(
      error.code ?? "LOCAL_TARGET_GUARD_FAILED",
      "The resolved Supabase endpoint is not the approved local target.",
    );
  }
  return env;
}

function stagingEnv() {
  const env = { ...process.env, TEST_TARGET: "staging" };
  try {
    assertStagingTargetEnv(env);
  } catch (error) {
    fail(
      error.code ?? "STAGING_TARGET_GUARD_FAILED",
      "The staging target did not satisfy the non-production guardrails.",
    );
  }
  return env;
}

function resolveEnv() {
  if (target === "local") return localEnv();
  if (target === "staging") return stagingEnv();
  fail(
    "EXPLICIT_TARGET_REQUIRED",
    "Pass --target=local or --target=staging. Production is unsupported.",
  );
}

async function readAllRows(client, table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += databasePageSize) {
    const result = await client
      .from(table)
      .select(columns)
      .eq("shop_id", shopId)
      .range(offset, offset + databasePageSize - 1);
    if (result.error) {
      fail("DATABASE_REPORT_READ_FAILED", `Unable to read ${table}.`);
    }
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < databasePageSize) return rows;
    if (rows.length >= maximumRows) {
      fail("DATABASE_REPORT_LIMIT_EXCEEDED", `${table} exceeds the bounded report limit.`);
    }
  }
}

async function readScopedProducts(client, productIds) {
  const rows = [];
  const uniqueIds = [...new Set(productIds)];
  for (let offset = 0; offset < uniqueIds.length; offset += databasePageSize) {
    const ids = uniqueIds.slice(offset, offset + databasePageSize);
    const result = await client
      .from("inventory_products")
      .select("id,shop_id,primary_image_version_id")
      .in("id", ids);
    if (result.error) {
      fail("DATABASE_REPORT_READ_FAILED", "Unable to read scoped products.");
    }
    rows.push(...(result.data ?? []));
  }
  return rows;
}

async function readStorageObjects(bucket) {
  const objects = [];
  const prefixes = [`shops/${shopId}`];
  const queued = new Set(prefixes);

  for (let prefixIndex = 0; prefixIndex < prefixes.length; prefixIndex += 1) {
    if (prefixes.length > maximumStoragePrefixes) {
      fail("STORAGE_PREFIX_LIMIT_EXCEEDED", "Storage prefix scan exceeded its bound.");
    }
    const prefix = prefixes[prefixIndex];
    for (let offset = 0; ; offset += storagePageSize) {
      const result = await bucket.list(prefix, {
        limit: storagePageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (result.error) {
        fail("STORAGE_REPORT_READ_FAILED", "Private bucket inventory could not be read.");
      }
      const page = result.data ?? [];
      for (const item of page) {
        const objectPath = `${prefix}/${item.name}`;
        if (item.metadata && typeof item.metadata === "object") {
          objects.push({
            path: objectPath,
            bytes: Number.isFinite(Number(item.metadata.size))
              ? Number(item.metadata.size)
              : 0,
          });
          if (objects.length > maximumStorageObjects) {
            fail("STORAGE_OBJECT_LIMIT_EXCEEDED", "Storage object scan exceeded its bound.");
          }
        } else if (!queued.has(objectPath)) {
          queued.add(objectPath);
          prefixes.push(objectPath);
        }
      }
      if (page.length < storagePageSize) break;
    }
  }

  return objects;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function main() {
  if (!uuidPattern.test(shopId)) {
    fail("SHOP_ID_REQUIRED", "Pass one canonical --shop-id=<uuid> scope.");
  }
  const env = resolveEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    fail("SERVER_KEY_REQUIRED", "A server-only key is required in process memory.");
  }

  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          "X-Client-Info": "merchandise-control-admin-web/task137-image-report",
        },
      },
    },
  );

  const [versions, storageObjects] = await Promise.all([
    readAllRows(
      client,
      "inventory_product_image_versions",
      "id,shop_id,product_id,status,main_path,thumb_path,verified_main_bytes,verified_thumb_bytes,verified_main_width,verified_main_height,verified_thumb_width,verified_thumb_height",
    ),
    readStorageObjects(client.storage.from("product-images")),
  ]);
  const products = await readScopedProducts(
    client,
    versions.map((version) => version.product_id),
  );

  const versionsById = new Map(versions.map((version) => [version.id, version]));
  const lifecyclePaths = new Set(
    versions.flatMap((version) => [version.main_path, version.thumb_path]),
  );
  const currentProducts = products.filter((product) => product.primary_image_version_id);
  const danglingCurrentReferences = currentProducts.filter(
    (product) => !versionsById.has(product.primary_image_version_id),
  );
  const currentVersions = currentProducts
    .map((product) => versionsById.get(product.primary_image_version_id))
    .filter(Boolean);
  const expectedCurrentPaths = new Set(
    currentVersions.flatMap((version) => [version.main_path, version.thumb_path]),
  );
  const storagePaths = new Set(storageObjects.map((object) => object.path));

  const lifecycleStatus = Object.fromEntries(
    ["pending", "ready", "superseded", "removed", "failed"].map((status) => [
      status,
      versions.filter((version) => version.status === status).length,
    ]),
  );
  const aboveBudgetVersions = versions.filter(
    (version) =>
      numeric(version.verified_main_bytes) > 1_048_576 ||
      numeric(version.verified_thumb_bytes) > 92_160 ||
      Math.max(
        numeric(version.verified_main_width),
        numeric(version.verified_main_height),
      ) > 1_600 ||
      Math.max(
        numeric(version.verified_thumb_width),
        numeric(version.verified_thumb_height),
      ) > 384,
  );

  const perShop = new Map();
  function shopEntry(shopId) {
    const current = perShop.get(shopId) ?? {
      currentImages: 0,
      verifiedBytes: 0,
      storageBytes: 0,
    };
    perShop.set(shopId, current);
    return current;
  }

  for (const product of currentProducts) {
    const entry = shopEntry(shopId);
    entry.currentImages += 1;
    const version = versionsById.get(product.primary_image_version_id);
    if (version) {
      entry.verifiedBytes +=
        numeric(version.verified_main_bytes) + numeric(version.verified_thumb_bytes);
    }
  }

  let malformedStorageObjects = 0;
  for (const object of storageObjects) {
    const match = object.path.match(canonicalObjectPathPattern);
    if (match?.[1]?.toLowerCase() === shopId.toLowerCase()) {
      shopEntry(shopId).storageBytes += object.bytes;
    } else {
      malformedStorageObjects += 1;
    }
  }

  const perShopReport = [...perShop.entries()]
    .map(([shopId, counts]) => ({ shopHash: hashShopId(shopId), ...counts }))
    .sort((left, right) => left.shopHash.localeCompare(right.shopHash));
  const currentVerifiedBytes = currentVersions.reduce(
    (total, version) =>
      total +
      numeric(version.verified_main_bytes) +
      numeric(version.verified_thumb_bytes),
    0,
  );

  info("target", target);
  info("mode", "read-only");
  info("shop_hash", hashShopId(shopId));
  info("current_image_count", currentProducts.length);
  info("ready_version_count", lifecycleStatus.ready);
  info("current_verified_bytes", currentVerifiedBytes);
  info("storage_object_count", storageObjects.length);
  info(
    "storage_total_bytes",
    storageObjects.reduce((total, object) => total + object.bytes, 0),
  );
  info(
    "unreferenced_object_count",
    storageObjects.filter((object) => !lifecyclePaths.has(object.path)).length,
  );
  info(
    "missing_current_object_count",
    [...expectedCurrentPaths].filter((objectPath) => !storagePaths.has(objectPath)).length,
  );
  info("dangling_current_reference_count", danglingCurrentReferences.length);
  info("malformed_object_count", malformedStorageObjects);
  info("above_budget_version_count", aboveBudgetVersions.length);
  info("lifecycle_status", JSON.stringify(lifecycleStatus));
  info("per_shop", JSON.stringify(perShopReport));
  info("execution_result", "PASS");

  const missingCurrentObjectCount = [...expectedCurrentPaths].filter(
    (objectPath) => !storagePaths.has(objectPath),
  ).length;
  const unreferencedObjectCount = storageObjects.filter(
    (object) => !lifecyclePaths.has(object.path),
  ).length;
  const healthResult =
    missingCurrentObjectCount > 0 ||
    danglingCurrentReferences.length > 0 ||
    malformedStorageObjects > 0 ||
    aboveBudgetVersions.length > 0
      ? "FAIL"
      : unreferencedObjectCount > 0
        ? "WARN"
        : "PASS";
  info("health_result", healthResult);
  if (healthResult === "FAIL") {
    fail(
      "IMAGE_HEALTH_CHECK_FAILED",
      "One or more scoped image integrity invariants failed.",
    );
  }
}

main().catch(() => {
  fail("UNEXPECTED_FAILURE", "Report stopped without exposing internal details.");
});
