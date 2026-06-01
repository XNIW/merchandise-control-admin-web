import { parseCatalogWorkbookPreview } from "@/server/shop-admin/import-export-workbook";
import { MAX_IMPORT_BYTES } from "@/server/shop-admin/import-export-readiness";

export const dynamic = "force-dynamic";

function requestBodyTooLarge(request: Request) {
  const contentLength = request.headers.get("content-length");
  const bytes = contentLength ? Number(contentLength) : 0;

  return Number.isFinite(bytes) && bytes > MAX_IMPORT_BYTES;
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  if (requestBodyTooLarge(request)) {
    return Response.json(
      {
        code: "file_too_large",
        message: "The workbook is larger than the allowed import limit.",
        ok: false,
      },
      { status: 413 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("workbook");

  if (!(file instanceof File)) {
    return Response.json({ code: "invalid_file_type", ok: false }, { status: 400 });
  }

  const result = await parseCatalogWorkbookPreview({
    bytes: Buffer.from(await file.arrayBuffer()),
    fileName: file.name,
    mimeType: file.type,
    requestedShopId: formString(formData, "shop_id") || undefined,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
