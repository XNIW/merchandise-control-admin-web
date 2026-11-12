import type { GetnetTimeOptions, GetnetTimestamp } from "./time-rules";
export const GETNET_WEB_PARSER_VERSION = "getnet-ooxml-web-v1";
export type GetnetCell = {
    value: string;
    type: string;
    numberFormat: string;
    isDate: boolean;
};
export type GetnetWorksheetRow = {
    number: number;
    cells: Map<number, GetnetCell>;
    hasContent: boolean;
};
export type GetnetProfile = "GetnetLegacy" | "GetnetModern";
export type GetnetSource = {
    fileId: string;
    fileSha256: string;
    sheetName: string;
    rowNumber: number;
};
export type GetnetMerchant = {
    local: string;
    seller: string;
    sellerId: string;
    localNumber: string;
    rut: string;
    hasEvidence: boolean;
};
export type GetnetTransaction = {
    source: GetnetSource;
    profile: GetnetProfile;
    profileVersion: "getnet-legacy-v1" | "getnet-modern-v1";
    parserVersion: string;
    provider: "getnet";
    currency: "CLP";
    paymentMethod: "card";
    externalNamespace: string;
    externalId: string;
    paymentId: string;
    authorizationCode: string;
    merchant: GetnetMerchant;
    timestamp: GetnetTimestamp;
    movementKind: "Sale" | "Cancellation";
    transactionStatus: string;
    settlementStatus: string;
    grossClp: string;
    commissionClp: string | null;
    commissionVatClp: string | null;
    netClp: string | null;
    cardSubtype: "Debit" | "Credit" | "Prepaid" | "Unknown";
    originalCardType: string;
    originalPrepaid: string;
    terminal: string;
    rawSettlementDate: string;
    originalCashierId: null;
};
export type GetnetRejectedRow = {
    source: GetnetSource;
    transactionStatus: string;
    requestedClp: string | null;
};
export type GetnetDiagnostic = {
    code: string;
    severity: "Error" | "Warning";
    source: GetnetSource | null;
    field: string;
    column: number | null;
};
export type GetnetImportOptions = GetnetTimeOptions & {
    legacyAmountsAreClp: boolean;
};
export class GetnetImportError extends Error {
    constructor(readonly code: string, readonly field = "", readonly row = 0, readonly column: number | null = null) { super(code); }
}
export type GetnetFileAnalysis = {
    fileId: string;
    fileName: string;
    sha256: string;
    byteLength: number;
    sheetName: string | null;
    profile: GetnetProfile | null;
    sourceRows: number;
    transactions: GetnetTransaction[];
    rejected: GetnetRejectedRow[];
    diagnostics: GetnetDiagnostic[];
};
