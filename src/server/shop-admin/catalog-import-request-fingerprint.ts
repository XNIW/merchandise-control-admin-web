type CatalogImportRequestFingerprintInput = {
  importMode: "database" | "supplier";
  previewDigest: string;
  rowAdjustments: readonly object[];
  syncPreviewDigest: string;
};

function canonicalRowAdjustment(value: object) {
  const row = value as Record<string, unknown>;

  return {
    barcode: row.barcode,
    category: row.category,
    itemNumber: row.itemNumber,
    productName: row.productName,
    purchasePrice: row.purchasePrice,
    quantity: row.quantity,
    retailPrice: row.retailPrice,
    rowFingerprint: row.rowFingerprint,
    rowNumber: row.rowNumber,
    secondProductName: row.secondProductName,
    skip: row.skip,
    supplier: row.supplier,
  };
}

export function canonicalCatalogImportRequestPayload(
  input: CatalogImportRequestFingerprintInput,
) {
  const rowAdjustments = [...input.rowAdjustments]
    .map(canonicalRowAdjustment)
    .sort((left, right) =>
      Number(left.rowNumber) - Number(right.rowNumber),
    );

  return {
    importMode: input.importMode,
    previewDigest: input.previewDigest,
    rowAdjustments,
    syncPreviewDigest: input.syncPreviewDigest,
  };
}
