import { createHash } from "node:crypto";
import type { Json } from "@/lib/supabase/database.types";

export const SUPPLIER_IMPORT_HISTORY_PAYLOAD_VERSION = 2;
export const SUPPLIER_IMPORT_HISTORY_OVERLAY_SCHEMA = 1;
export const SUPPLIER_IMPORT_HISTORY_HEADERS = [
  "sourceRow",
  "barcode",
  "itemNumber",
  "productName",
  "quantity",
  "purchasePrice",
  "retailPrice",
  "supplier",
  "category",
  "oldPurchasePrice",
  "oldRetailPrice",
  "realQuantity",
  "RetailPrice",
  "complete",
] as const;

export type SupplierImportHistoryGridRow = {
  barcode?: string | null;
  categoryName?: string | null;
  itemNumber?: string | null;
  productName?: string | null;
  purchasePrice?: number | null;
  retailPrice?: number | null;
  rowNumber?: number | null;
  stockQuantity?: number | null;
  supplierName?: string | null;
};

export type SupplierImportHistoryEntryPayload = {
  category: string;
  data: string[][];
  displayName: string;
  isManualEntry: false;
  payloadHash: string;
  payloadVersion: typeof SUPPLIER_IMPORT_HISTORY_PAYLOAD_VERSION;
  remoteId: string;
  rowCount: number;
  sessionOverlay: {
    complete: boolean[];
    editable: string[][];
    overlay_schema: typeof SUPPLIER_IMPORT_HISTORY_OVERLAY_SCHEMA;
  };
  supplier: string;
  timestamp: string;
};

type SupplierImportHistoryPayloadInput = {
  appliedAt?: Date | string;
  categoryName?: string;
  fileName: string;
  previewDigest: string;
  rows: readonly SupplierImportHistoryGridRow[];
  shopId: string;
  supplierName?: string;
};

const UUID_BYTE_LENGTH = 16;
const HISTORY_CELL_MAX_LENGTH = 120;

function hashHex(value: string) {
  const hash = createHash("sha256");

  hash.write(value);

  return hash.digest("hex");
}

function byteFromHex(hex: string, offset: number) {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

function uuidFromBytes(bytes: number[]) {
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function buildDeterministicSupplierImportHistoryRemoteId(seed: string) {
  const digest = hashHex(seed);
  const bytes = Array.from({ length: UUID_BYTE_LENGTH }, (_, index) =>
    byteFromHex(digest, index * 2),
  );

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return uuidFromBytes(bytes);
}

function dateFromInput(value: Date | string | undefined) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  return new Date();
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatMobileHistoryTimestamp(value: Date | string | undefined) {
  const date = dateFromInput(value);

  return [
    [
      date.getUTCFullYear(),
      padDatePart(date.getUTCMonth() + 1),
      padDatePart(date.getUTCDate()),
    ].join("-"),
    [
      padDatePart(date.getUTCHours()),
      padDatePart(date.getUTCMinutes()),
      padDatePart(date.getUTCSeconds()),
    ].join(":"),
  ].join(" ");
}

function normalizeText(value: string | number | null | undefined, fallback = "") {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (normalized || fallback).slice(0, HISTORY_CELL_MAX_LENGTH);
}

function fileDisplayName(fileName: string) {
  const normalized = normalizeText(fileName, "supplier workbook");
  const withoutExtension = normalized.replace(/\.(xlsx|xls)$/i, "").trim();

  return withoutExtension || normalized;
}

function uniqueNonEmpty(values: readonly (string | null | undefined)[]) {
  const byKey = new Map<string, string>();

  for (const value of values) {
    const normalized = normalizeText(value);

    if (normalized) {
      byKey.set(normalized.toLowerCase(), normalized);
    }
  }

  return Array.from(byKey.values()).sort((left, right) =>
    left.localeCompare(right),
  );
}

function summarizeLabel(input: {
  fallback?: string;
  mixedLabel: string;
  values: readonly (string | null | undefined)[];
}) {
  const values = uniqueNonEmpty(input.values);

  if (values.length === 1) {
    return values[0];
  }

  if (values.length > 1) {
    return input.mixedLabel;
  }

  return normalizeText(input.fallback);
}

function numberCell(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function buildHistoryGrid(rows: readonly SupplierImportHistoryGridRow[]) {
  return [
    [...SUPPLIER_IMPORT_HISTORY_HEADERS],
    ...rows.map((row) => [
      row.rowNumber === null || row.rowNumber === undefined
        ? ""
        : String(row.rowNumber),
      normalizeText(row.barcode),
      normalizeText(row.itemNumber),
      normalizeText(row.productName),
      numberCell(row.stockQuantity),
      numberCell(row.purchasePrice),
      numberCell(row.retailPrice),
      normalizeText(row.supplierName),
      normalizeText(row.categoryName),
      numberCell(row.purchasePrice),
      numberCell(row.retailPrice),
      "",
      "",
      "",
    ]),
  ];
}

function payloadHash(input: {
  category: string;
  data: string[][];
  displayName: string;
  remoteId: string;
  sessionOverlay: SupplierImportHistoryEntryPayload["sessionOverlay"];
  supplier: string;
  timestamp: string;
}) {
  return hashHex(JSON.stringify(input));
}

export function buildSupplierImportHistoryEntryPayload(
  input: SupplierImportHistoryPayloadInput,
): SupplierImportHistoryEntryPayload {
  const timestamp = formatMobileHistoryTimestamp(input.appliedAt);
  const supplier = summarizeLabel({
    fallback: input.supplierName,
    mixedLabel: "Mixed suppliers",
    values: input.rows.map((row) => row.supplierName),
  });
  const category = summarizeLabel({
    fallback: input.categoryName,
    mixedLabel: "Mixed categories",
    values: input.rows.map((row) => row.categoryName),
  });
  const displaySubject = supplier || fileDisplayName(input.fileName);
  const displayName = normalizeText(
    `Supplier import - ${displaySubject} - ${timestamp.slice(0, 10)}`,
    `Supplier import - ${timestamp.slice(0, 10)}`,
  );
  const remoteId = buildDeterministicSupplierImportHistoryRemoteId(
    [
      "admin-web",
      "supplier-import-history",
      input.shopId,
      input.previewDigest,
    ].join(":"),
  );
  const data = buildHistoryGrid(input.rows);
  const sessionOverlay = {
    complete: data.map(() => false),
    editable: data.map(() => ["", ""]),
    overlay_schema: SUPPLIER_IMPORT_HISTORY_OVERLAY_SCHEMA,
  } satisfies SupplierImportHistoryEntryPayload["sessionOverlay"];

  return {
    category,
    data,
    displayName,
    isManualEntry: false,
    payloadHash: payloadHash({
      category,
      data,
      displayName,
      remoteId,
      sessionOverlay,
      supplier,
      timestamp,
    }),
    payloadVersion: SUPPLIER_IMPORT_HISTORY_PAYLOAD_VERSION,
    remoteId,
    rowCount: input.rows.length,
    sessionOverlay,
    supplier,
    timestamp,
  };
}

export function supplierImportHistoryPayloadJson(
  payload: SupplierImportHistoryEntryPayload,
) {
  return {
    data: payload.data as Json,
    sessionOverlay: payload.sessionOverlay as Json,
  };
}
