import { applyCatalogWorkbookImport } from "@/server/shop-admin/import-export-workbook";
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

export async function POST(request: Request) {
  const invalidRequest = guardCatalogImportExportPostRequest(request);

  if (invalidRequest) {
    return invalidRequest;
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

  const result = await applyCatalogWorkbookImport({
    bytes: Buffer.from(await file.arrayBuffer()),
    confirmApply: formString(formData, "confirmApply"),
    fileName: file.name,
    importMode: formString(formData, "importMode") === "database"
      ? "database"
      : "supplier",
    mimeType: file.type,
    previewDigest: formString(formData, "previewDigest"),
    requestedShopId: formString(formData, "shop_id") || undefined,
    rowAdjustments: formString(formData, "rowAdjustments"),
  });

  return noStoreJson(result, result.ok ? 200 : 400);
}
