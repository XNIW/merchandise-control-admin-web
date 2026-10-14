import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const cases = [
  ["task-076-shop-admin-cloud-performance.spec.ts", "TASK076_SAMPLE_COUNT", "configuredSampleCount"],
  ["task-077-shop-admin-real-cloud-performance.spec.ts", "TASK077_ROUTE_SAMPLE_COUNT", "routeSampleCount"],
  ["task-077a-platform-master-console-performance.spec.ts", "TASK077A_SAMPLE_COUNT", "configuredSampleCount"],
];

function functions(file, counter, env = {}) {
  const source = readFileSync(new URL(`../e2e/staging/${file}`, import.meta.url), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const declarations = [counter, "summarizeLatency", "summarizeMeasurements", "writeReport"];
  if (counter === "routeSampleCount") declarations.push("optionalEnv");
  const code = declarations.map((name) => {
    const node = ast.statements.find((node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(node, `${file}: actual ${name}`);
    return node.getText(ast);
  }).join("\n");
  const writes = [];
  const scope = {
    process: { env },
    requiredEnv: () => "https://fixture.invalid",
    baseUrl: () => "https://fixture.invalid",
    evidenceDir: "/synthetic",
    mkdirSync() {},
    writeFileSync: (path, body) => writes.push({ path, body }),
    join: (...parts) => parts.join("/"),
    console: { log() {} },
    result: null,
  };
  const js = ts.transpileModule(
    `${code}\nresult = { count: ${counter}, summarizeLatency, summarizeMeasurements, writeReport };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  runInNewContext(js, scope);
  return { ...scope.result, writes };
}

for (const [file, key, counter] of cases) {
  test(`${file}: sample count rejects fractional, trailing and out-of-range input`, () => {
    const env = {};
    const actual = functions(file, counter, env);
    assert.equal(actual.count(), 1);
    for (const n of [1, 3, 20]) {
      env[key] = String(n);
      assert.equal(actual.count(), n);
    }
    for (const invalid of ["0", "21", "NaN", "Infinity", "1.5", "3tail"]) {
      env[key] = invalid;
      assert.throws(() => actual.count(), /SAMPLE_COUNT/);
    }
  });

  test(`${file}: summaries are descriptive and retain failed raw measurements`, () => {
    const actual = functions(file, counter, { [key]: "3" });
    const json = (value) => JSON.parse(JSON.stringify(value));
    assert.deepEqual(json(actual.summarizeLatency([null, 30, 10, 20])),
      { count: 3, max: 30, p50: 20, p95: 30 });
    assert.deepEqual(json(actual.summarizeLatency([null, null])),
      { count: 0, max: null, p50: null, p95: null });
    const measurements = Object.freeze([
      Object.freeze({ path: "/a", finalMs: 10, ttfbMs: 5, visualReplacementMs: 3, finalStatus: "ready" }),
      Object.freeze({ path: "/a", finalMs: null, ttfbMs: null, visualReplacementMs: null, finalStatus: "timeout" }),
      Object.freeze({ path: "/b", finalMs: 30, ttfbMs: 8, visualReplacementMs: 4, finalStatus: "ready" }),
    ]);
    const summary = json(actual.summarizeMeasurements(measurements));
    assert.deepEqual(summary.overall.finalMs, { count: 2, max: 30, p50: 10, p95: 30 });
    assert.equal(summary.routes["/a"].finalMs.count, 1);
    actual.writeReport({ measurements, phase: "synthetic", cleanup: null,
      target: { source: "synthetic", productCount: 0, priceCount: 0 } });
    assert.equal(actual.writes.length, 2);
    const report = JSON.parse(actual.writes[0].body);
    assert.deepEqual(report.measurements, json(measurements));
    assert.equal(report.measurements[1].finalStatus, "timeout");
    assert.equal(report.sampling.requestedSamplesPerRoute, 3);
    assert.equal(report.sampling.serverQueryTrace, "not_inferred_by_browser_measurements");
    assert.equal(report.summaries.overall.finalMs.count, 2);
    assert.equal(actual.writes[0].body, actual.writes[1].body);
  });
}

test("TASK-077 fixture propagates the existing sample interface without a second TASK077 setting", () => {
  const source = readFileSync(new URL("../../scripts/testing/task-077-shop-cloud-performance.mjs", import.meta.url), "utf8");
  assert.match(source, /TASK076_SAMPLE_COUNT:\s*env\.TASK076_SAMPLE_COUNT \|\| env\.TASK077_ROUTE_SAMPLE_COUNT \|\| "1"/);
  assert.doesNotMatch(source, /TASK077_SAMPLE_COUNT/);
});
