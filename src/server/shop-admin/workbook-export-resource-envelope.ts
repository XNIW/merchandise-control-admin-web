export const CATALOG_WORKBOOK_EXPORT_LIMITS = {
  categories: 500,
  deadlineMs: 45_000,
  estimatedBytes: 32 * 1024 * 1024,
  finalBytes: 8 * 1024 * 1024,
  maxConcurrency: 2,
  prices: 2_500,
  products: 2_000,
  sourceTextBytes: 2 * 1024 * 1024,
  suppliers: 500,
  totalCells: 33_000,
  totalRows: 3_000,
} as const;

export type CatalogWorkbookExportCounts = {
  categories: number;
  prices: number;
  products: number;
  suppliers: number;
};

export type CatalogWorkbookExportPreflight = CatalogWorkbookExportCounts & {
  sourceTextBytes: number;
};

export type CatalogWorkbookExportResourceCode =
  | "request_cancelled"
  | "resource_limit_exceeded"
  | "resource_deadline_exceeded";

export type CatalogWorkbookExportMetrics = CatalogWorkbookExportCounts & {
  deadlineMs: number;
  elapsedMs: number;
  estimatedBytes: number;
  finalBytes: number;
  peakConcurrency: number;
  sourceTextBytes: number;
  totalCells: number;
  totalRows: number;
};

export class CatalogWorkbookExportResourceError extends Error {
  readonly code: CatalogWorkbookExportResourceCode;

  constructor(code: CatalogWorkbookExportResourceCode) {
    super(code);
    this.code = code;
    this.name = "CatalogWorkbookExportResourceError";
  }
}

function abortedResourceCode(signal: AbortSignal) {
  return signal.reason === "resource_deadline_exceeded"
    ? "resource_deadline_exceeded"
    : "request_cancelled";
}

export async function collectBoundedWorkbookBytes(input: {
  cancel: (error: Error) => void;
  chunks: AsyncIterable<Uint8Array>;
  maxBytes: number;
  signal: AbortSignal;
}) {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const abortError = () =>
    new CatalogWorkbookExportResourceError(
      abortedResourceCode(input.signal),
    );
  const onAbort = () => input.cancel(abortError());

  input.signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (input.signal.aborted) throw abortError();
    for await (const chunk of input.chunks) {
      if (input.signal.aborted) throw abortError();
      if (!(chunk instanceof Uint8Array) || chunk.byteLength < 1) {
        throw new Error("workbook_stream_contract_invalid");
      }
      totalBytes += chunk.byteLength;
      if (
        !Number.isSafeInteger(totalBytes) ||
        totalBytes > input.maxBytes
      ) {
        const error = new CatalogWorkbookExportResourceError(
          "resource_limit_exceeded",
        );
        input.cancel(error);
        throw error;
      }
      chunks.push(chunk);
    }
    if (input.signal.aborted) throw abortError();
    if (totalBytes < 1) {
      throw new Error("workbook_stream_contract_invalid");
    }
    return { chunks, totalBytes };
  } finally {
    input.signal.removeEventListener("abort", onAbort);
  }
}

export async function collectBoundedWorkbookPages<Row>(input: {
  expectedCount: number;
  getId: (row: Row) => string | null;
  loadPage: (input: {
    afterId?: string;
    limit: number;
    signal: AbortSignal;
  }) => Promise<{
    hasMore: boolean;
    nextAfterId: string | null;
    rows: Row[];
  }>;
  maxRows: number;
  pageSize: number;
  signal: AbortSignal;
}) {
  if (
    !Number.isSafeInteger(input.expectedCount) ||
    input.expectedCount < 0 ||
    input.expectedCount > input.maxRows ||
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1
  ) {
    throw new CatalogWorkbookExportResourceError("resource_limit_exceeded");
  }
  const rows: Row[] = [];
  const seenIds = new Set<string>();
  let afterId: string | undefined;
  let previousId: string | undefined;
  const maxPages = Math.ceil(input.expectedCount / input.pageSize) + 1;

  for (let page = 0; page < maxPages; page += 1) {
    if (input.signal.aborted) {
      throw new CatalogWorkbookExportResourceError(
        abortedResourceCode(input.signal),
      );
    }
    const loaded = await input.loadPage({
      ...(afterId ? { afterId } : {}),
      limit: input.pageSize,
      signal: input.signal,
    });
    if (input.signal.aborted) {
      throw new CatalogWorkbookExportResourceError(
        abortedResourceCode(input.signal),
      );
    }
    if (loaded.rows.length > input.pageSize) {
      throw new Error("workbook_page_contract_invalid");
    }
    let pageLastId: string | null = null;
    for (const row of loaded.rows) {
      const id = input.getId(row);
      if (
        id === null ||
        (previousId !== undefined && id <= previousId) ||
        seenIds.has(id)
      ) {
        throw new Error("workbook_page_contract_invalid");
      }
      rows.push(row);
      seenIds.add(id);
      previousId = id;
      pageLastId = id;
    }
    if (rows.length > input.expectedCount || rows.length > input.maxRows) {
      throw new CatalogWorkbookExportResourceError(
        "resource_limit_exceeded",
      );
    }
    if (!loaded.hasMore) {
      if (
        (pageLastId === null && loaded.nextAfterId !== null) ||
        (pageLastId !== null && loaded.nextAfterId !== pageLastId) ||
        rows.length !== input.expectedCount
      ) {
        throw new Error("workbook_page_contract_invalid");
      }
      return rows;
    }
    if (
      pageLastId === null ||
      loaded.nextAfterId !== pageLastId ||
      rows.length >= input.expectedCount
    ) {
      throw new Error("workbook_page_contract_invalid");
    }
    afterId = loaded.nextAfterId;
  }
  throw new Error("workbook_page_contract_invalid");
}

export async function finalizeBoundedWorkbookExport<
  BufferType extends Uint8Array,
  AuditResult,
>(input: {
  audit: (
    metrics: CatalogWorkbookExportMetrics,
  ) => PromiseLike<AuditResult> | AuditResult;
  counts: CatalogWorkbookExportCounts;
  resource: ReturnType<typeof createCatalogWorkbookExportResourceEnvelope>;
  serialize: (signal: AbortSignal) => PromiseLike<BufferType> | BufferType;
}) {
  input.resource.assertCounts(input.counts);
  input.resource.assertActive();
  const buffer = await input.serialize(input.resource.signal);
  input.resource.assertActive();
  input.resource.recordFinalBytes(buffer.byteLength);
  const metrics = input.resource.metrics();
  const auditResult = await input.audit(metrics);
  input.resource.assertActive();
  return { auditResult, buffer, metrics };
}

type CatalogWorkbookExportResourceEnvelopeOptions = {
  deadlineMs?: number;
  limits?: Partial<typeof CATALOG_WORKBOOK_EXPORT_LIMITS>;
  now?: () => number;
  signal?: AbortSignal;
};

export function createCatalogWorkbookExportResourceEnvelope(
  options: CatalogWorkbookExportResourceEnvelopeOptions = {},
) {
  const limits = {
    ...CATALOG_WORKBOOK_EXPORT_LIMITS,
    ...options.limits,
  };
  const now = options.now ?? Date.now;
  const startedAt = now();
  const controller = new AbortController();
  const deadlineMs = options.deadlineMs ?? limits.deadlineMs;
  let failureCode: CatalogWorkbookExportResourceCode | null = null;
  let active = 0;
  let peakConcurrency = 0;
  let counts: CatalogWorkbookExportCounts = {
    categories: 0,
    prices: 0,
    products: 0,
    suppliers: 0,
  };
  let estimatedBytes = 0;
  let finalBytes = 0;
  let sourceTextBytes = 0;
  let totalCells = 0;
  let totalRows = 0;

  const abort = (code: CatalogWorkbookExportResourceCode) => {
    if (failureCode) return;
    failureCode = code;
    controller.abort(code);
  };
  const onExternalAbort = () => abort("request_cancelled");
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (options.signal?.aborted) onExternalAbort();
  const deadline = setTimeout(
    () => abort("resource_deadline_exceeded"),
    Math.max(1, deadlineMs),
  );
  deadline.unref?.();

  const assertActive = () => {
    if (failureCode) {
      throw new CatalogWorkbookExportResourceError(failureCode);
    }
    if (now() - startedAt >= deadlineMs) {
      abort("resource_deadline_exceeded");
      throw new CatalogWorkbookExportResourceError(
        "resource_deadline_exceeded",
      );
    }
  };

  const assertPreflight = (next: CatalogWorkbookExportPreflight) => {
    assertActive();
    const nextTotalRows =
      next.products + next.suppliers + next.categories + next.prices;
    const nextTotalCells =
      next.products * 11 +
      next.suppliers * 3 +
      next.categories * 3 +
      next.prices * 7;
    const nextEstimatedBytes =
      4 * 1024 * 1024 +
      next.sourceTextBytes * 6 +
      nextTotalCells * 384 +
      nextTotalRows * 512;
    if (
      !Number.isSafeInteger(next.sourceTextBytes) ||
      next.sourceTextBytes < 0 ||
      next.products > limits.products ||
      next.suppliers > limits.suppliers ||
      next.categories > limits.categories ||
      next.prices > limits.prices ||
      next.sourceTextBytes > limits.sourceTextBytes ||
      nextTotalRows > limits.totalRows ||
      nextTotalCells > limits.totalCells ||
      nextEstimatedBytes > limits.estimatedBytes
    ) {
      abort("resource_limit_exceeded");
      throw new CatalogWorkbookExportResourceError(
        "resource_limit_exceeded",
      );
    }
    counts = { ...next };
    totalRows = nextTotalRows;
    totalCells = nextTotalCells;
    estimatedBytes = nextEstimatedBytes;
    sourceTextBytes = next.sourceTextBytes;
  };
  const assertCounts = (next: CatalogWorkbookExportCounts) =>
    assertPreflight({ ...next, sourceTextBytes });

  const run = async <T>(
    operation: (signal: AbortSignal) => PromiseLike<T> | T,
  ) => {
    assertActive();
    if (active >= limits.maxConcurrency) {
      abort("resource_limit_exceeded");
      throw new CatalogWorkbookExportResourceError(
        "resource_limit_exceeded",
      );
    }
    active += 1;
    peakConcurrency = Math.max(peakConcurrency, active);
    try {
      return await operation(controller.signal);
    } finally {
      active -= 1;
      assertActive();
    }
  };

  return {
    assertActive,
    assertCounts,
    assertPreflight,
    dispose() {
      clearTimeout(deadline);
      options.signal?.removeEventListener("abort", onExternalAbort);
    },
    metrics(): CatalogWorkbookExportMetrics {
      return {
        ...counts,
        deadlineMs,
        elapsedMs: Math.max(0, now() - startedAt),
        estimatedBytes,
        finalBytes,
        peakConcurrency,
        sourceTextBytes,
        totalCells,
        totalRows,
      };
    },
    observeConcurrency(concurrency: number) {
      assertActive();
      if (
        !Number.isSafeInteger(concurrency) ||
        concurrency < 0 ||
        concurrency > limits.maxConcurrency
      ) {
        abort("resource_limit_exceeded");
        throw new CatalogWorkbookExportResourceError(
          "resource_limit_exceeded",
        );
      }
      peakConcurrency = Math.max(peakConcurrency, concurrency);
    },
    recordFinalBytes(bytes: number) {
      assertActive();
      if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > limits.finalBytes) {
        abort("resource_limit_exceeded");
        throw new CatalogWorkbookExportResourceError(
          "resource_limit_exceeded",
        );
      }
      finalBytes = bytes;
    },
    run,
    signal: controller.signal,
  };
}
