import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { load, analyzer, options, inputs, fixture, parts, zip, editXml, cell, sheet } from "./helpers/payment-history-harness.mjs";
const values = load("src/server/payment-history/value-rules.ts"), times = load("src/server/payment-history/time-rules.ts");
test("canonical Windows corpus remains byte exact and reconciles independent literal totals", async () => {
    const manifest = JSON.parse(readFileSync(fixture + "windows-manifest.json", "utf8"));
    for (const row of manifest.files)
        assert.equal(createHash("sha256").update(readFileSync(fixture + row.name)).digest("hex"), row.sha256);
    const r = await analyzer.analyzeGetnetFiles(inputs, options);
    assert.equal(r.hasErrors, false, JSON.stringify(r.files.flatMap(file => file.diagnostics)));
    assert.equal(r.needsEvidence, false);
    assert.equal(r.canPrepare, true);
    assert.deepEqual(JSON.parse(JSON.stringify(r.summary)), { sourceRows: 6, accepted: 5, sales: 4, cancellations: 1, rejected: 1, signedGrossClp: "3380", knownNetClp: "3320", knownNetCount: 5, rejectedRequestedClp: "888", knownRejectedRequestedCount: 1, positiveGrossClp: "4280", cancellationGrossClp: "-900", fromBusinessDateTime: "2024-01-31T16:12:13.4567000", toBusinessDateTime: "2024-02-01T11:12:13.0000000", fromIsoCandidateDateTime: "2024-01-31T16:12:13.4567000", toIsoCandidateDateTime: "2024-02-01T11:12:13.0000000", fromExportedLocalCandidateDateTime: "2024-01-31T20:12:13.4567000", toExportedLocalCandidateDateTime: "2024-02-01T11:12:13.0000000" });
    const rows = r.files.flatMap(file => file.transactions);
    assert.deepEqual(Array.from(rows, row => [row.externalId, row.grossClp, row.netClp, row.cardSubtype]), [["SYN-L-001", "1200", "1180", "Credit"], ["SYN-L-002", "730", "720", "Debit"], ["SYN-M-001", "900", "882", "Debit"], ["SYN-M-002", "-900", "-882", "Debit"], ["SYN-M-003", "1450", "1420", "Debit"]]);
    assert.equal(rows[0].authorizationCode, "000AB7");
    assert.equal(rows[0].timestamp.businessDateTime, "2024-02-01T11:12:13.0000000");
    assert.equal(rows[0].timestamp.occurredAtUtc, null);
    assert.equal(rows[2].timestamp.businessDateTime, "2024-01-31T16:12:13.4567000");
    assert.equal(rows[2].timestamp.occurredAtUtc, "2024-01-31T20:12:13.4567000Z");
    assert.ok(rows.every(row => row.originalCashierId === null && row.paymentMethod === "card"));
});
test("missing currency/time evidence blocks preparation but preserves preview", async () => { const r = await analyzer.analyzeGetnetFiles(inputs, { ...options, legacyAmountsAreClp: false, modernTimeInterpretation: "Unresolved", temporalEvidenceReference: "" }); assert.equal(r.hasErrors, false); assert.equal(r.summary.accepted, 5); assert.equal(r.needsEvidence, true); assert.equal(r.canPrepare, false); assert.equal(r.files[1].transactions[0].timestamp.businessDateTime, null); });
for (const mode of ["IsoUtc", "ExportedLocal", "Unresolved"])
    test(`every normalized movement matches the independent qualified CLR oracle: ${mode}`, async () => {
        const oracle = JSON.parse(readFileSync(fixture + `clr-${mode}.json`, "utf8"));
        const r = await analyzer.analyzeGetnetFiles(inputs, { ...options, modernTimeInterpretation: mode, temporalEvidenceReference: mode === "Unresolved" ? "" : options.temporalEvidenceReference });
        const normalize = row => { const value = JSON.parse(JSON.stringify(row)); delete value.parserVersion; delete value.source.fileId; delete value.source.fileSha256; return value; };
        assert.deepEqual(JSON.parse(JSON.stringify(r.files.flatMap(file => Array.from(file.transactions, normalize)))), oracle.transactions);
        assert.deepEqual(JSON.parse(JSON.stringify(r.files.flatMap(file => Array.from(file.rejected, normalize)))), oracle.rejected);
        assert.equal(r.hasErrors, oracle.hasErrors);
        assert.equal(r.needsEvidence, oracle.needsEvidence);
        const summary = JSON.parse(JSON.stringify(r.summary));
        const renamed = { sourceRows: "sourceRows", accepted: "acceptedCount", sales: "saleCount", cancellations: "cancellationCount", rejected: "rejectedCount", signedGrossClp: "grossClp" };
        for (const [key, value] of Object.entries(summary))
            assert.deepEqual(value, oracle.summary[renamed[key] ?? key], `summary ${key}`);
    });
for (const [raw, expected] of [["00012", "12"], ["-900", "-900"], ["1200.00", "1200"], ["1.2e3", "1200"], ["9223372036854775807", "9223372036854775807"], ["-9223372036854775808", "-9223372036854775808"], ["0e9999", "0"]])
    test(`exact CLP lexical ${raw}`, () => assert.equal(values.parseClp(raw).toString(), expected));
for (const [raw, error] of [["1,000", "invalid"], ["1.000000000000001", "fractional"], ["2e-9999", "fractional"], ["9223372036854775808", "overflow"], ["-9223372036854775809", "overflow"]])
    test(`CLP rejects ${raw}`, () => assert.throws(() => values.parseClp(raw), new RegExp("getnet_amount_" + error)));
test("identifiers retain leading zeros and reject numeric precision loss", () => { assert.equal(values.parseIdentifier("000001"), "000001"); assert.equal(values.parseIdentifier("12", true, "000000"), "000012"); for (const [v, n, f] of [["1e3", true], ["1.0", false], ["1234567890123456", true], ["12", true, "0.00"]])
    assert.throws(() => values.parseIdentifier(v, n, f), /getnet_identifier_/); });
test("time interpretation preserves both candidates and seven fractional digits without host timezone", () => { const iso = times.parseModernTimestamp("2026-01-01T01:02:03.1234567Z", "-04:30", options); assert.equal(iso.businessDateTime, "2025-12-31T20:32:03.1234567"); const local = times.parseModernTimestamp("2026-01-01T01:02:03.1234567Z", "-04:30", { ...options, modernTimeInterpretation: "ExportedLocal" }); assert.equal(local.businessDateTime, "2026-01-01T01:02:03.1234567"); assert.equal(local.occurredAtUtc, "2026-01-01T05:32:03.1234567Z"); assert.equal(local.isoBusinessDateTime, iso.businessDateTime); });
test("Excel date systems, leap-day error and numeric formats stay explicit", () => { assert.equal(times.legacyCellTimestamp("1", "n", true, false), "01/01/1900 00:00:00.0000000"); assert.equal(times.legacyCellTimestamp("0", "n", true, true), "01/01/1904 00:00:00.0000000"); assert.throws(() => times.legacyCellTimestamp("60", "n", true, false), /excel_leap_day/); assert.throws(() => times.legacyCellTimestamp("1", "n", false, false), /numeric_unsupported/); for (const date of ["2026-02-30T12:00:00Z", "2026-01-01T25:00:00Z"])
    assert.throws(() => times.parseModernTimestamp(date, "-4", options), /timestamp_invalid/); assert.throws(() => times.parseOffsetMinutes("14:01"), /offset_invalid/); });
for (const [name, mutate, expected] of [
    ["traversal", entries => [...entries, { name: "../outside.xml", bytes: Buffer.from("<x/>") }], "getnet_zip_path_invalid"],
    ["case duplicate", entries => [...entries, { ...entries[0], name: entries[0].name.toUpperCase() }], "getnet_zip_path_invalid"],
    ["embedded active content", entries => [...entries, { name: "xl/vbaProject.bin", bytes: Buffer.from("fixture") }], "getnet_external_or_active_content"],
    ["external relationship", entries => editXml(entries, "xl/_rels/workbook.xml.rels", xml => xml.replace('<Relationship ', '<Relationship TargetMode="External" ')), "getnet_external_or_active_content"],
    ["DTD", entries => editXml(entries, "xl/workbook.xml", xml => xml.replace('<workbook', '<!DOCTYPE workbook [<!ENTITY leak "fixture">]><workbook')), "getnet_external_or_active_content"],
    ["formula", entries => editXml(entries, sheet, xml => cell(xml, "C2", "2", "n", "<f>1+1</f>")), "getnet_formula_not_allowed"],
    ["duplicate header", entries => editXml(entries, sheet, xml => cell(xml, "I1", "LOCAL")), "getnet_header_duplicate"],
    ["mixed profiles", entries => editXml(entries, sheet, xml => cell(xml, "A1", "FECHA DE VENTA")), "getnet_profile_ambiguous"],
    ["row order", entries => editXml(entries, sheet, xml => xml.replace('<row r="3"', '<row r="2"')), "getnet_row_limit_or_order"],
    ["cell reference", entries => editXml(entries, sheet, xml => xml.replace('r="B2"', 'r="B99"')), "getnet_cell_reference_invalid"],
    ["oversized physical row", entries => editXml(entries, sheet, xml => xml.replace('<row r="3"', '<row r="60002"')), "getnet_row_limit_or_order"],
])
    test(`OOXML rejects ${name} without retaining a partial accepted file`, async () => { const entries = mutate(await parts()), r = await analyzer.analyzeGetnetFiles([{ fileName: "fixture.xlsx", bytes: zip(entries) }], options); assert.equal(r.canPrepare, false); assert.ok(r.files[0].diagnostics.some(d => d.code === expected), JSON.stringify(r.files[0].diagnostics)); assert.equal(r.summary.accepted, 0); });
test("modern declines are classified before financial identity and timestamp", async () => { const entries = editXml(await parts(1), sheet, xml => cell(cell(xml, "A5", "invalid"), "B5", "")); const r = await analyzer.analyzeGetnetFiles([{ fileName: "fixture.xlsx", bytes: zip(entries) }], options); assert.equal(r.hasErrors, false); assert.equal(r.summary.rejected, 1); assert.equal(r.summary.rejectedRequestedClp, "888"); });
test("modern pending net remains unknown and cancellation stays signed", async () => { const entries = editXml(await parts(1), sheet, xml => cell(cell(cell(cell(xml, "N2", "Pendiente"), "K2", ""), "L2", ""), "M2", "")); const r = await analyzer.analyzeGetnetFiles([{ fileName: "fixture.xlsx", bytes: zip(entries) }], options); assert.equal(r.hasErrors, false); assert.equal(r.files[0].transactions[0].netClp, null); assert.equal(r.files[0].transactions[1].grossClp, "-900"); assert.equal(r.summary.knownNetCount, 2); });
test("unsupported currency on a decline cannot enter a CLP diagnostic total", async () => { const entries = editXml(await parts(1), sheet, xml => cell(xml, "H5", "USD")); const r = await analyzer.analyzeGetnetFiles([{ fileName: "fixture.xlsx", bytes: zip(entries) }], options); assert.equal(r.hasErrors, true); assert.equal(r.summary.rejected, 0); assert.equal(r.summary.rejectedRequestedClp, "0"); assert.ok(r.files[0].diagnostics.some(d => d.code === "getnet_currency_unsupported")); });
test("summary overflow remains unknown and blocks preparation", async () => { const entries = editXml(await parts(), sheet, xml => { for (const row of [2, 3])
    xml = cell(cell(cell(xml, "C" + row, "9223372036854775807"), "F" + row, "0"), "G" + row, "9223372036854775807"); return xml; }); const r = await analyzer.analyzeGetnetFiles([{ fileName: "fixture.xlsx", bytes: zip(entries) }], options); assert.equal(r.summary.accepted, 2); assert.equal(r.hasErrors, true); assert.equal(r.canPrepare, false); assert.equal(r.summary.signedGrossClp, null); assert.equal(r.summary.knownNetClp, null); assert.ok(r.diagnostics.some(d => d.code === "getnet_total_overflow")); });
test("UTF16 XML and genuine empty selections stay explicit", async () => { const entries = editXml(await parts(), sheet, xml => '<?xml version="1.0" encoding="utf-16"?>' + xml); const part = entries.find(e => e.name === sheet); part.bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(part.bytes.toString("utf8"), "utf16le")]); const r = await analyzer.analyzeGetnetFiles([{ fileName: "fixture.xlsx", bytes: zip(entries) }], options); assert.equal(r.hasErrors, false); assert.equal(r.summary.accepted, 2); await assert.rejects(() => analyzer.analyzeGetnetFiles([], options), /selection_limit/); });
