import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

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
export const MAX_CATALOG_V2_CURSOR_LENGTH = 512;

const CURSOR_PREFIX = "catalog-v1:";
const CURSOR_V2_PREFIX = "catalog-v2:";
const MAX_CURSOR_LENGTH = 2_048;
const MAX_TIMESTAMP_LENGTH = 80;
const POSTGRES_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
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

// Signed v2 cursors must retain PostgreSQL's microsecond precision. Rebuilding
// these values through Date would truncate them to milliseconds and make the
// (updated_at, id) keyset repeat rows.
function validateTimestampPreservingPrecision(
  value: string,
  options: {
    maxNow?: string;
  } = {},
) {
  if (
    !value ||
    value.length > MAX_TIMESTAMP_LENGTH ||
    !POSTGRES_TIMESTAMP_PATTERN.test(value)
  ) {
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

  return value;
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

export type CatalogV2Lane = CatalogSyncEntity;

export type CatalogV2Summary = {
  activeProducts: number;
  categories: number;
  prices: number;
  products: number;
  suppliers: number;
};

export type CatalogV2WindowCounts = Record<CatalogV2Lane, number>;

export type CatalogV2Manifest = {
  catalogSummary: CatalogV2Summary;
  windowCounts: CatalogV2WindowCounts;
};

export type CatalogV2CursorState = {
  afterId: string | null;
  afterUpdatedAt: string | null;
  expiresAtUnixSeconds: number;
  lane: CatalogV2Lane;
  lowerBound: string | null;
  manifest: CatalogV2Manifest;
  mode: CatalogSyncMode;
  pageSize: number;
  revision: string;
  scopeKey: string;
  scopeKind: "legacy_owner_bridge" | "shop_scoped";
  snapshotAt: string;
};

export type CatalogV2CursorContext = {
  posSessionId: string;
  shopDeviceId: string;
  shopId: string;
  signingKey: string;
};

export type CatalogSyncRequest = {
  limit: number;
  syncCursor: string;
  updatedSince: string;
};

export type ResolvedCatalogSyncRequest = {
  continuation: CatalogV2CursorState | null;
  cursorSource: "none" | "sync_cursor" | "updated_since";
  limit: number;
  lowerBound: string | null;
  mode: CatalogSyncMode;
  snapshotAt: string | null;
};

type CatalogCursorV2Payload = {
  a: string;
  e: "c" | "p" | "r" | "s";
  i: string | null;
  k: "l" | "s";
  l: string | null;
  m: "d" | "f";
  q: string;
  r: string;
  t: string | null;
  u: string;
  v: 2;
  w: string;
  x: string;
  z: string;
};

const laneToWire: Record<CatalogV2Lane, CatalogCursorV2Payload["e"]> = {
  categories: "c",
  prices: "r",
  products: "p",
  suppliers: "s",
};

const wireToLane: Record<CatalogCursorV2Payload["e"], CatalogV2Lane> = {
  c: "categories",
  p: "products",
  r: "prices",
  s: "suppliers",
};

// PostgreSQL's uuid type accepts every canonical 128-bit value; catalog row
// keys must therefore not be restricted to RFC versions 1-5 or one variant.
const POSTGRES_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION_PATTERN = /^[0-9]{1,19}$/;
const SCOPE_KEY_PATTERN = /^[0-9a-f]{32}$/;
const BASE36_PATTERN = /^(?:0|[1-9a-z][0-9a-z]*)$/;
const COMPACT_128_BIT_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const MAX_POSTGRES_BIGINT = BigInt("9223372036854775807");

function isSafeCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function encodeSafeInteger(value: number) {
  if (!isSafeCount(value)) {
    throw new Error("catalog_v2_cursor_integer_invalid");
  }

  return value.toString(36);
}

function decodeSafeInteger(value: unknown) {
  if (typeof value !== "string" || !BASE36_PATTERN.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 36);

  return isSafeCount(parsed) && parsed.toString(36) === value ? parsed : null;
}

function encodeCountTuple(values: readonly number[]) {
  return values.map(encodeSafeInteger).join(".");
}

function parseCountTuple(value: unknown, expectedLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const values = value.split(".");

  if (values.length !== expectedLength) {
    return null;
  }

  const parsed = values.map(decodeSafeInteger);

  return parsed.every((item): item is number => item !== null) ? parsed : null;
}

function encodeRevision(value: string) {
  if (!REVISION_PATTERN.test(value)) {
    throw new Error("catalog_v2_cursor_revision_invalid");
  }

  const revision = BigInt(value);

  if (revision > MAX_POSTGRES_BIGINT) {
    throw new Error("catalog_v2_cursor_revision_invalid");
  }

  return revision.toString(36);
}

function decodeBase36BigInt(value: unknown) {
  if (typeof value !== "string" || !BASE36_PATTERN.test(value)) {
    return null;
  }

  let parsed = BigInt(0);

  for (const character of value) {
    const digit = Number.parseInt(character, 36);
    parsed = parsed * BigInt(36) + BigInt(digit);
  }

  return parsed.toString(36) === value ? parsed : null;
}

function decodeRevision(value: unknown) {
  const revision = decodeBase36BigInt(value);

  return revision !== null && revision <= MAX_POSTGRES_BIGINT
    ? revision.toString(10)
    : null;
}

function encodeCompact128BitHex(value: string, pattern: RegExp) {
  if (!pattern.test(value)) {
    throw new Error("catalog_v2_cursor_identity_invalid");
  }

  const bytes = Buffer.from(value.replaceAll("-", ""), "hex");

  if (bytes.length !== 16) {
    throw new Error("catalog_v2_cursor_identity_invalid");
  }

  return bytes.toString("base64url");
}

function decodeCompact128BitHex(value: unknown) {
  if (typeof value !== "string" || !COMPACT_128_BIT_PATTERN.test(value)) {
    return null;
  }

  const bytes = Buffer.from(value, "base64url");

  if (bytes.length !== 16 || bytes.toString("base64url") !== value) {
    return null;
  }

  return bytes.toString("hex");
}

function encodeCompactUuid(value: string) {
  return encodeCompact128BitHex(value, POSTGRES_UUID_PATTERN);
}

function decodeCompactUuid(value: unknown) {
  const hex = decodeCompact128BitHex(value);

  if (!hex) {
    return null;
  }

  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");

  return POSTGRES_UUID_PATTERN.test(uuid) ? uuid : null;
}

function encodeCompactScopeKey(value: string) {
  return encodeCompact128BitHex(value, SCOPE_KEY_PATTERN);
}

function decodeCompactScopeKey(value: unknown) {
  const scopeKey = decodeCompact128BitHex(value);
  return scopeKey && SCOPE_KEY_PATTERN.test(scopeKey) ? scopeKey : null;
}

function encodeCompactTimestamp(value: string) {
  const validated = validateTimestampPreservingPrecision(value);
  const match = validated?.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/,
  );

  if (!validated || !match) {
    throw new Error("catalog_v2_cursor_timestamp_invalid");
  }

  const localSecond = Date.parse(`${match[1]}T${match[2]}Z`);
  const offsetMinutes =
    match[4] === "Z"
      ? 0
      : (match[5] === "+" ? 1 : -1) *
        (Number(match[6]) * 60 + Number(match[7]));
  const fractionalMicros = (match[3] ?? "").padEnd(6, "0");

  if (!Number.isFinite(localSecond) || Math.abs(offsetMinutes) > 23 * 60 + 59) {
    throw new Error("catalog_v2_cursor_timestamp_invalid");
  }

  const epochMicros =
    BigInt(localSecond - offsetMinutes * 60_000) * BigInt(1_000) +
    BigInt(fractionalMicros || "0");

  return epochMicros < BigInt(0)
    ? `-${(-epochMicros).toString(36)}`
    : epochMicros.toString(36);
}

function decodeCompactTimestamp(
  value: unknown,
  options: { maxNow?: string } = {},
) {
  if (
    typeof value !== "string" ||
    !/^-?(?:0|[1-9a-z][0-9a-z]*)$/.test(value)
  ) {
    return null;
  }

  const negative = value.startsWith("-");
  const magnitude = decodeBase36BigInt(negative ? value.slice(1) : value);

  if (magnitude === null) {
    return null;
  }

  const epochMicros = negative ? -magnitude : magnitude;
  const microsPerSecond = BigInt(1_000_000);
  let epochSeconds = epochMicros / microsPerSecond;
  let fractionalMicros = epochMicros % microsPerSecond;

  if (fractionalMicros < BigInt(0)) {
    epochSeconds -= BigInt(1);
    fractionalMicros += microsPerSecond;
  }

  const epochMilliseconds = Number(epochSeconds) * 1_000;

  if (!Number.isSafeInteger(epochMilliseconds)) {
    return null;
  }

  const date = new Date(epochMilliseconds);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const timestamp = `${date.toISOString().slice(0, 19)}.${fractionalMicros
    .toString(10)
    .padStart(6, "0")}Z`;

  return validateTimestampPreservingPrecision(timestamp, options);
}

export function catalogV2TimestampsEqual(left: string, right: string) {
  try {
    return encodeCompactTimestamp(left) === encodeCompactTimestamp(right);
  } catch {
    return false;
  }
}

function cursorBinding(context: CatalogV2CursorContext) {
  return [context.posSessionId, context.shopDeviceId, context.shopId].join("\n");
}

function cursorSignature(
  encodedPayload: string,
  context: CatalogV2CursorContext,
) {
  return createHmac("sha256", context.signingKey)
    .update(`${cursorBinding(context)}\n${encodedPayload}`, "utf8")
    .digest("base64url");
}

function catalogV2PayloadFor(
  state: CatalogV2CursorState,
): CatalogCursorV2Payload {
  return {
    a: encodeCountTuple([
      state.manifest.catalogSummary.products,
      state.manifest.catalogSummary.activeProducts,
      state.manifest.catalogSummary.categories,
      state.manifest.catalogSummary.suppliers,
      state.manifest.catalogSummary.prices,
    ]),
    e: laneToWire[state.lane],
    i: state.afterId === null ? null : encodeCompactUuid(state.afterId),
    k: state.scopeKind === "shop_scoped" ? "s" : "l",
    l:
      state.lowerBound === null
        ? null
        : encodeCompactTimestamp(state.lowerBound),
    m: state.mode === "full_refresh" ? "f" : "d",
    q: encodeCompactScopeKey(state.scopeKey),
    r: encodeRevision(state.revision),
    t:
      state.afterUpdatedAt === null
        ? null
        : encodeCompactTimestamp(state.afterUpdatedAt),
    u: encodeCompactTimestamp(state.snapshotAt),
    v: 2,
    w: encodeCountTuple([
      state.manifest.windowCounts.categories,
      state.manifest.windowCounts.suppliers,
      state.manifest.windowCounts.products,
      state.manifest.windowCounts.prices,
    ]),
    x: encodeSafeInteger(state.expiresAtUnixSeconds),
    z: encodeSafeInteger(state.pageSize),
  };
}

export function buildCatalogV2Cursor(
  state: CatalogV2CursorState,
  context: CatalogV2CursorContext,
) {
  const payload = catalogV2PayloadFor(state);
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const cursor = `${CURSOR_V2_PREFIX}${encodedPayload}.${cursorSignature(
    encodedPayload,
    context,
  )}`;

  if (cursor.length > MAX_CATALOG_V2_CURSOR_LENGTH) {
    throw new Error("catalog_v2_cursor_too_long");
  }

  return cursor;
}

export function decodeCatalogV2Cursor(
  value: string,
  serverTime: string,
  context: CatalogV2CursorContext,
):
  | { code: "catalog_cursor_expired" | "catalog_cursor_rejected"; ok: false }
  | { ok: true; state: CatalogV2CursorState } {
  if (
    !value.startsWith(CURSOR_V2_PREFIX) ||
    value.length > MAX_CATALOG_V2_CURSOR_LENGTH ||
    !context.signingKey
  ) {
    return { code: "catalog_cursor_rejected", ok: false };
  }

  const separator = value.lastIndexOf(".");

  if (separator <= CURSOR_V2_PREFIX.length) {
    return { code: "catalog_cursor_rejected", ok: false };
  }

  const encodedPayload = value.slice(CURSOR_V2_PREFIX.length, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = cursorSignature(encodedPayload, context);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return { code: "catalog_cursor_rejected", ok: false };
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;

    if (!isRecord(payload) || payload.v !== 2) {
      return { code: "catalog_cursor_rejected", ok: false };
    }

    const summary = parseCountTuple(payload.a, 5);
    const windows = parseCountTuple(payload.w, 4);
    const snapshotAt = decodeCompactTimestamp(payload.u, {
      maxNow: serverTime,
    });
    const lowerBound =
      payload.l === null
        ? null
        : decodeCompactTimestamp(payload.l, { maxNow: serverTime });
    const afterUpdatedAt =
      payload.t === null
        ? null
        : decodeCompactTimestamp(payload.t, { maxNow: serverTime });
    const afterId = payload.i === null ? null : decodeCompactUuid(payload.i);
    const scopeKey = decodeCompactScopeKey(payload.q);
    const revision = decodeRevision(payload.r);
    const lane =
      typeof payload.e === "string" && payload.e in wireToLane
        ? wireToLane[payload.e as CatalogCursorV2Payload["e"]]
        : null;
    const expiresAtUnixSeconds = decodeSafeInteger(payload.x);
    const pageSize = decodeSafeInteger(payload.z);
    const nowUnixSeconds = Math.floor(Date.parse(serverTime) / 1000);

    if (
      !summary ||
      !windows ||
      !snapshotAt ||
      !lane ||
      (payload.l !== null && !lowerBound) ||
      (payload.t !== null && !afterUpdatedAt) ||
      (afterUpdatedAt === null) !== (afterId === null) ||
      (payload.i !== null && !afterId) ||
      !scopeKey ||
      !revision ||
      (payload.k !== "s" && payload.k !== "l") ||
      (payload.m !== "f" && payload.m !== "d") ||
      pageSize === null ||
      pageSize < 1 ||
      pageSize > MAX_CATALOG_SYNC_LIMIT ||
      expiresAtUnixSeconds === null ||
      expiresAtUnixSeconds <= 0 ||
      (payload.m === "d" && !lowerBound) ||
      (lowerBound && Date.parse(lowerBound) > Date.parse(snapshotAt))
    ) {
      return { code: "catalog_cursor_rejected", ok: false };
    }

    if (expiresAtUnixSeconds <= nowUnixSeconds) {
      return { code: "catalog_cursor_expired", ok: false };
    }

    return {
      ok: true,
      state: {
        afterId,
        afterUpdatedAt,
        expiresAtUnixSeconds,
        lane,
        lowerBound,
        manifest: {
          catalogSummary: {
            activeProducts: summary[1],
            categories: summary[2],
            prices: summary[4],
            products: summary[0],
            suppliers: summary[3],
          },
          windowCounts: {
            categories: windows[0],
            prices: windows[3],
            products: windows[2],
            suppliers: windows[1],
          },
        },
        mode: payload.m === "f" ? "full_refresh" : "delta",
        pageSize,
        revision,
        scopeKey,
        scopeKind: payload.k === "s" ? "shop_scoped" : "legacy_owner_bridge",
        snapshotAt,
      },
    };
  } catch {
    return { code: "catalog_cursor_rejected", ok: false };
  }
}

export function parseCatalogSyncRequest(input: unknown): CatalogSyncRequest | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    limit: normalizeLimit(input),
    syncCursor: stringField(input, "syncCursor", "sync_cursor", "cursor"),
    updatedSince: stringField(input, "updatedSince", "updated_since"),
  };
}

export function resolveCatalogSyncRequest(
  request: CatalogSyncRequest,
  serverTime: string,
  context: CatalogV2CursorContext,
):
  | {
      code:
        | "catalog_cursor_expired"
        | "catalog_cursor_rejected"
        | "validation_failed";
      ok: false;
    }
  | { ok: true; request: ResolvedCatalogSyncRequest } {
  const normalizedServerTime = normalizeTimestamp(serverTime);

  if (!normalizedServerTime) {
    return { code: "validation_failed", ok: false };
  }

  if (request.syncCursor.startsWith(CURSOR_V2_PREFIX)) {
    const decoded = decodeCatalogV2Cursor(
      request.syncCursor,
      normalizedServerTime,
      context,
    );

    if (!decoded.ok) {
      return decoded;
    }

    if (request.limit !== decoded.state.pageSize) {
      return { code: "catalog_cursor_rejected", ok: false };
    }

    return {
      ok: true,
      request: {
        continuation: decoded.state,
        cursorSource: "sync_cursor",
        limit: decoded.state.pageSize,
        lowerBound: decoded.state.lowerBound,
        mode: decoded.state.mode,
        snapshotAt: decoded.state.snapshotAt,
      },
    };
  }

  if (request.syncCursor.startsWith(CURSOR_PREFIX)) {
    return { code: "catalog_cursor_rejected", ok: false };
  }

  if (request.syncCursor) {
    const timestampCursor = normalizeTimestamp(request.syncCursor, {
      maxNow: normalizedServerTime,
    });

    if (!timestampCursor) {
      return { code: "validation_failed", ok: false };
    }

    return {
      ok: true,
      request: {
        continuation: null,
        cursorSource: "sync_cursor",
        limit: request.limit,
        lowerBound: timestampCursor,
        mode: "delta",
        snapshotAt: null,
      },
    };
  }

  if (request.updatedSince) {
    const lowerBound = normalizeTimestamp(request.updatedSince, {
      maxNow: normalizedServerTime,
    });

    if (!lowerBound) {
      return { code: "validation_failed", ok: false };
    }

    return {
      ok: true,
      request: {
        continuation: null,
        cursorSource: "updated_since",
        limit: request.limit,
        lowerBound,
        mode: "delta",
        snapshotAt: null,
      },
    };
  }

  return {
    ok: true,
    request: {
      continuation: null,
      cursorSource: "none",
      limit: request.limit,
      lowerBound: null,
      mode: "full_refresh",
      snapshotAt: null,
    },
  };
}

export function nextCatalogV2Lane(
  lane: CatalogV2Lane,
  counts: CatalogV2WindowCounts,
) {
  const lanes: readonly CatalogV2Lane[] = [
    "categories",
    "suppliers",
    "products",
    "prices",
  ];
  const index = lanes.indexOf(lane);

  for (let next = index + 1; next < lanes.length; next += 1) {
    const candidate = lanes[next];

    if (counts[candidate] > 0) {
      return candidate;
    }
  }

  return null;
}

export function pageCatalogRowsByKeyset<
  T extends { id: string; updated_at: string },
>(rows: readonly T[], after: { id: string; updatedAt: string } | null, limit: number) {
  const sorted = [...rows].sort((left, right) => {
    const timestampMilliseconds =
      Date.parse(left.updated_at) - Date.parse(right.updated_at);
    const timestamp =
      timestampMilliseconds === 0 && left.updated_at !== right.updated_at
        ? left.updated_at.localeCompare(right.updated_at)
        : timestampMilliseconds;
    return timestamp === 0 ? left.id.localeCompare(right.id) : timestamp;
  });
  const filtered = after
    ? sorted.filter(
        (row) => {
          const timestampMilliseconds =
            Date.parse(row.updated_at) - Date.parse(after.updatedAt);
          const timestamp =
            timestampMilliseconds === 0 && row.updated_at !== after.updatedAt
              ? row.updated_at.localeCompare(after.updatedAt)
              : timestampMilliseconds;

          return (
            timestamp > 0 ||
            (timestamp === 0 && row.id.localeCompare(after.id) > 0)
          );
        },
      )
    : sorted;
  const candidates = filtered.slice(0, limit + 1);

  return {
    hasMore: candidates.length > limit,
    rows: candidates.slice(0, limit),
  };
}
