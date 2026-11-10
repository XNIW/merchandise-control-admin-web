import { cardSubtype, checkedClp, missingIdentifier, normalizeHeader, parseClp, parseIdentifier } from "./value-rules";
import { legacyCellTimestamp, parseLegacyTimestamp, parseModernTimestamp } from "./time-rules";
import { GETNET_WEB_PARSER_VERSION, GetnetImportError, type GetnetCell, type GetnetImportOptions, type GetnetMerchant, type GetnetProfile, type GetnetRejectedRow, type GetnetSource, type GetnetTransaction, type GetnetWorksheetRow } from "./getnet-contract";
export class GetnetHeaderMap {
    readonly columns = new Map<string, number>();
    private duplicate: string | null = null;
    constructor(readonly rowNumber: number, row: GetnetWorksheetRow) {
        for (const [index, cell] of row.cells) {
            const key = normalizeHeader(cell.value);
            if (!key)
                continue;
            if (this.columns.has(key))
                this.duplicate = key;
            else
                this.columns.set(key, index);
        }
    }
    has(field: string) { return this.columns.has(field); }
    profile(): GetnetProfile | null {
        const legacy = this.has("FECHA VENTA") || this.has("ID TRANSACCION"), modern = this.has("FECHA DE VENTA") || this.has("ID FINANCIERO DEL MOVIMIENTO") || this.has("ESTADO TRX");
        if (legacy && modern)
            throw new GetnetImportError("getnet_profile_ambiguous", "", this.rowNumber);
        return modern ? "GetnetModern" : legacy ? "GetnetLegacy" : null;
    }
    validate(profile: GetnetProfile) {
        if (this.duplicate)
            throw new GetnetImportError("getnet_header_duplicate", this.duplicate, this.rowNumber, this.columns.get(this.duplicate));
        const required = profile === "GetnetLegacy" ? ["FECHA VENTA", "ID TRANSACCION", "VALOR TRANSACCION", "ESTADO", "LOCAL", "COMISION", "MONTO ABONO"] : ["FECHA DE VENTA", "ID FINANCIERO DEL MOVIMIENTO", "MONTO BRUTO", "ESTADO TRX", "TIPO MOV.", "MONEDA", "ZONA HORARIA (UTC)"];
        for (const field of required)
            if (!this.has(field))
                throw new GetnetImportError("getnet_header_missing", field, this.rowNumber);
        if (profile === "GetnetModern") {
            if (!this.has("VALOR TRANSACCION") && !this.has("VALOR VENTA"))
                throw new GetnetImportError("getnet_header_missing", "VALOR TRANSACCION / VALOR VENTA", this.rowNumber);
            if (!["LOCAL", "VENDEDOR", "SELLER ID", "RUT", "NUM LOCAL"].some(field => this.has(field)))
                throw new GetnetImportError("getnet_header_missing", "MERCHANT", this.rowNumber);
        }
    }
}
class Row {
    constructor(readonly header: GetnetHeaderMap, readonly raw: GetnetWorksheetRow, readonly source: GetnetSource, readonly date1904: boolean) { }
    error(code: string, field: string): never { throw new GetnetImportError(code, field, this.raw.number, this.header.columns.get(field) ?? null); }
    cell(field: string): GetnetCell { return this.raw.cells.get(this.header.columns.get(field) ?? -1) ?? { value: "", type: "str", isDate: false, numberFormat: "General" }; }
    text(field: string, max = 256) { const cell = this.cell(field); if (cell.type === "e" || cell.type === "b")
        this.error("getnet_cell_type_invalid", field); const value = cell.value.trim(); if (value.length > max)
        this.error("getnet_field_text_limit", field); return value; }
    identifier(field: string, required = false) { const cell = this.cell(field), value = this.text(field); if (missingIdentifier(value)) {
        if (required)
            this.error("getnet_identifier_missing_or_invalid", field);
        return "";
    } try {
        return parseIdentifier(value, cell.type === "n", cell.numberFormat);
    }
    catch (e) {
        return this.error(e instanceof Error ? e.message : "getnet_identifier_missing_or_invalid", field);
    } }
    money(field: string, required = false): bigint | null { const value = this.text(field); if (missingIdentifier(value)) {
        if (required)
            this.error("getnet_amount_missing", field);
        return null;
    } try {
        return parseClp(value);
    }
    catch (e) {
        return this.error(e instanceof Error ? e.message : "getnet_amount_invalid", field);
    } }
    zeroExtras() { for (const field of ["PROPINA", "VUELTO", "COMISION PROPINA"]) {
        const value = this.money(field);
        if (value !== null && value !== BigInt("0"))
            this.error("getnet_tip_or_cashback_unsupported", field);
    } }
    merchant(): GetnetMerchant {
        const clean = (value: string) => missingIdentifier(value) ? "" : value;
        const merchant = { local: clean(this.text("LOCAL")), seller: clean(this.text("VENDEDOR")), sellerId: this.identifier("SELLER ID"), localNumber: this.identifier("NUM LOCAL"), rut: clean(this.text("RUT")) };
        if (!Object.values(merchant).some(Boolean))
            this.error("getnet_merchant_missing", "LOCAL");
        return { ...merchant, hasEvidence: true };
    }
}
export function parseGetnetRow(header: GetnetHeaderMap, raw: GetnetWorksheetRow, source: GetnetSource, profile: GetnetProfile, options: GetnetImportOptions, date1904: boolean): GetnetTransaction | GetnetRejectedRow {
    const row = new Row(header, raw, source, date1904), legacy = profile === "GetnetLegacy", status = row.text(legacy ? "ESTADO" : "ESTADO TRX"), normalizedStatus = normalizeHeader(status);
    if (legacy ? normalizedStatus !== "ABONADO" : !["RECHAZADA", "CONFIRMADA"].includes(normalizedStatus))
        row.error("getnet_transaction_state_unknown", legacy ? "ESTADO" : "ESTADO TRX");
    if (!legacy && normalizeHeader(row.text("MONEDA")) !== "CLP")
        row.error("getnet_currency_unsupported", "MONEDA");
    if (!legacy && normalizedStatus === "RECHAZADA") {
        let requested: bigint | null = null;
        try {
            requested = row.money(header.has("VALOR TRANSACCION") ? "VALOR TRANSACCION" : "VALOR VENTA");
        }
        catch { /* Rejected requested amount remains unknown; never accepted revenue. */ }
        return { source, transactionStatus: status, requestedClp: requested?.toString() ?? null };
    }
    const kind = legacy ? "VENTA" : normalizeHeader(row.text("TIPO MOV."));
    if (!["VENTA", "ANULACION"].includes(kind))
        row.error("getnet_movement_unknown", "TIPO MOV.");
    const gross = row.money(legacy ? "VALOR TRANSACCION" : "MONTO BRUTO", true)!;
    let commission: bigint | null, vat: bigint | null, net: bigint | null;
    const settlement = legacy ? status : row.text("ESTADO DEL ABONO");
    if (legacy) {
        commission = row.money("COMISION", true);
        vat = null;
        net = row.money("MONTO ABONO", true);
        if (gross <= BigInt("0"))
            row.error("getnet_movement_sign_invalid", "VALOR TRANSACCION");
        if (commission! < BigInt("0"))
            row.error("getnet_fee_sign_invalid", "COMISION");
        if (checkedClp(gross - commission!) !== net)
            row.error("getnet_financial_reconciliation_mismatch", "MONTO ABONO");
        row.zeroExtras();
    }
    else {
        if (kind === "VENTA" ? gross <= BigInt("0") : gross >= BigInt("0"))
            row.error("getnet_movement_sign_invalid", "MONTO BRUTO");
        for (const field of ["VALOR TRANSACCION", "VALOR VENTA"])
            if (header.has(field) && row.money(field, true) !== gross)
                row.error("getnet_amount_alias_mismatch", field);
        row.zeroExtras();
        const settled = normalizeHeader(settlement) === "ABONADO";
        commission = row.money("COMISION", settled);
        vat = row.money("IVA COMISION", settled);
        net = row.money("VALOR NETO", settled);
        if ([commission, vat].some(value => value !== null && (gross > BigInt("0") ? value > BigInt("0") : value < BigInt("0"))))
            row.error("getnet_fee_sign_invalid", "COMISION");
        if (commission !== null && vat !== null && net !== null && checkedClp(checkedClp(gross + commission) + vat) !== net)
            row.error("getnet_financial_reconciliation_mismatch", "VALOR NETO");
    }
    const legacyTime = legacy ? row.text("FECHA VENTA", 128) : null;
    const externalId = row.identifier(legacy ? "ID TRANSACCION" : "ID FINANCIERO DEL MOVIMIENTO", true), paymentId = legacy ? "" : row.identifier("PAYMENT ID"), authorizationCode = row.identifier("COD.AUT");
    const merchant = row.merchant(), dateCell = row.cell("FECHA VENTA"), rawTime = legacyTime ?? row.text("FECHA DE VENTA", 128);
    return { source, profile, profileVersion: legacy ? "getnet-legacy-v1" : "getnet-modern-v1", parserVersion: GETNET_WEB_PARSER_VERSION, provider: "getnet", currency: "CLP", paymentMethod: "card", externalNamespace: legacy ? "getnet.legacy.transaction" : "getnet.financial.movement", externalId, paymentId, authorizationCode, merchant,
        timestamp: legacy ? parseLegacyTimestamp(rawTime, legacyCellTimestamp(rawTime, dateCell.type, dateCell.isDate, date1904), options) : parseModernTimestamp(rawTime, row.text("ZONA HORARIA (UTC)", 16), options), movementKind: kind === "VENTA" ? "Sale" : "Cancellation", transactionStatus: status, settlementStatus: settlement, grossClp: gross.toString(), commissionClp: commission?.toString() ?? null, commissionVatClp: vat?.toString() ?? null, netClp: net?.toString() ?? null, cardSubtype: cardSubtype(row.text("TIPO"), legacy ? "" : row.text("PREPAGO")), originalCardType: row.text("TIPO"), originalPrepaid: legacy ? "" : row.text("PREPAGO"), terminal: legacy ? "" : row.identifier("TERMINAL"), rawSettlementDate: legacy ? "" : row.text("FECHA DE ABONO", 128), originalCashierId: null };
}
