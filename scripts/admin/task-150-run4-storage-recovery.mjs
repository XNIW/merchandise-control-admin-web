import { createHmac, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_STAGING_SUPABASE_ORIGIN =
  "https://jpgoimipbothfgkokyvm.supabase.co";
const PRODUCT_IMAGE_BUCKET = "product-images";
const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,79}$/;
const CLEANUP_CAPABILITY = /^task150_cleanup_[A-Za-z0-9_-]{43}$/;
const CANONICAL_STORAGE_PATH =
  /^shops\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/products\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/primary\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(main|thumb)\.jpg$/;
const MAX_STORAGE_PATHS = 4;
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const MIN_AUTHORITATIVE_LEASE_REMAINING_MS = 9 * 60 * 1000;
const MAX_AUTHORITATIVE_LEASE_REMAINING_MS = 11 * 60 * 1000;

class RecoveryFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "RecoveryFailure";
  }
}

function requireText(value, predicate) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || !predicate(normalized))
    throw new RecoveryFailure("invalid_input");
  return normalized;
}

function exactStagingUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.origin === EXPECTED_STAGING_SUPABASE_ORIGIN &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function hmac(key, domain, value) {
  return createHmac("sha256", key)
    .update("task-150-win7pos-image-qa-v1\0", "utf8")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

async function boundedFetch(input, init = {}) {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal?.aborted) abortFromUpstream();
  else
    upstreamSignal?.addEventListener("abort", abortFromUpstream, {
      once: true,
    });
  const timeout = setTimeout(
    () => controller.abort(new RecoveryFailure("request_timeout")),
    REQUEST_TIMEOUT_MILLISECONDS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

async function boundedCall(factory) {
  let timeout;
  try {
    return await Promise.race([
      Promise.resolve().then(factory),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new RecoveryFailure("request_timeout")),
          REQUEST_TIMEOUT_MILLISECONDS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export function deriveRun4RecoveryBindings(input) {
  const hmacKey = requireText(
    input.hmacKey,
    (value) => Buffer.byteLength(value, "utf8") >= 32,
  );
  const runHmac = requireText(input.runHmac, (value) =>
    LOWER_HEX_64.test(value),
  );
  const manifestHmac = requireText(input.manifestHmac, (value) =>
    LOWER_HEX_64.test(value),
  );
  const cleanupCapability = requireText(input.cleanupCapability, (value) =>
    CLEANUP_CAPABILITY.test(value),
  );
  const cleanupRequestId = requireText(input.cleanupRequestId, (value) =>
    REQUEST_ID.test(value),
  );
  const owner = randomBytes(32).toString("base64url");
  return {
    cleanupCapabilityDigest: hmac(
      hmacKey,
      "capability:cleanup",
      cleanupCapability,
    ),
    cleanupRequestHash: hmac(
      hmacKey,
      "request:cleanup",
      [cleanupRequestId, runHmac, manifestHmac].join("\0"),
    ),
    manifestHmac,
    ownerDigest: hmac(hmacKey, "cleanup-owner", owner),
    runHmac,
  };
}

export function parseRun4StorageTargets(value) {
  if (!Array.isArray(value) || value.length > MAX_STORAGE_PATHS) return null;
  const seenPaths = new Set();
  const versionIds = new Set();
  const targets = [];
  let runScope = null;
  for (const candidate of value) {
    if (typeof candidate !== "string" || seenPaths.has(candidate)) return null;
    const match = CANONICAL_STORAGE_PATH.exec(candidate);
    if (!match) return null;
    const candidateScope = `${match[1]}\0${match[2]}`;
    if (runScope !== null && candidateScope !== runScope) return null;
    runScope = candidateScope;
    versionIds.add(match[3]);
    if (versionIds.size > 2) return null;
    seenPaths.add(candidate);
    targets.push({
      basename: `${match[4]}.jpg`,
      folder: candidate.slice(0, candidate.lastIndexOf("/")),
      path: candidate,
    });
  }
  return targets.sort((left, right) => left.path.localeCompare(right.path));
}

function createAdminClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: boundedFetch,
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/task150-run4-recovery",
      },
    },
  });
}

async function verifyTargetsAbsent(bucket, targets) {
  let absentCount = 0;
  for (const target of targets) {
    const listed = await boundedCall(() =>
      bucket.list(target.folder, {
        limit: 10,
        offset: 0,
        search: target.basename,
        sortBy: { column: "name", order: "asc" },
      }),
    );
    if (listed.error || !Array.isArray(listed.data)) {
      throw new RecoveryFailure("storage_verify_unavailable");
    }
    if (listed.data.some((entry) => entry?.name === target.basename)) {
      throw new RecoveryFailure("storage_cleanup_incomplete");
    }
    absentCount += 1;
  }
  return absentCount;
}

export async function recoverRun4Storage(input, dependencies = {}) {
  const supabaseUrl = requireText(input.supabaseUrl, exactStagingUrl);
  const serviceRoleKey = requireText(
    input.serviceRoleKey,
    (value) => Buffer.byteLength(value, "utf8") >= 32,
  );
  const bindings = deriveRun4RecoveryBindings(input);
  const admin =
    dependencies.admin ?? createAdminClient(supabaseUrl, serviceRoleKey);

  const acquired = await boundedCall(() =>
    admin.rpc("task_150_win7pos_image_qa_cleanup_acquire_v2", {
      p_cleanup_capability_digest: bindings.cleanupCapabilityDigest,
      p_cleanup_request_hash: bindings.cleanupRequestHash,
      p_manifest_hmac: bindings.manifestHmac,
      p_owner_digest: bindings.ownerDigest,
      p_run_hmac: bindings.runHmac,
    }),
  );
  if (
    acquired.error ||
    !acquired.data ||
    typeof acquired.data !== "object" ||
    acquired.data.ok !== true ||
    acquired.data.code !== "cleanup_acquired" ||
    !Number.isSafeInteger(acquired.data.generation) ||
    acquired.data.generation < 1
  ) {
    throw new RecoveryFailure("cleanup_acquire_failed");
  }
  const nowMilliseconds = (dependencies.now ?? Date.now)();
  const leaseExpiresAtMilliseconds =
    typeof acquired.data.leaseExpiresAt === "string"
      ? Date.parse(acquired.data.leaseExpiresAt)
      : Number.NaN;
  const leaseRemainingMilliseconds =
    leaseExpiresAtMilliseconds - nowMilliseconds;
  if (
    !Number.isFinite(leaseExpiresAtMilliseconds) ||
    leaseRemainingMilliseconds < MIN_AUTHORITATIVE_LEASE_REMAINING_MS ||
    leaseRemainingMilliseconds > MAX_AUTHORITATIVE_LEASE_REMAINING_MS
  ) {
    throw new RecoveryFailure("cleanup_lease_contract_invalid");
  }
  const targets = parseRun4StorageTargets(acquired.data.paths);
  if (!targets) throw new RecoveryFailure("cleanup_acquire_contract_invalid");

  const bucket = admin.storage.from(PRODUCT_IMAGE_BUCKET);
  let removeReportedCount = 0;
  let removeReportedError = false;
  if (targets.length > 0) {
    try {
      const removed = await boundedCall(() =>
        bucket.remove(targets.map((target) => target.path)),
      );
      removeReportedError = Boolean(removed.error);
      removeReportedCount = Array.isArray(removed.data)
        ? removed.data.length
        : 0;
    } catch {
      removeReportedError = true;
    }
  }
  const absentCount = await verifyTargetsAbsent(bucket, targets);
  if (absentCount !== targets.length) {
    throw new RecoveryFailure("storage_cleanup_incomplete");
  }

  // Deliberately do not call cleanup_commit_v1. The already-deployed Worker
  // must recover this owner after the ten-minute lease, reacquire with the
  // same request hash, observe paths=[] and create the terminal receipt.
  return {
    absentCount,
    acquired: true,
    commitCalled: false,
    leaseWindowVerified: true,
    leaseRecoveryRequired: true,
    ok: true,
    removeReportedCount,
    removeReportedError,
    targetCount: targets.length,
  };
}

async function main() {
  try {
    const result = await recoverRun4Storage({
      cleanupCapability: process.env.TASK150_RUN4_CLEANUP_CAPABILITY,
      cleanupRequestId: process.env.TASK150_RUN4_CLEANUP_REQUEST_ID,
      hmacKey: process.env.TASK150_QA_HMAC_KEY,
      manifestHmac: process.env.TASK150_RUN4_MANIFEST_HMAC,
      runHmac: process.env.TASK150_RUN4_RUN_HMAC,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
    console.log(JSON.stringify(result));
  } catch {
    console.error(
      JSON.stringify({
        commitCalled: false,
        ok: false,
        recoveryFailed: true,
      }),
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) await main();
