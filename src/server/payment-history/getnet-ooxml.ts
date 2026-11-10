import "server-only";
import * as unzipper from "unzipper-esm";
import { SaxesParser, type SaxesTagNS } from "saxes";
import { GetnetImportError, type GetnetCell, type GetnetWorksheetRow } from "./getnet-contract";
import { GETNET_WEB_LIMITS as L } from "./getnet-limits";
type Entry = Awaited<ReturnType<typeof unzipper.Open.buffer>>["files"][number];
type Hooks = {
    open?: (tag: SaxesTagNS) => void;
    close?: (tag: SaxesTagNS) => void;
    text?: (text: string) => void;
};
function fail(code: string): never { throw new GetnetImportError(code); }
class HeaderScanComplete extends Error {
}
function attr(tag: SaxesTagNS, name: string, namespace?: string) {
    return Object.values(tag.attributes).find(value => namespace ? value.local === name && value.uri === namespace : value.name === name)?.value;
}
async function parseXml(entry: Entry | undefined, limit: number, hooks: Hooks, signal?: AbortSignal) {
    if (!entry)
        fail("getnet_workbook_part_missing");
    if (entry.uncompressedSize > limit)
        fail("getnet_xml_limit");
    const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: "1.0", forceXMLVersion: true });
    parser.on("error", () => fail("getnet_xml_invalid"));
    parser.on("xmldecl", decl => { if (decl.version !== "1.0")
        fail("getnet_xml_invalid"); });
    parser.on("doctype", () => fail("getnet_external_or_active_content"));
    parser.on("opentag", tag => { signal?.throwIfAborted(); for (const value of Object.values(tag.attributes))
        if (value.value.length > L.cellCharacters)
            fail("getnet_cell_text_limit"); hooks.open?.(tag); });
    parser.on("closetag", tag => hooks.close?.(tag));
    parser.on("text", text => hooks.text?.(text));
    parser.on("cdata", text => hooks.text?.(text));
    const stream = entry.stream();
    let bytes = 0, decoder: TextDecoder | null = null;
    try {
        for await (const raw of stream) {
            signal?.throwIfAborted();
            const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
            bytes += chunk.length;
            if (bytes > limit || bytes > entry.uncompressedSize)
                fail("getnet_xml_limit");
            if (!decoder) {
                const encoding = chunk[0] === 0xff && chunk[1] === 0xfe || chunk[0] === 0x3c && chunk[1] === 0 ? "utf-16le" : chunk[0] === 0xfe && chunk[1] === 0xff || chunk[0] === 0 && chunk[1] === 0x3c ? "utf-16be" : "utf-8";
                decoder = new TextDecoder(encoding, { fatal: true });
            }
            parser.write(decoder.decode(chunk, { stream: true }));
        }
        parser.write(decoder?.decode() ?? "").close();
        if (bytes !== entry.uncompressedSize)
            fail("getnet_zip_length_invalid");
    }
    catch (error) {
        if (!(error instanceof HeaderScanComplete))
            throw error;
    }
    finally {
        stream.destroy();
    }
}
type Style = {
    format: string;
    date: boolean;
};
export async function openGetnetWorkbook(bytes: Buffer, signal?: AbortSignal) {
    if (bytes.length > L.fileBytes)
        fail("getnet_file_limit");
    const directory = await unzipper.Open.buffer(bytes), entries = new Map<string, Entry>(), names = new Set<string>();
    if (directory.files.length > L.zipEntries)
        fail("getnet_zip_entry_limit");
    let expanded = 0;
    for (const entry of directory.files) {
        const name = entry.path, key = name.toLowerCase();
        if (name.startsWith("/") || /[\\:]/.test(name) || name.split("/").some(part => part === ".." || part === ".") || names.has(key))
            fail("getnet_zip_path_invalid");
        names.add(key);
        entries.set(name, entry);
        if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || (entry.flags & 1) || ![0, 8].includes(entry.compressionMethod))
            fail("getnet_zip_unsupported");
        expanded += entry.uncompressedSize;
        if (expanded > L.expandedZipBytes)
            fail("getnet_zip_expansion_limit");
        if (/vbaProject|externalLinks\/|embeddings\//i.test(name))
            fail("getnet_external_or_active_content");
        if (name.toLowerCase().endsWith(".rels"))
            await parseXml(entry, L.metadataXmlBytes, { open(tag) { if (tag.local === "Relationship" && attr(tag, "TargetMode")?.toLowerCase() === "external")
                    fail("getnet_external_or_active_content"); } }, signal);
    }
    const relationships = new Map<string, string>();
    await parseXml(entries.get("xl/_rels/workbook.xml.rels"), L.metadataXmlBytes, { open(tag) {
            if (tag.local !== "Relationship")
                return;
            const id = attr(tag, "Id"), rawTarget = attr(tag, "Target");
            if (!id || rawTarget === undefined || relationships.has(id))
                fail("getnet_workbook_relationship_invalid");
            const target = rawTarget.startsWith("/xl/") ? rawTarget.slice(1) : "xl/" + rawTarget;
            if (target.includes("..") || /[\\:]/.test(target))
                fail("getnet_workbook_relationship_invalid");
            relationships.set(id, target);
        } }, signal);
    const sheets: {
        name: string;
        path: string;
    }[] = [];
    let date1904 = false;
    await parseXml(entries.get("xl/workbook.xml"), L.metadataXmlBytes, { open(tag) {
            if (tag.local === "workbookPr")
                date1904 = ["1", "true"].includes(attr(tag, "date1904") ?? "");
            if (tag.local !== "sheet")
                return;
            const id = attr(tag, "id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"), path = id ? relationships.get(id) : undefined;
            if (!path || sheets.length >= 16)
                fail("getnet_worksheet_limit_or_relationship");
            sheets.push({ name: attr(tag, "name") ?? "", path });
        } }, signal);
    const strings: string[] = [];
    let text = "", inShared = false, inText = 0, characters = 0;
    if (entries.has("xl/sharedStrings.xml"))
        await parseXml(entries.get("xl/sharedStrings.xml"), L.sharedStringsXmlBytes, {
            open(tag) { if (tag.local === "si") {
                inShared = true;
                text = "";
            } if (inShared && tag.local === "t")
                inText++; },
            text(value) { if (inText) {
                text += value;
                if (text.length > L.cellCharacters)
                    fail("getnet_cell_text_limit");
            } },
            close(tag) { if (tag.local === "t" && inShared)
                inText--; if (tag.local === "si") {
                inShared = false;
                characters += text.length;
                if (strings.length >= L.sharedStrings || characters > L.sharedStringCharacters)
                    fail("getnet_shared_string_limit");
                strings.push(text);
            } },
        }, signal);
    const styles: Style[] = [], formats = new Map<number, string>();
    let inXfs = false;
    if (entries.has("xl/styles.xml"))
        await parseXml(entries.get("xl/styles.xml"), L.metadataXmlBytes, {
            open(tag) {
                if (tag.local === "cellXfs")
                    inXfs = true;
                if (tag.local === "numFmt") {
                    const id = Number(attr(tag, "numFmtId")), format = attr(tag, "formatCode") ?? "";
                    if (!Number.isSafeInteger(id) || id < 0)
                        fail("getnet_style_invalid");
                    if (formats.size >= 4096 || formats.has(id))
                        fail("getnet_style_limit_or_duplicate");
                    formats.set(id, format);
                }
                if (inXfs && tag.local === "xf") {
                    const id = Number(attr(tag, "numFmtId") ?? "0");
                    if (!Number.isSafeInteger(id) || id < 0 || styles.length >= 4096)
                        fail("getnet_style_invalid");
                    const format = formats.get(id) ?? (id === 0 ? "General" : id === 1 ? "0" : "");
                    styles.push({ format, date: id >= 14 && id <= 22 || id >= 45 && id <= 47 || format.includes("y") && format.includes("d") });
                }
            }, close(tag) { if (tag.local === "cellXfs")
                inXfs = false; },
        }, signal);
    if (!styles.length)
        styles.push({ format: "General", date: false });
    async function readRows(path: string, onRow: (row: GetnetWorksheetRow) => void | boolean, headerOnly = false) {
        let previousRow = 0, previousColumn = 0, cells = 0, row: GetnetWorksheetRow | null = null, cell: GetnetCell | null = null, column = 0, inValue = 0, inInline = 0, inInlineText = 0;
        await parseXml(entries.get(path), L.worksheetXmlBytes, {
            open(tag) {
                if (tag.local === "row") {
                    const raw = attr(tag, "r") ?? String(previousRow + 1);
                    if (!/^\d+$/.test(raw))
                        fail("getnet_row_limit_or_order");
                    const number = Number(raw);
                    if (number <= previousRow || number > L.worksheetRows)
                        fail("getnet_row_limit_or_order");
                    previousRow = number;
                    previousColumn = 0;
                    row = { number, cells: new Map(), hasContent: false };
                }
                if (tag.local === "c" && row) {
                    const reference = attr(tag, "r"), match = reference ? /^([A-Z]+)([0-9]+)$/.exec(reference) : null;
                    column = previousColumn + 1;
                    if (reference) {
                        if (!match || Number(match[2]) !== row.number)
                            fail("getnet_cell_reference_invalid");
                        column = 0;
                        for (const ch of match[1])
                            column = column * 26 + ch.charCodeAt(0) - 64;
                    }
                    if (column <= previousColumn || column > L.columns || ++cells > L.worksheetCells)
                        fail("getnet_cell_limit_or_order");
                    previousColumn = column;
                    const rawStyle = attr(tag, "s") ?? "0", index = Number(rawStyle);
                    if (!/^\d+$/.test(rawStyle) || !styles[index])
                        fail("getnet_style_invalid");
                    const style = styles[index];
                    cell = { value: "", type: attr(tag, "t") ?? "n", numberFormat: style.format, isDate: style.date };
                }
                if (cell) {
                    if (tag.local === "f")
                        fail("getnet_formula_not_allowed");
                    if (tag.local === "v")
                        inValue++;
                    if (tag.local === "is")
                        inInline++;
                    if (inInline && tag.local === "t")
                        inInlineText++;
                }
            },
            text(value) { if (cell && (inValue || inInlineText)) {
                cell.value += value;
                if (cell.value.length > L.cellCharacters)
                    fail("getnet_cell_text_limit");
            } },
            close(tag) {
                if (tag.local === "v")
                    inValue--;
                if (tag.local === "t" && inInline)
                    inInlineText--;
                if (tag.local === "is")
                    inInline--;
                if (tag.local === "c" && row && cell) {
                    if (cell.type === "s") {
                        if (!/^\d+$/.test(cell.value) || Number(cell.value) >= strings.length)
                            fail("getnet_shared_string_invalid");
                        cell.value = strings[Number(cell.value)];
                    }
                    if (cell.value.trim())
                        row.hasContent = true;
                    row.cells.set(column, cell);
                    cell = null;
                }
                if (tag.local === "row" && row) {
                    if (headerOnly && row.number > 32)
                        throw new HeaderScanComplete();
                    if (onRow(row) === false)
                        throw new HeaderScanComplete();
                    row = null;
                }
            },
        }, signal);
    }
    return { sheets, date1904, readRows };
}
