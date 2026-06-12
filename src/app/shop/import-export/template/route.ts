import { buildCatalogImportTemplate } from "@/server/shop-admin/import-export-workbook";

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

export async function GET() {
  const result = await buildCatalogImportTemplate();

  if (!result.ok || !result.buffer) {
    return noStoreJson(result, 400);
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Type": result.contentType ?? "application/octet-stream",
    },
  });
}
