import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { canonicalizeProductImageJpegBytes } from "../../src/lib/product-images/browser-client.ts";
import { inspectJpeg } from "../../src/server/shop-admin/product-images/jpeg-validator.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const fixture = JSON.parse(readFileSync(
  new URL("../fixtures/product-image-jpeg-canonicalization.json", import.meta.url),
  "utf8",
));

function declarations(path, names) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  return names.map((name) => {
    const node = ast.statements.find((node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(node, `actual production helper ${name}`);
    return node.getText(ast).replace(/^export /, "");
  }).join("\n");
}

function encoderFunctions(worker) {
  const path = worker
    ? "../../src/lib/product-images/product-image-worker.ts"
    : "../../src/lib/product-images/browser-client.ts";
  const names = worker
    ? ["fail", "nextJpegMarkerAfterScan", "canonicalizeJpegBytes", "encodeCanvas"]
    : ["imageError", "nextJpegMarkerAfterScan", "canonicalizeProductImageJpegBytes",
      "canonicalizeEncodedJpeg", "encodeCanvas"];
  const canonical = worker ? "canonicalizeJpegBytes" : "canonicalizeProductImageJpegBytes";
  const code = ts.transpileModule(
    `${declarations(path, names)}\nresult = { canonical: ${canonical}, encodeCanvas };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const scope = { Blob, Uint8Array, result: null };
  runInNewContext(code, scope);
  return scope.result;
}

const worker = encoderFunctions(true);
const mainThread = encoderFunctions(false);

function withMetadata(bytes, marker, postScan = false) {
  const metadata = [0xff, marker, 0x00, 0x07, 0x54, 0x45, 0x53, 0x54, 0x00];
  const offset = postScan ? bytes.length - 2 : 2;
  return Uint8Array.from([...bytes.slice(0, offset), ...metadata, ...bytes.slice(offset)]);
}

test("native Canvas and OffscreenCanvas JPEGs satisfy the unchanged server validator after canonicalization", async () => {
  for (const sample of fixture.nativeEncoderSamples) {
    const raw = Uint8Array.from(Buffer.from(sample.base64, "base64"));
    assert.equal(inspectJpeg(raw).code, "jpeg_metadata_forbidden");
    const expected = canonicalizeProductImageJpegBytes(raw);
    assert.deepEqual(inspectJpeg(expected), { ok: true, inspection: { width: 32, height: 24 } });
    assert.deepEqual([...worker.canonical(raw)], [...expected]);

    const encoded = new Blob([raw], { type: "image/jpeg" });
    const canvas = sample.encoder === "offscreen"
      ? { convertToBlob: async () => encoded }
      : { toBlob: (callback) => callback(encoded) };
    const pipeline = sample.encoder === "offscreen" ? worker : mainThread;
    const output = await pipeline.encodeCanvas(canvas, sample.quality);
    assert.deepEqual([...new Uint8Array(await output.arrayBuffer())], [...expected]);
    assert.equal(output.type, "image/jpeg");
    assert.ok(output.size < encoded.size);
  }
});

test("baseline and progressive entropy bytes survive metadata removal before and after scans", () => {
  for (const sample of fixture.validJpegs) {
    const original = Uint8Array.from(Buffer.from(sample.base64, "base64"));
    assert.equal(inspectJpeg(original).ok, true);
    for (const marker of [0xe1, 0xe2, 0xed, 0xee, 0xfe]) {
      for (const postScan of [false, true]) {
        const input = withMetadata(original, marker, postScan);
        assert.equal(inspectJpeg(input).ok, false);
        for (const canonicalize of [canonicalizeProductImageJpegBytes, worker.canonical]) {
          const result = canonicalize(input);
          assert.deepEqual([...result], [...original], `${sample.name}/${marker}/${postScan}`);
          assert.equal(inspectJpeg(result).ok, true);
        }
      }
    }
  }
});

test("malformed encoded segments fail closed in both encoder helpers", () => {
  for (const bytes of [
    [], [0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01, 0xff, 0xd9],
    [0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0xff, 0xd9],
    [0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0x00, 0xff, 0xd9, 0x00],
  ]) {
    for (const canonicalize of [canonicalizeProductImageJpegBytes, worker.canonical]) {
      assert.throws(() => canonicalize(Uint8Array.from(bytes)), /image_encode_failed/);
    }
  }
});
