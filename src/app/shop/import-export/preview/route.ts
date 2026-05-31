import { parseCatalogWorkbookPreview } from "@/server/shop-admin/import-export-workbook";

export const dynamic = "force-dynamic";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
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
