import { buildCatalogImportTemplate } from "@/server/shop-admin/import-export-workbook";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await buildCatalogImportTemplate();

  if (!result.ok || !result.buffer) {
    return Response.json(result, { status: 400 });
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Type": result.contentType ?? "application/octet-stream",
    },
  });
}
