import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";

const scriptPath = process.env.CLEANUP_SOURCE_UNDER_TEST ||
  "scripts/admin/task-137-product-image-cleanup.mjs";
const source = readFileSync(scriptPath, "utf8");
const shopId = "10000000-0000-4000-8000-000000000139";
const productId = "20000000-0000-4000-8000-000000000139";
const versionId = "30000000-0000-4000-8000-000000000139";
const objectPath = (variant, id = versionId) =>
  `shops/${shopId}/products/${productId}/primary/${id}/${variant}.jpg`;

async function runFixture(mode, execute = true) {
  const calls = [];
  const removals = [];
  const logs = [];
  const ranges = [];
  const row = {
    id: versionId, shop_id: shopId, product_id: productId,
    status: "failed", created_at: "2000-01-01T00:00:00Z",
    cleanup_updated_at: "2000-01-01T00:00:00Z", cleanup_status: "pending",
    main_path: objectPath("main"), thumb_path: objectPath("thumb"),
    expected_main_bytes: 6, expected_thumb_bytes: 4,
  };
  let rows = mode === "empty" ? [] : [row];
  if (mode === "paged") {
    rows = [...Array.from({ length: 500 }, () => ({
      ...row, created_at: "2099-01-01T00:00:00Z",
      cleanup_updated_at: "2099-01-01T00:00:00Z",
    })), row];
  }
  if (mode === "lost_after_one") {
    const id = "30000000-0000-4000-8000-000000000140";
    rows = [row, { ...row, id, main_path: objectPath("main", id),
      thumb_path: objectPath("thumb", id) }];
  }
  let renewals = 0;
  const client = {
    from() {
      const query = { from: 0, to: Number.POSITIVE_INFINITY, fields: "" };
      query.select = (fields) => { query.fields = fields; return query; };
      for (const name of ["eq", "in", "order"]) query[name] = () => query;
      query.range = (from, to) => {
        query.from = from; query.to = to;
        ranges.push({ from, to, fields: query.fields });
        return query;
      };
      query.limit = (limit) => { query.to = limit - 1; return query; };
      query.then = (resolve) => resolve({
        data: mode === "read_error" ? null : rows.slice(query.from, query.to + 1),
        error: mode === "read_error" ? { message: "SYNTHETIC_INTERNAL_DETAIL" } : null,
      });
      return query;
    },
    storage: { from() { return {
      async list() { return { data: [], error: null }; },
      async remove(paths) { removals.push(...paths); return { error: null }; },
      async download() {
        return { data: null, error: mode === "ambiguous_404"
          ? { statusCode: "404", message: "SYNTHETIC_INTERNAL_DETAIL" }
          : { statusCode: "404", message: "Object not found" } };
      },
    }; } },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "product_image_begin_cleanup_run") {
        return { data: mode === "busy"
          ? { ok: false, code: "cleanup_run_already_active" }
          : { ok: true, run_id: mode === "malformed_begin" ? "bad-id"
            : "40000000-0000-4000-8000-000000000139" }, error: null };
      }
      if (name === "product_image_renew_cleanup_run") {
        renewals += 1;
        return { data: { ok: mode !== "lost" &&
          !(mode === "lost_after_one" && renewals >= 4) }, error: null };
      }
      if (name === "product_image_prepare_cleanup") {
        const target = rows.find((candidate) => candidate.id === args.p_version_id);
        return { data: mode === "malformed_prepare" ? { unexpected: true }
          : { ok: true, main_path: target.main_path,
            thumb_path: target.thumb_path, byte_count: 10 }, error: null };
      }
      return { data: { ok: true,
        cleanup_status: mode === "pending" ? "pending" : "complete" }, error: null };
    },
  };
  const processStub = {
    argv: ["node", "fixture.mjs", "--target=local", `--shop-id=${shopId}`,
      ...(execute ? ["--execute"] : [])],
    env: { TASK137_PRODUCT_IMAGE_CLEANUP_ALLOW: "yes" }, exitCode: 0,
    exit(code) { throw new Error(`FIXTURE_EXIT_${code}`); },
  };
  const compiled = source.replace(/^import[\s\S]*?;\n/gm, "")
    .replace(/^export /gm, "")
    .replaceAll("import.meta.url", '"fixture-url"')
    .replace("  main().catch(", "  globalThis.completion = main().catch(");
  const context = {
    createHash, createClient: () => client, execFileSync: () => "",
    parseSupabaseStatusEnv: () => ({ API_URL: "http://127.0.0.1:54321",
      PROJECT_REF: "local", SERVICE_ROLE_KEY: "synthetic-fixture-only" }),
    assertLocalTargetEnv() {}, assertStagingTargetEnv() {},
    pathToFileURL: () => ({ href: "fixture-url" }), process: processStub,
    console: { log: (line) => logs.push(line), error: (line) => logs.push(line) },
    URL, Buffer, Date,
  };
  runInNewContext(compiled, context);
  assert.ok(context.completion, "the actual CLI entry point must run");
  await context.completion;
  assert.ok(!logs.some((line) => line.includes("SYNTHETIC_INTERNAL_DETAIL")));
  return { calls, removals, ranges, logs, exitCode: processStub.exitCode,
    terminal: calls.find((call) => call.name === "product_image_finish_cleanup_run")?.args };
}

test("cleanup default dry-run retains zero ledger mutations and zero deletions", async () => {
  const result = await runFixture("success", false);
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 0);
  assert.equal(result.removals.length, 0);
});

test("cleanup execution records an empty successful run", async () => {
  const result = await runFixture("empty");
  assert.equal(result.exitCode, 0);
  assert.equal(result.terminal.p_status, "succeeded");
  assert.equal(result.terminal.p_candidate_count, 0);
  assert.equal(result.removals.length, 0);
});

for (const [mode, code] of [
  ["busy", "CLEANUP_RUN_ALREADY_ACTIVE"],
  ["malformed_begin", "CLEANUP_RUN_ACQUIRE_FAILED"],
]) test(`cleanup refuses ${mode} before scanning or deletion`, async () => {
  const result = await runFixture(mode);
  assert.equal(result.exitCode, 2);
  assert.equal(result.removals.length, 0);
  assert.equal(result.ranges.length, 0);
  assert.ok(result.logs.some((line) => line.includes(code)));
});

test("cleanup lost renewal stops before prepare and Storage deletion", async () => {
  const result = await runFixture("lost");
  assert.equal(result.exitCode, 2);
  assert.equal(result.removals.length, 0);
  assert.ok(!result.calls.some((call) => call.name === "product_image_prepare_cleanup"));
  assert.equal(result.terminal.p_status, "failed");
  assert.equal(result.terminal.p_error_code, "cleanup_run_lease_lost");
});

test("cleanup retains bounded paging and records verified terminal progress", async () => {
  const result = await runFixture("paged");
  assert.equal(result.exitCode, 0);
  assert.ok(result.ranges.some((range) => range.from === 500));
  assert.equal(result.removals.length, 2);
  assert.equal(result.terminal.p_candidate_count, 1);
  assert.equal(result.terminal.p_completed_object_count, 2);
  assert.equal(result.terminal.p_completed_bytes, 10);
});

test("cleanup retains completed counters when the next renewal loses ownership", async () => {
  const result = await runFixture("lost_after_one");
  assert.equal(result.exitCode, 2);
  assert.equal(result.removals.length, 2);
  assert.equal(result.terminal.p_status, "failed");
  assert.equal(result.terminal.p_completed_object_count, 2);
  assert.equal(result.terminal.p_completed_bytes, 10);
});

for (const mode of ["pending", "ambiguous_404", "malformed_prepare", "read_error"])
  test(`cleanup preserves current fail-closed behavior for ${mode}`, async () => {
    const result = await runFixture(mode);
    assert.equal(result.exitCode, 2);
    assert.equal(result.terminal.p_status, "failed");
    assert.equal(result.terminal.p_completed_object_count, 0);
    assert.ok(result.terminal.p_failed_count >= 1);
    if (mode === "malformed_prepare" || mode === "read_error") {
      assert.equal(result.removals.length, 0);
    }
  });
