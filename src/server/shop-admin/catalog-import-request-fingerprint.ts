type CatalogImportRequestFingerprintInput = {
  importMode: "database" | "supplier";
  previewDigest: string;
  rowAdjustments: readonly object[];
  syncPreviewDigest: string;
};

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entryValue]) => [key, canonicalJsonValue(entryValue)]),
    );
  }

  return value;
}

export function canonicalCatalogImportRequestPayload(
  input: CatalogImportRequestFingerprintInput,
) {
  const rowAdjustments = [...input.rowAdjustments]
    .map(canonicalJsonValue)
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );

  return {
    importMode: input.importMode,
    previewDigest: input.previewDigest,
    rowAdjustments,
    syncPreviewDigest: input.syncPreviewDigest,
  };
}
