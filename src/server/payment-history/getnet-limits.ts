// Web capacity differs deliberately from the Windows reader. Content rules do not.
export const GETNET_WEB_LIMITS = { files: 10, fileBytes: 20 * 1024 * 1024, selectionBytes: 100 * 1024 * 1024,
    worksheetRows: 60001, selectionRows: 100000, columns: 256, worksheetCells: 1000000, cellCharacters: 32767,
    sharedStrings: 200000, sharedStringCharacters: 8000000, diagnostics: 2000, zipEntries: 512,
    expandedZipBytes: 256 * 1024 * 1024, worksheetXmlBytes: 32 * 1024 * 1024, metadataXmlBytes: 4 * 1024 * 1024,
    sharedStringsXmlBytes: 32 * 1024 * 1024 } as const;
