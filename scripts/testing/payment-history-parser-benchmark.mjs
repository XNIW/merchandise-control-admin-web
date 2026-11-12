// Synthetic parser benchmark only. Does not access a database, originals or a POS profile.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { analyzer, options, parts, zip, editXml, sheet } from "../../tests/foundation/helpers/payment-history-harness.mjs";
const count = Number(process.argv.find(arg => arg.startsWith("--rows="))?.slice(7));
assert.ok([10000, 100000].includes(count), "Use --rows=10000 or --rows=100000");
const duplicate = process.argv.includes("--duplicates"), inputs = [];
for (let base = 0; base < count; base += 50000) {
    const size = Math.min(50000, count - base), entries = await parts();
    let body = "";
    for (let i = 0; i < size; i++) {
        const number = i + 2, id = duplicate ? "SYN-B-0001" : `SYN-B-${base + i + 1}`;
        const cells = ["01/02/2024 11:12:13", id, "3", "Abonado", "Synthetic benchmark merchant", "0", "3"];
        body += `<row r="${number}">` + cells.map((value, col) => `<c r="${String.fromCharCode(65 + col)}${number}" t="inlineStr"><is><t>${value}</t></is></c>`).join("") + "</row>";
    }
    editXml(entries, sheet, xml => xml.replace(/(<sheetData>\s*<row\b[\s\S]*?<\/row>)[\s\S]*?<\/sheetData>/, (_, header) => header + body + "</sheetData>"));
    inputs.push({ fileName: `synthetic-benchmark-${base}.xlsx`, bytes: zip(entries) });
}
global.gc?.();
const start = performance.now(), r = await analyzer.analyzeGetnetFiles(inputs, options), elapsed = performance.now() - start;
assert.equal(r.hasErrors, false, JSON.stringify(r.diagnostics));
assert.equal(r.summary.accepted, count);
assert.equal(r.summary.signedGrossClp, String(count * 3));
console.log(JSON.stringify({ schemaVersion: "payment-history-parser-benchmark-v1", syntheticOnly: true, scope: "parser_only_no_ledger_deduplication", status: "PASS", rows: count, files: inputs.length, duplicateIdentities: duplicate, elapsedMs: Math.round(elapsed), peakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024), compressedBytes: inputs.reduce((n, file) => n + file.bytes.length, 0) }));
