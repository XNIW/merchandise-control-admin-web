import { getShopHistoryDetailModalReadModel } from "@/server/shop-admin/detail-modal-read-model";
import {
  updateHistoryEntryGeneratedRows,
  type HistoryEntryGeneratedRowPatch,
} from "@/server/shop-admin/history-mutations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
    status,
  });
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

  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    body = {};
  }

  const result = await updateHistoryEntryGeneratedRows({
    expectedUpdatedAt: optionalString(body.expectedUpdatedAt),
    remoteId: optionalString(body.remoteId) ?? remoteIdFromEntryId(entryId),
    requestedShopId:
      url.searchParams.get("shop_id") ??
      optionalString(body.shopId) ??
      optionalString(body.shop_id),
    rows: patchRowsFromBody(body.rows),
  });

  return noStoreJson(
    { result, status: result.ok ? "ready" : result.code },
    result.ok ? 200 : result.code === "conflict" ? 409 : 400,
  );
}
