import { createHash } from "node:crypto";

export type CatalogSyncEntity =
  | "categories"
  | "prices"
  | "products"
  | "suppliers";

export type CatalogSyncMode = "delta" | "full_refresh";

export type CatalogSyncOptions = {
  cursorSource: "none" | "sync_cursor" | "updated_since";
  limit: number;
  lowerBound: string | null;
  mode: CatalogSyncMode;
  offsets: Record<CatalogSyncEntity, number>;
  upperBound: string;
};

export type CatalogPageState = {
  hasMore: boolean;
  returned: number;
};

type CatalogCursorPayload = {
  lowerBound: string | null;
  offsets: Record<CatalogSyncEntity, number>;
  upperBound: string;
  version: 1;
};

type TimestampRow = {
  deleted_at?: string | null;
  id?: string;
  updated_at?: string | null;
};

type PriceTimestampRow = {
  created_at?: string | null;
  id?: string;
  product_id?: string;
};

export const DEFAULT_CATALOG_SYNC_LIMIT = 500;
export const MAX_CATALOG_SYNC_LIMIT = 1_000;

const CURSOR_PREFIX = "catalog-v1:";
const MAX_CURSOR_LENGTH = 2_048;
const MAX_TIMESTAMP_LENGTH = 80;
const catalogEntities: readonly CatalogSyncEntity[] = [
  "categories",
  "prices",
  "products",
  "suppliers",
];

const emptyOffsets: Record<CatalogSyncEntity, number> = {
  categories: 0,
  prices: 0,
  products: 0,
  suppliers: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(record: Record<string, unknown>, ...keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      return value.trim();
    }
  }

  return "";
}

function numberField(record: Record<string, unknown>, ...keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" || typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return DEFAULT_CATALOG_SYNC_LIMIT;
}

function normalizeLimit(record: Record<string, unknown>) {
  const requested = Math.trunc(numberField(record, "limit", "pageSize", "page_size"));

  if (requested < 1) {
    return DEFAULT_CATALOG_SYNC_LIMIT;
  }

  return Math.min(requested, MAX_CATALOG_SYNC_LIMIT);
}

function normalizeTimestamp(
  value: string,
  options: {
    maxNow?: string;
  } = {},
) {
  if (!value || value.length > MAX_TIMESTAMP_LENGTH) {
    return null;
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (options.maxNow) {
    const now = Date.parse(options.maxNow);

    if (Number.isFinite(now) && parsed > now + 60_000) {
      return null;
    }
  }

  return new Date(parsed).toISOString();
}

function normalizeLegacyCatalogTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const candidate = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(candidate);

  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString();
}

function encodeCursor(payload: CatalogCursorPayload) {
  return `${CURSOR_PREFIX}${Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  )}`;
}

function parseOffsets(input: unknown): Record<CatalogSyncEntity, number> | null {
  if (!isRecord(input)) {
    return null;
  }

  const offsets = { ...emptyOffsets };

  for (const entity of catalogEntities) {
    const value = input[entity];

    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return null;
    }

    offsets[entity] = value;
  }

  return offsets;
}

function decodeCatalogSyncCursor(value: string, serverTime: string) {
  if (!value.startsWith(CURSOR_PREFIX) || value.length > MAX_CURSOR_LENGTH) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(value.slice(CURSOR_PREFIX.length), "base64url").toString(
        "utf8",
      ),
    );

    if (!isRecord(payload) || payload.version !== 1) {
      return null;
    }

    const upperBound =
      typeof payload.upperBound === "string"
        ? normalizeTimestamp(payload.upperBound, { maxNow: serverTime })
        : null;
    let lowerBound: string | null;

    if (payload.lowerBound === null) {
      lowerBound = null;
    } else if (typeof payload.lowerBound === "string") {
      const normalizedLowerBound = normalizeTimestamp(payload.lowerBound, {
        maxNow: serverTime,
      });

      if (!normalizedLowerBound) {
        return null;
      }

      lowerBound = normalizedLowerBound;
    } else {
      return null;
    }

    const offsets = parseOffsets(payload.offsets);

    if (
      !upperBound ||
      !offsets ||
      (lowerBound && Date.parse(lowerBound) > Date.parse(upperBound))
    ) {
      return null;
    }

    return {
      lowerBound,
      offsets,
      upperBound,
    };
  } catch {
    return null;
  }
}

export function parseCatalogSyncOptions(
  input: unknown,
  serverTime: string,
):
  | {
      ok: true;
      options: CatalogSyncOptions;
    }
  | {
      code: "validation_failed";
      ok: false;
    } {
  if (!isRecord(input)) {
    return { code: "validation_failed", ok: false };
  }

  const upperBound = normalizeTimestamp(serverTime);

  if (!upperBound) {
    return { code: "validation_failed", ok: false };
  }

  const limit = normalizeLimit(input);
  const syncCursor = stringField(input, "syncCursor", "sync_cursor", "cursor");
  const updatedSince = stringField(input, "updatedSince", "updated_since");

  if (syncCursor) {
    const decoded = decodeCatalogSyncCursor(syncCursor, upperBound);
    const timestampCursor = normalizeTimestamp(syncCursor, {
      maxNow: upperBound,
    });

    if (!decoded && !timestampCursor) {
      return { code: "validation_failed", ok: false };
    }

    const lowerBound = decoded?.lowerBound ?? timestampCursor;

    return {
      ok: true,
      options: {
        cursorSource: "sync_cursor",
        limit,
        lowerBound,
        mode: lowerBound ? "delta" : "full_refresh",
        offsets: decoded?.offsets ?? { ...emptyOffsets },
        upperBound: decoded?.upperBound ?? upperBound,
      },
    };
  }

  if (updatedSince) {
    const lowerBound = normalizeTimestamp(updatedSince, { maxNow: upperBound });

    if (!lowerBound) {
      return { code: "validation_failed", ok: false };
    }

    return {
      ok: true,
      options: {
        cursorSource: "updated_since",
        limit,
        lowerBound,
        mode: "delta",
        offsets: { ...emptyOffsets },
        upperBound,
      },
    };
  }

  return {
    ok: true,
    options: {
      cursorSource: "none",
      limit,
      lowerBound: null,
      mode: "full_refresh",
      offsets: { ...emptyOffsets },
      upperBound,
    },
  };
}

export function catalogRangeFor(
  options: Pick<CatalogSyncOptions, "limit" | "offsets">,
  entity: CatalogSyncEntity,
) {
  const from = options.offsets[entity];

  return {
    from,
    to: from + options.limit,
  };
}

export function pageCatalogRows<T>(rows: readonly T[], limit: number) {
  return {
    hasMore: rows.length > limit,
    returned: Math.min(rows.length, limit),
    rows: rows.slice(0, limit),
  };
}

export function catalogPriceTimestampFor(timestampIso: string | null) {
  if (!timestampIso) {
    return null;
  }

  const parsed = Date.parse(timestampIso);

  if (!Number.isFinite(parsed)) {
    return timestampIso;
  }

  return new Date(parsed).toISOString().slice(0, 19).replace("T", " ");
}

export function splitCatalogTombstones<T extends { deleted_at?: string | null }>(
  rows: readonly T[],
) {
  const active: T[] = [];
  const tombstones: T[] = [];

  for (const row of rows) {
    if (row.deleted_at) {
      tombstones.push(row);
    } else {
      active.push(row);
    }
  }

  return { active, tombstones };
}

export function buildNextCatalogSyncCursor(
  options: Pick<CatalogSyncOptions, "lowerBound" | "offsets" | "upperBound">,
  pages: Record<CatalogSyncEntity, CatalogPageState>,
) {
  const hasMore = catalogEntities.some((entity) => pages[entity].hasMore);

  if (!hasMore) {
    return options.upperBound;
  }

  const offsets = { ...options.offsets };

  for (const entity of catalogEntities) {
    offsets[entity] += pages[entity].returned;
  }

  return encodeCursor({
    lowerBound: options.lowerBound,
    offsets,
    upperBound: options.upperBound,
    version: 1,
  });
}

export function hasMoreCatalogRows(
  pages: Record<CatalogSyncEntity, CatalogPageState>,
) {
  return catalogEntities.some((entity) => pages[entity].hasMore);
}

export function computeCatalogVersion(input: {
  categories: readonly TimestampRow[];
  prices: readonly PriceTimestampRow[];
  products: readonly TimestampRow[];
  suppliers: readonly TimestampRow[];
}) {
  const timestampRows = [
    ...input.categories,
    ...input.products,
    ...input.suppliers,
  ];
  const activeCount = timestampRows.filter((row) => !row.deleted_at).length;
  const tombstoneCount = timestampRows.length - activeCount;
  const timestamps = [
    ...timestampRows.map((row) => normalizeLegacyCatalogTimestamp(row.updated_at)),
    ...input.prices.map((row) => normalizeLegacyCatalogTimestamp(row.created_at)),
  ].filter((value): value is string => Boolean(value));
  const latest =
    timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ??
    "empty";
  const signature = JSON.stringify({
    categories: input.categories,
    prices: input.prices,
    products: input.products,
    suppliers: input.suppliers,
  });
  const digest = createHash("sha256").update(signature).digest("hex").slice(0, 24);

  return `catalog:v1:${latest}:${activeCount}:${tombstoneCount}:${input.prices.length}:${digest}`;
}
