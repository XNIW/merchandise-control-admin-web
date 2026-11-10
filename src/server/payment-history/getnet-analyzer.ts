import "server-only";
import { createHash } from "node:crypto";
import { GETNET_WEB_LIMITS as L } from "./getnet-limits";
import { GetnetHeaderMap, parseGetnetRow } from "./getnet-row-parser";
import { GetnetImportError, type GetnetDiagnostic, type GetnetFileAnalysis, type GetnetImportOptions, type GetnetProfile, type GetnetSource } from "./getnet-contract";
import { openGetnetWorkbook } from "./getnet-ooxml";
import { checkedClp } from "./value-rules";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function analyzeGetnetFiles(inputs: readonly {
    fileName: string;
    bytes: Buffer;
}[], options: GetnetImportOptions, signal?: AbortSignal) {
    if (!options || !["Unresolved", "IsoUtc", "ExportedLocal"].includes(options.modernTimeInterpretation) || typeof options.legacyAmountsAreClp !== "boolean" || !options.temporalPolicyVersion?.trim() || options.temporalPolicyVersion.length > 160 || typeof options.temporalEvidenceReference !== "string" || options.temporalEvidenceReference.length > 2048)
        throw new GetnetImportError("historical_import_policy_invalid");
    if (!inputs.length || inputs.length > L.files || inputs.reduce((sum, file) => sum + file.bytes.length, 0) > L.selectionBytes)
        throw new GetnetImportError("getnet_selection_limit");
    const files: GetnetFileAnalysis[] = [];
    let totalRows = 0;
    for (const [index, input] of inputs.entries()) {
        signal?.throwIfAborted();
        const fileId = `file-${index + 1}`, hash = sha(input.bytes);
        const file: GetnetFileAnalysis = { fileId, fileName: input.fileName, sha256: hash, byteLength: input.bytes.length, sheetName: null, profile: null, sourceRows: 0, transactions: [], rejected: [], diagnostics: [] };
        files.push(file);
        let source: GetnetSource | null = null;
        try {
            if (!/\.xlsx$/i.test(input.fileName) || input.fileName.length > 256)
                throw new GetnetImportError("getnet_format_unsupported");
            const workbook = await openGetnetWorkbook(input.bytes, signal);
            const candidates: {
                sheet: {
                    name: string;
                    path: string;
                };
                header: GetnetHeaderMap;
                profile: GetnetProfile;
            }[] = [];
            for (const sheet of workbook.sheets)
                await workbook.readRows(sheet.path, row => {
                    const header = new GetnetHeaderMap(row.number, row), profile = header.profile();
                    if (profile) {
                        candidates.push({ sheet, header, profile });
                        return false;
                    }
                }, true);
            if (candidates.length !== 1)
                throw new GetnetImportError(candidates.length ? "getnet_multiple_candidate_sheets" : "getnet_profile_unrecognized");
            const { sheet, header, profile } = candidates[0];
            header.validate(profile);
            file.sheetName = sheet.name;
            file.profile = profile;
            await workbook.readRows(sheet.path, row => {
                if (row.number <= header.rowNumber || !row.hasContent)
                    return;
                if (++totalRows > L.selectionRows)
                    throw new GetnetImportError("getnet_selection_row_limit");
                file.sourceRows++;
                source = { fileId, fileSha256: hash, sheetName: sheet.name, rowNumber: row.number };
                try {
                    const parsed = parseGetnetRow(header, row, source, profile, options, workbook.date1904);
                    if ("externalId" in parsed)
                        file.transactions.push(parsed);
                    else
                        file.rejected.push(parsed);
                }
                catch (error) {
                    if (signal?.aborted)
                        throw error;
                    const code = error instanceof GetnetImportError ? error.code : error instanceof Error && /^getnet_[a-z0-9_]+$/.test(error.message) ? error.message : "getnet_row_invalid";
                    file.diagnostics.push({ code, severity: "Error", source, field: error instanceof GetnetImportError ? error.field : "", column: error instanceof GetnetImportError ? error.column : null });
                    if (file.diagnostics.length >= L.diagnostics)
                        throw new GetnetImportError("getnet_diagnostic_limit");
                }
            });
            if (sha(input.bytes) !== hash)
                throw new GetnetImportError("getnet_input_changed");
        }
        catch (error) {
            if (signal?.aborted)
                throw error;
            // A structural failure rejects the whole file, including rows observed earlier.
            file.transactions = [];
            file.rejected = [];
            file.sourceRows = 0;
            file.diagnostics.push({ code: error instanceof GetnetImportError ? error.code : "getnet_workbook_invalid", severity: "Error", source, field: error instanceof GetnetImportError ? error.field : "", column: error instanceof GetnetImportError ? error.column : null });
        }
    }
    const transactions = files.flatMap(file => file.transactions), rejected = files.flatMap(file => file.rejected);
    const needsEvidence = transactions.some(row => row.timestamp.needsEvidence || row.profile === "GetnetLegacy" && !options.legacyAmountsAreClp);
    const diagnostics: GetnetDiagnostic[] = files.flatMap(file => file.diagnostics);
    let overflow = false;
    const sum = (values: (string | null)[]) => {
        let total = BigInt("0");
        for (const value of values) {
            total += BigInt(value ?? 0);
            try {
                checkedClp(total);
            }
            catch {
                overflow = true;
            }
        }
        return total.toString();
    };
    const totals = { signedGrossClp: sum(transactions.map(row => row.grossClp)), positiveGrossClp: sum(transactions.filter(row => row.movementKind === "Sale").map(row => row.grossClp)), cancellationGrossClp: sum(transactions.filter(row => row.movementKind === "Cancellation").map(row => row.grossClp)), knownNetClp: sum(transactions.map(row => row.netClp)), rejectedRequestedClp: sum(rejected.map(row => row.requestedClp)) };
    if (overflow)
        diagnostics.push({ code: "getnet_total_overflow", severity: "Error", source: null, field: "", column: null });
    if (needsEvidence)
        diagnostics.push({ code: "getnet_policy_needs_evidence", severity: "Warning", source: null, field: "", column: null });
    const range = (values: (string | null)[]) => { const dates = values.filter((value): value is string => value !== null).sort(); return [dates[0] ?? null, dates[dates.length - 1] ?? null] as const; };
    const allBusinessKnown = transactions.every(row => row.timestamp.businessDateTime !== null);
    const business = range(transactions.map(row => row.timestamp.businessDateTime)), iso = range(transactions.map(row => row.timestamp.isoBusinessDateTime ?? row.timestamp.businessDateTime)), local = range(transactions.map(row => row.timestamp.exportedLocalDateTime ?? row.timestamp.businessDateTime));
    const hasErrors = diagnostics.some(diagnostic => diagnostic.severity === "Error");
    return { parserVersion: "getnet-ooxml-web-v1", files, diagnostics, hasErrors, needsEvidence, canPrepare: transactions.length > 0 && !hasErrors && !needsEvidence,
        summary: { sourceRows: files.reduce((sum, file) => sum + file.sourceRows, 0), accepted: transactions.length, sales: transactions.filter(row => row.movementKind === "Sale").length, cancellations: transactions.filter(row => row.movementKind === "Cancellation").length, rejected: rejected.length,
            signedGrossClp: overflow ? null : totals.signedGrossClp, positiveGrossClp: overflow ? null : totals.positiveGrossClp, cancellationGrossClp: overflow ? null : totals.cancellationGrossClp, knownNetClp: overflow ? null : totals.knownNetClp, knownNetCount: transactions.filter(row => row.netClp !== null).length, rejectedRequestedClp: overflow ? null : totals.rejectedRequestedClp, knownRejectedRequestedCount: rejected.filter(row => row.requestedClp !== null).length,
            fromBusinessDateTime: allBusinessKnown ? business[0] : null, toBusinessDateTime: allBusinessKnown ? business[1] : null, fromIsoCandidateDateTime: iso[0], toIsoCandidateDateTime: iso[1], fromExportedLocalCandidateDateTime: local[0], toExportedLocalCandidateDateTime: local[1] } };
}
