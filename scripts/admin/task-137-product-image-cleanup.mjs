#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  assertLocalTargetEnv,
  assertStagingTargetEnv,
  parseSupabaseStatusEnv,
} from "../testing/target-guardrails.mjs";

const argv = process.argv.slice(2);
const args = new Set(argv);
const execute = args.has("--execute");
const target = argv
  .find((argument) => argument.startsWith("--target="))
  ?.slice("--target=".length) ?? "";
const shopId = argv
  .find((argument) => argument.startsWith("--shop-id="))
  ?.slice("--shop-id=".length) ?? "";
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
const scanLimit = 500;
const batchLimit = 100;
const databasePageSize = 1_000;
const storagePageSize = 100;
const maximumLifecycleRows = 50_000;
const maximumStorageObjects = 50_000;
const maximumStoragePrefixes = 100_000;
const uuidSegment =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const uuidPattern = new RegExp(`^${uuidSegment}$`, "i");
const canonicalObjectPathPattern = new RegExp(
  `^shops/(${uuidSegment})/products/(${uuidSegment})/primary/(${uuidSegment})/(main|thumb)\\.jpg$`,
  "i",
);

function fail(code, message) {
  console.error(`[task137-image-cleanup] FAIL ${code}: ${message}`);
  process.exit(2);
}

function info(message) {
  console.log(`[task137-image-cleanup] ${message}`);
}

function hashId(value) {
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
    assertStagingTargetEnv(env, { requireConfirmation: execute });
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

function eligible(row) {
  const transition =
    row.status === "pending"
      ? row.expires_at
      : row.status === "superseded"
        ? row.superseded_at
        : row.status === "removed"
          ? row.removed_at
          : row.cleanup_updated_at ?? row.created_at;
  return Boolean(transition && Date.parse(transition) <= cutoff.getTime());
}

export function isCanonicalProductImageObjectPath(value, expectedShopId) {
  if (typeof value !== "string") return false;
  const match = value.match(canonicalObjectPathPattern);
  return Boolean(
    match &&
      (!expectedShopId || match[1]?.toLowerCase() === expectedShopId.toLowerCase()),
  );
}

export function isEligibleProductImageOrphan(
  object,
  lifecyclePaths,
  cutoffTime,
  expectedShopId,
) {
  const createdAt = Date.parse(object?.createdAt ?? "");
  return (
    isCanonicalProductImageObjectPath(object?.path, expectedShopId) &&
    !lifecyclePaths.has(object.path) &&
    Number.isFinite(createdAt) &&
    createdAt <= cutoffTime
  );
}

function parseOrphanPath(path) {
  const match = path.match(canonicalObjectPathPattern);
  return match
    ? { productId: match[2], versionId: match[3], variant: match[4] }
    : null;
}

async function readLifecyclePaths(client) {
  const paths = new Set();
  for (let offset = 0; ; offset += databasePageSize) {
    const result = await client
      .from("inventory_product_image_versions")
      .select("main_path,thumb_path")
      .eq("shop_id", shopId)
      .range(offset, offset + databasePageSize - 1);
    if (result.error) {
      fail("LIFECYCLE_PATH_READ_FAILED", "Lifecycle paths could not be read.");
    }
    const page = result.data ?? [];
    for (const row of page) {
      paths.add(row.main_path);
      paths.add(row.thumb_path);
    }
    if (page.length < databasePageSize) return paths;
    if (offset + page.length >= maximumLifecycleRows) {
      fail(
        "LIFECYCLE_PATH_LIMIT_EXCEEDED",
        "Lifecycle path scan exceeded its bound.",
      );
    }
  }
}

async function readStorageObjects(bucket) {
  const objects = [];
  const rootPrefix = `shops/${shopId}`;
  const prefixes = [rootPrefix];
  const queued = new Set(prefixes);

  for (let prefixIndex = 0; prefixIndex < prefixes.length; prefixIndex += 1) {
    if (prefixes.length > maximumStoragePrefixes) {
      fail(
        "STORAGE_PREFIX_LIMIT_EXCEEDED",
        "Storage prefix scan exceeded its bound.",
      );
    }
    const prefix = prefixes[prefixIndex];
    for (let offset = 0; ; offset += storagePageSize) {
      const result = await bucket.list(prefix, {
        limit: storagePageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (result.error) {
        fail("STORAGE_SCAN_FAILED", "Private bucket inventory could not be read.");
      }
      const page = result.data ?? [];
      for (const item of page) {
        const objectPath = `${prefix}/${item.name}`;
        if (item.metadata && typeof item.metadata === "object") {
          objects.push({
            bytes: Number.isFinite(Number(item.metadata.size))
              ? Math.max(0, Number(item.metadata.size))
              : 0,
            createdAt: item.created_at,
            path: objectPath,
          });
          if (objects.length > maximumStorageObjects) {
            fail(
              "STORAGE_OBJECT_LIMIT_EXCEEDED",
              "Storage object scan exceeded its bound.",
            );
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

async function removeOne(bucket, path) {
  const result = await bucket.remove([path]);
  return !result.error;
}

async function main() {
  if (!uuidPattern.test(shopId)) {
    fail("SHOP_ID_REQUIRED", "Pass one canonical --shop-id=<uuid> scope.");
  }
  const env = resolveEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    fail("SERVER_KEY_REQUIRED", "A server-only key is required in process memory.");
  }
  if (execute && process.env.TASK137_PRODUCT_IMAGE_CLEANUP_ALLOW !== "yes") {
    fail(
      "EXECUTE_CONFIRMATION_REQUIRED",
      "Set TASK137_PRODUCT_IMAGE_CLEANUP_ALLOW=yes with --execute.",
    );
  }

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          "X-Client-Info": "merchandise-control-admin-web/task137-image-cleanup",
        },
      },
    },
  );
  const bucket = supabase.storage.from("product-images");
  const [candidatesResult, lifecyclePaths, storageObjects] = await Promise.all([
    supabase
      .from("inventory_product_image_versions")
      .select(
        "id,shop_id,product_id,status,created_at,expires_at,superseded_at,removed_at,main_path,thumb_path,verified_main_bytes,verified_thumb_bytes,expected_main_bytes,expected_thumb_bytes,cleanup_status,cleanup_updated_at",
      )
      .eq("shop_id", shopId)
      .in("status", ["pending", "failed", "superseded", "removed"])
      .in("cleanup_status", ["not_due", "pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(scanLimit),
    readLifecyclePaths(supabase),
    readStorageObjects(bucket),
  ]);

  if (candidatesResult.error) {
    fail("CANDIDATE_READ_FAILED", "Lifecycle candidates could not be read.");
  }

  const candidates = (candidatesResult.data ?? [])
    .filter(eligible)
    .slice(0, batchLimit);
  const orphanCandidates = storageObjects
    .filter((object) =>
      isEligibleProductImageOrphan(
        object,
        lifecyclePaths,
        cutoff.getTime(),
        shopId,
      ),
    )
    .slice(0, batchLimit - candidates.length);
  const byStatus = Object.fromEntries(
    ["pending", "failed", "superseded", "removed"].map((status) => [
      status,
      candidates.filter((row) => row.status === status).length,
    ]),
  );
  const candidateBytes = candidates.reduce(
    (total, row) =>
      total +
      Number(row.verified_main_bytes ?? row.expected_main_bytes ?? 0) +
      Number(row.verified_thumb_bytes ?? row.expected_thumb_bytes ?? 0),
    0,
  );
  const orphanBytes = orphanCandidates.reduce(
    (total, object) => total + object.bytes,
    0,
  );

  info(`target=${target}`);
  info(`mode=${execute ? "execute" : "dry-run"}`);
  info(`shop_hash=${hashId(shopId)}`);
  info(`cutoff_utc=${cutoff.toISOString()}`);
  info(`candidate_count=${candidates.length}`);
  info(`candidate_bytes=${candidateBytes}`);
  info(`candidate_status=${JSON.stringify(byStatus)}`);
  info(`candidate_hashes=${candidates.map((row) => hashId(row.id)).join(",")}`);
  info(`orphan_candidate_count=${orphanCandidates.length}`);
  info(`orphan_candidate_bytes=${orphanBytes}`);
  info(
    `orphan_candidate_hashes=${orphanCandidates
      .map((object) => hashId(object.path))
      .join(",")}`,
  );

  if (!execute || (candidates.length === 0 && orphanCandidates.length === 0)) {
    info(execute ? "PASS no eligible residue" : "PASS dry-run; no objects changed");
    return;
  }

  let completed = 0;
  let completedBytes = 0;
  let failed = 0;
  let skippedAfterRecheck = 0;

  for (const row of candidates) {
    const preparedResult = await supabase.rpc("product_image_prepare_cleanup", {
      p_product_id: row.product_id,
      p_shop_id: shopId,
      p_version_id: row.id,
    });
    const prepared = preparedResult.data;
    if (preparedResult.error || prepared?.ok !== true) {
      skippedAfterRecheck += 1;
      continue;
    }
    if (
      prepared.main_path !== row.main_path ||
      prepared.thumb_path !== row.thumb_path ||
      !isCanonicalProductImageObjectPath(prepared.main_path, shopId) ||
      !isCanonicalProductImageObjectPath(prepared.thumb_path, shopId)
    ) {
      failed += 1;
      continue;
    }

    const [mainRemoved, thumbRemoved] = await Promise.all([
      removeOne(bucket, prepared.main_path),
      removeOne(bucket, prepared.thumb_path),
    ]);
    const success = mainRemoved && thumbRemoved;
    const recordResult = await supabase.rpc("product_image_record_cleanup", {
      p_actor_kind: "platform_admin",
      p_actor_profile_id: null,
      p_error_code: success ? undefined : "storage_delete_failed",
      p_product_id: row.product_id,
      p_shop_id: shopId,
      p_source: "admin_script",
      p_success: success,
      p_version_id: row.id,
    });

    if (success && !recordResult.error && recordResult.data?.ok === true) {
      completed += 2;
      completedBytes += Number(prepared.byte_count ?? 0);
    } else {
      failed += 1;
    }
  }

  for (const object of orphanCandidates) {
    const parsed = parseOrphanPath(object.path);
    if (!parsed) {
      failed += 1;
      continue;
    }
    const preparedResult = await supabase.rpc(
      "product_image_prepare_orphan_cleanup",
      { p_object_path: object.path, p_shop_id: shopId },
    );
    const prepared = preparedResult.data;
    if (
      preparedResult.error ||
      prepared?.ok !== true ||
      prepared.product_id !== parsed.productId ||
      prepared.version_id !== parsed.versionId ||
      prepared.variant !== parsed.variant
    ) {
      skippedAfterRecheck += 1;
      continue;
    }

    const success = await removeOne(bucket, object.path);
    const recordResult = await supabase.rpc(
      "product_image_record_orphan_cleanup",
      {
        p_byte_count: object.bytes,
        p_error_code: success ? undefined : "storage_delete_failed",
        p_product_id: parsed.productId,
        p_shop_id: shopId,
        p_success: success,
        p_variant: parsed.variant,
        p_version_id: parsed.versionId,
      },
    );
    if (success && !recordResult.error && recordResult.data?.ok === true) {
      completed += 1;
      completedBytes += object.bytes;
    } else {
      failed += 1;
    }
  }

  info(`completed_object_count=${completed}`);
  info(`completed_bytes=${completedBytes}`);
  info(`skipped_after_recheck=${skippedAfterRecheck}`);
  info(`failed=${failed}`);
  if (failed > 0) {
    fail("PARTIAL_CLEANUP_FAILURE", "One or more scoped candidates remain retryable.");
  }
  info("PASS cleanup batch completed");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    fail("UNEXPECTED_FAILURE", "Cleanup stopped without exposing internal details.");
  });
}
