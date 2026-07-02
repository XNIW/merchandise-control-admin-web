import { parseCatalogWorkbookPreview } from "@/server/shop-admin/import-export-workbook";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import {
  guardCatalogImportExportPostRequest,
  guardCatalogImportWorkbookFile,
} from "@/server/shop-admin/import-export-route-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreJson(body: unknown, status: number) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
    status,
  });
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function requestedShopIdFromUrl(request: Request) {
  return new URL(request.url).searchParams.get("shop_id")?.trim() || undefined;
}

function statusForImportResult(code: string, ok: boolean) {
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

export async function POST(request: Request) {
  const invalidRequest = guardCatalogImportExportPostRequest(request);

  if (invalidRequest) {
    return invalidRequest;
  }

  const requestedShopId = requestedShopIdFromUrl(request);
  const context = await resolveShopActionContext(requestedShopId, "catalog.import");

  if (context.status !== "ready") {
    return noStoreJson(
      context.result,
      statusForImportResult(context.result.code, context.result.ok),
    );
  }

  const formData = await request.formData();
  const file = formData.get("workbook");

  if (!(file instanceof File)) {
    return noStoreJson({ code: "invalid_file_type", ok: false }, 400);
  }

  const invalidFile = guardCatalogImportWorkbookFile(file);

  if (invalidFile) {
    return invalidFile;
  }

  const result = await parseCatalogWorkbookPreview({
    bytes: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    defaultCategoryName: formString(formData, "defaultCategoryName") || undefined,
    defaultSupplierName: formString(formData, "defaultSupplierName") || undefined,
    importMode: formString(formData, "importMode") === "database"
      ? "database"
      : "supplier",
    mappingOverride: formString(formData, "mappingOverride") || undefined,
    mimeType: file.type,
    requestedShopId,
    rowAdjustments: formString(formData, "rowAdjustments") || undefined,
  });

  return noStoreJson(result, statusForImportResult(result.code, result.ok));
}
