import { getShopHistoryDetailModalReadModel } from "@/server/shop-admin/detail-modal-read-model";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import {
  updateHistoryEntryGeneratedRows,
  type HistoryEntryGeneratedRowPatch,
} from "@/server/shop-admin/history-mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_HISTORY_DETAIL_PATCH_JSON_BYTES = 64 * 1024;

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
    status,
  });
}

function statusForHistoryPatchResult(code: string, ok: boolean) {
  if (ok) {
    return 200;
  }

  if (code === "session_expired" || code === "no_active_session") {
    return 401;
  }

  if (code === "permission_denied" || code === "unauthorized") {
    return 403;
  }

  return 400;
}

function invalidHistoryPatchRequest(requestCode: string, status: number) {
  return noStoreJson(
    {
      result: {
        code: "validation_failed",
        message: "Invalid history detail patch request.",
        ok: false,
      },
      requestCode,
      status: "validation_failed",
    },
    status,
  );
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function requestHost(request: Request) {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = firstHeaderValue(request.headers.get("host"));

  return forwardedHost ?? host ?? new URL(request.url).host;
}

function parseContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function isSameOriginRequest(request: Request) {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();

  if (secFetchSite === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === requestHost(request);
  } catch {
    return false;
  }
}

function isJsonContentType(contentType: string | null) {
  return contentType?.toLowerCase().startsWith("application/json") ?? false;
}

function guardHistoryDetailPatchRequest(request: Request) {
  if (!isSameOriginRequest(request)) {
    return invalidHistoryPatchRequest("invalid_origin", 403);
  }

  if (!isJsonContentType(request.headers.get("content-type"))) {
    return invalidHistoryPatchRequest("invalid_content_type", 415);
  }

  const contentLength = parseContentLength(request.headers.get("content-length"));

  if (
    contentLength === null ||
    Number.isNaN(contentLength) ||
    contentLength > MAX_HISTORY_DETAIL_PATCH_JSON_BYTES
  ) {
    return invalidHistoryPatchRequest(
      contentLength !== null && contentLength > MAX_HISTORY_DETAIL_PATCH_JSON_BYTES
        ? "request_body_too_large"
        : "invalid_request_body",
      413,
    );
  }

  return null;
}

function remoteIdFromEntryId(value: string) {
  const trimmed = value.trim();

  return trimmed.startsWith("session:") ? trimmed.slice("session:".length) : trimmed;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function patchRowsFromBody(value: unknown): HistoryEntryGeneratedRowPatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => {
    const record =
      row && typeof row === "object" ? (row as Record<string, unknown>) : {};

    return {
      complete: optionalBoolean(record.complete),
      countedQuantity: optionalString(record.countedQuantity),
      expectedUpdatedAt: optionalString(record.expectedUpdatedAt),
      quantity: optionalString(record.quantity),
      retailPrice: optionalString(record.retailPrice),
      rowIndex:
        typeof record.rowIndex === "number" && Number.isInteger(record.rowIndex)
          ? record.rowIndex
          : undefined,
      rowKey: optionalString(record.rowKey),
      salePrice: optionalString(record.salePrice),
    };
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entry_id")?.trim() ?? "";

  if (!entryId || entryId.length > 220) {
    return noStoreJson(
      {
        detail: null,
        reason: "History entry id is required.",
        status: "invalid_entry",
      },
      400,
    );
  }

  const readModel = await getShopHistoryDetailModalReadModel({
    entryId,
    requestedShopId: url.searchParams.get("shop_id"),
  });

  return noStoreJson(readModel, readModel.status === "ready" ? 200 : 404);
}

export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entry_id")?.trim() ?? "";
  const requestedShopId = url.searchParams.get("shop_id")?.trim() || undefined;

  if (!entryId || entryId.length > 220) {
    return noStoreJson(
      {
        result: {
          code: "validation_failed",
          message: "History entry id is required.",
          ok: false,
        },
        status: "invalid_entry",
      },
      400,
    );
  }

  const invalidRequest = guardHistoryDetailPatchRequest(request);

  if (invalidRequest) {
    return invalidRequest;
  }

  const context = await resolveShopActionContext(requestedShopId, "history.write");

  if (context.status !== "ready") {
    return noStoreJson(
      context.result,
      statusForHistoryPatchResult(context.result.code, context.result.ok),
    );
  }

  let body: Record<string, unknown>;

  try {
    const bodyText = await request.text();
    const bodyBytes = new TextEncoder().encode(bodyText).byteLength;

    if (bodyBytes > MAX_HISTORY_DETAIL_PATCH_JSON_BYTES) {
      return invalidHistoryPatchRequest("request_body_too_large", 413);
    }

    const parsed = JSON.parse(bodyText) as unknown;
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return invalidHistoryPatchRequest("invalid_json", 400);
  }

  const result = await updateHistoryEntryGeneratedRows({
    expectedUpdatedAt: optionalString(body.expectedUpdatedAt),
    remoteId: optionalString(body.remoteId) ?? remoteIdFromEntryId(entryId),
    requestedShopId:
      requestedShopId ??
      optionalString(body.shopId) ??
      optionalString(body.shop_id),
    rows: patchRowsFromBody(body.rows),
  });

  return noStoreJson(
    { result, status: result.ok ? "ready" : result.code },
    result.ok ? 200 : result.code === "conflict" ? 409 : 400,
  );
}
