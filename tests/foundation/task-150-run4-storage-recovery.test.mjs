import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  deriveRun4RecoveryBindings,
  parseRun4StorageTargets,
  recoverRun4Storage,
} from "../../scripts/admin/task-150-run4-storage-recovery.mjs";

const root = process.cwd();
const scriptPath = "scripts/admin/task-150-run4-storage-recovery.mjs";
const workflowPath = ".github/workflows/task-150-run4-storage-recovery.yml";

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function canonicalPaths() {
  return [
    "shops/11111111-1111-4111-8111-111111111111/products/22222222-2222-4222-8222-222222222222/primary/33333333-3333-4333-8333-333333333333/main.jpg",
    "shops/11111111-1111-4111-8111-111111111111/products/22222222-2222-4222-8222-222222222222/primary/33333333-3333-4333-8333-333333333333/thumb.jpg",
    "shops/11111111-1111-4111-8111-111111111111/products/22222222-2222-4222-8222-222222222222/primary/44444444-4444-4444-8444-444444444444/main.jpg",
    "shops/11111111-1111-4111-8111-111111111111/products/22222222-2222-4222-8222-222222222222/primary/44444444-4444-4444-8444-444444444444/thumb.jpg",
  ];
}

function recoveryInput() {
  return {
    cleanupCapability: `task150_cleanup_${"A".repeat(43)}`,
    cleanupRequestId: "run4-cleanup-request-001",
    hmacKey: "foundation-task150-hmac-key-000000000000000000000000",
    manifestHmac: "b".repeat(64),
    runHmac: "a".repeat(64),
    serviceRoleKey: "foundation-service-role-key-000000000000000000000000",
    supabaseUrl: "https://jpgoimipbothfgkokyvm.supabase.co",
  };
}

function expectedHmac(key, domain, value) {
  return createHmac("sha256", key)
    .update("task-150-win7pos-image-qa-v1\0", "utf8")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

test("TASK-150 Run 4 recovery derives the exact cleanup digest and request hash", () => {
  const input = recoveryInput();
  const bindings = deriveRun4RecoveryBindings(input);
  assert.equal(
    bindings.cleanupCapabilityDigest,
    expectedHmac(input.hmacKey, "capability:cleanup", input.cleanupCapability),
  );
  assert.equal(
    bindings.cleanupRequestHash,
    expectedHmac(
      input.hmacKey,
      "request:cleanup",
      [input.cleanupRequestId, input.runHmac, input.manifestHmac].join("\0"),
    ),
  );
  assert.match(bindings.ownerDigest, /^[0-9a-f]{64}$/);
});

test("TASK-150 Run 4 recovery accepts at most four unique paths in one run scope", () => {
  const paths = canonicalPaths();
  const parsed = parseRun4StorageTargets(paths);
  assert.equal(parsed.length, 4);
  assert.deepEqual(
    parsed.map((target) => target.path),
    paths,
  );
  assert.equal(parseRun4StorageTargets([...paths, paths[0]]), null);
  assert.equal(parseRun4StorageTargets([paths[0], paths[0]]), null);
  assert.equal(parseRun4StorageTargets(["../foreign.jpg"]), null);
  assert.equal(
    parseRun4StorageTargets([
      paths[0],
      paths[1].replace(
        "11111111-1111-4111-8111-111111111111",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ),
    ]),
    null,
  );
});

test("TASK-150 Run 4 recovery acquires once, removes once, verifies absence and never commits", async () => {
  const paths = canonicalPaths();
  const calls = [];
  const nowMilliseconds = Date.parse("2026-08-02T02:30:00.000Z");
  const admin = {
    async rpc(name, args) {
      calls.push(name);
      assert.equal(name, "task_150_win7pos_image_qa_cleanup_acquire_v2");
      assert.deepEqual(Object.keys(args).sort(), [
        "p_cleanup_capability_digest",
        "p_cleanup_request_hash",
        "p_manifest_hmac",
        "p_owner_digest",
        "p_run_hmac",
      ]);
      return {
        data: {
          code: "cleanup_acquired",
          generation: 1,
          leaseExpiresAt: "2026-08-02T02:40:00.000000Z",
          ok: true,
          paths,
        },
        error: null,
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "product-images");
        return {
          async list(_folder, options) {
            calls.push("storage.list");
            assert.match(options.search, /^(main|thumb)\.jpg$/);
            return { data: [], error: null };
          },
          async remove(actualPaths) {
            calls.push("storage.remove");
            assert.deepEqual(actualPaths, paths);
            return { data: paths.map(() => ({})), error: null };
          },
        };
      },
    },
  };

  const result = await recoverRun4Storage(recoveryInput(), {
    admin,
    now: () => nowMilliseconds,
  });
  assert.deepEqual(result, {
    absentCount: 4,
    acquired: true,
    commitCalled: false,
    leaseWindowVerified: true,
    leaseRecoveryRequired: true,
    ok: true,
    removeReportedCount: 4,
    removeReportedError: false,
    targetCount: 4,
  });
  assert.deepEqual(calls, [
    "task_150_win7pos_image_qa_cleanup_acquire_v2",
    "storage.remove",
    "storage.list",
    "storage.list",
    "storage.list",
    "storage.list",
  ]);
  assert.equal(
    calls.some((call) => call.includes("commit")),
    false,
  );
});

test("TASK-150 Run 4 recovery tolerates a lost remove response only after proving absence", async () => {
  const paths = canonicalPaths().slice(0, 1);
  const admin = {
    async rpc() {
      return {
        data: {
          code: "cleanup_acquired",
          generation: 1,
          leaseExpiresAt: "2026-08-02T02:40:00.000000Z",
          ok: true,
          paths,
        },
        error: null,
      };
    },
    storage: {
      from() {
        return {
          async list() {
            return { data: [], error: null };
          },
          async remove() {
            throw new Error("simulated response loss");
          },
        };
      },
    },
  };

  const result = await recoverRun4Storage(recoveryInput(), {
    admin,
    now: () => Date.parse("2026-08-02T02:30:00.000Z"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.absentCount, 1);
  assert.equal(result.removeReportedCount, 0);
  assert.equal(result.removeReportedError, true);
  assert.equal(result.commitCalled, false);
});

test("TASK-150 Run 4 recovery fails closed when remove reports success but an object remains", async () => {
  const paths = canonicalPaths().slice(0, 1);
  const admin = {
    async rpc() {
      return {
        data: {
          code: "cleanup_acquired",
          generation: 1,
          leaseExpiresAt: "2026-08-02T02:40:00.000000Z",
          ok: true,
          paths,
        },
        error: null,
      };
    },
    storage: {
      from() {
        return {
          async list() {
            return { data: [{ name: "main.jpg" }], error: null };
          },
          async remove() {
            return { data: [{}], error: null };
          },
        };
      },
    },
  };

  await assert.rejects(
    recoverRun4Storage(recoveryInput(), {
      admin,
      now: () => Date.parse("2026-08-02T02:30:00.000Z"),
    }),
    /storage_cleanup_incomplete/,
  );
});

test("TASK-150 Run 4 recovery fails closed when Storage absence cannot be verified", async () => {
  const paths = canonicalPaths().slice(0, 1);
  const admin = {
    async rpc() {
      return {
        data: {
          code: "cleanup_acquired",
          generation: 1,
          leaseExpiresAt: "2026-08-02T02:40:00.000000Z",
          ok: true,
          paths,
        },
        error: null,
      };
    },
    storage: {
      from() {
        return {
          async list() {
            return { data: null, error: { code: "unavailable" } };
          },
          async remove() {
            return { data: [{}], error: null };
          },
        };
      },
    },
  };

  await assert.rejects(
    recoverRun4Storage(recoveryInput(), {
      admin,
      now: () => Date.parse("2026-08-02T02:30:00.000Z"),
    }),
    /storage_verify_unavailable/,
  );
});

test("TASK-150 Run 4 recovery refuses Storage I/O without a live authoritative lease", async () => {
  let storageUsed = false;
  const admin = {
    async rpc() {
      return {
        data: {
          code: "cleanup_acquired",
          generation: 1,
          leaseExpiresAt: "2026-08-02T02:30:01.000000Z",
          ok: true,
          paths: canonicalPaths(),
        },
        error: null,
      };
    },
    storage: {
      from() {
        storageUsed = true;
        return {};
      },
    },
  };

  await assert.rejects(
    recoverRun4Storage(recoveryInput(), {
      admin,
      now: () => Date.parse("2026-08-02T02:30:00.000Z"),
    }),
    /cleanup_lease_contract_invalid/,
  );
  assert.equal(storageUsed, false);
});

test("TASK-150 Run 4 recovery workflow is exact-main staging-only and has no deploy or commit", () => {
  const workflow = read(workflowPath);
  const script = read(scriptPath);
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
  assert.match(workflow, /environment: cloudflare-staging/);
  assert.match(workflow, /process\.env\.GITHUB_ACTOR === "XNIW"/);
  assert.match(workflow, /process\.env\.GITHUB_TRIGGERING_ACTOR === "XNIW"/);
  assert.match(workflow, /process\.env\.GITHUB_REF === "refs\/heads\/main"/);
  assert.match(workflow, /requestedSha === process\.env\.GITHUB_SHA/);
  assert.match(workflow, /RECOVER_TASK150_RUN4_STORAGE/);
  assert.match(
    workflow,
    /EXPECTED_STAGING_SUPABASE_PROJECT_REF: jpgoimipbothfgkokyvm/,
  );
  for (const secret of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "TASK150_QA_HMAC_KEY",
    "TASK150_RUN4_CLEANUP_CAPABILITY",
    "TASK150_RUN4_CLEANUP_REQUEST_ID",
    "TASK150_RUN4_MANIFEST_HMAC",
    "TASK150_RUN4_RUN_HMAC",
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }
  assert.doesNotMatch(
    workflow,
    /wrangler\s+deploy|deploy-production|cloudflare-production/,
  );
  assert.match(script, /task_150_win7pos_image_qa_cleanup_acquire_v2/);
  assert.match(script, /MIN_AUTHORITATIVE_LEASE_REMAINING_MS/);
  assert.match(script, /REQUEST_TIMEOUT_MILLISECONDS = 15_000/);
  assert.match(script, /fetch: boundedFetch/);
  assert.match(script, /\.from\(PRODUCT_IMAGE_BUCKET\)[\s\S]*?bucket\.remove/);
  assert.doesNotMatch(script, /\.rpc\([\s\S]{0,120}cleanup_commit_v1/);
  assert.match(script, /commitCalled: false/);
});
