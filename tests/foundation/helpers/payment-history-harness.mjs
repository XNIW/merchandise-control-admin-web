import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { deflateRawSync } from "node:zlib";
import ts from "typescript";
const require = createRequire(import.meta.url), unzipper = await import("unzipper-esm"), cache = new Map();
function load(path) { path = resolve(path); if (cache.has(path))
    return cache.get(path); const loaded = { exports: {} }; cache.set(path, loaded.exports); const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; runInNewContext(code, { module: loaded, exports: loaded.exports, Buffer, TextDecoder, AbortController, AbortSignal, Error, setTimeout,clearTimeout,setInterval,clearInterval, require(name) { if (name === "server-only")
        return {}; if (name === "unzipper-esm")
        return unzipper; if (name.startsWith("."))
        return load(resolve(dirname(path), name + ".ts")); return require(name); } }); return loaded.exports; }
const domain = "src/server/payment-history/", analyzer = load(domain + "getnet-analyzer.ts");
const fixture = "tests/fixtures/payment-history/getnet-v1/", options = { legacyAmountsAreClp: true, modernTimeInterpretation: "IsoUtc", temporalPolicyVersion: "synthetic-fixed-offset-v1", temporalEvidenceReference: "synthetic ISO UTC evidence" };
const inputs = ["synthetic-legacy.xlsx", "synthetic-modern.xlsx"].map(fileName => ({ fileName, bytes: readFileSync(fixture + fileName) }));
// Small in-memory ZIP mutation fixture; never rewrites the canonical workbooks.
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
} return (crc ^ 0xffffffff) >>> 0; }
function zip(parts) { const local = [], central = []; let offset = 0; for (const { name, bytes } of parts) {
    const path = Buffer.from(name), compressed = deflateRawSync(bytes), crc = crc32(bytes), header = Buffer.alloc(30), record = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(path.length, 26);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(bytes.length, 24);
    record.writeUInt16LE(path.length, 28);
    record.writeUInt32LE(offset, 42);
    local.push(header, path, compressed);
    central.push(record, path);
    offset += header.length + path.length + compressed.length;
} const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...local, directory, end]); }
async function parts(index = 0) { const dir = await unzipper.Open.buffer(inputs[index].bytes); return Promise.all(dir.files.map(async (file) => ({ name: file.path, bytes: await file.buffer() }))); }
function editXml(entries, path, edit) { const part = entries.find(part => part.name === path); assert.ok(part, path); const original = part.bytes.toString("utf8"), changed = edit(original); assert.notEqual(changed, original, "mutation must change the actual fixture"); part.bytes = Buffer.from(changed); return entries; }
const sheet = "xl/worksheets/sheet1.xml";
function cell(xml, reference, value, type = "inlineStr", extra = "") { return xml.replace(new RegExp(`<c\\b[^>]*r="${reference}"[^>]*>[\\s\\S]*?<\\/c>`), `<c r="${reference}" t="${type}">${extra}${type === "inlineStr" ? `<is><t>${value}</t></is>` : `<v>${value}</v>`}</c>`); }
export { load, analyzer, options, inputs, fixture, parts, zip, editXml, cell, sheet };
