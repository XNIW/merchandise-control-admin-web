import { buildCatalogWorkbookExport } from "@/server/shop-admin/import-export-workbook";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await buildCatalogWorkbookExport(
    url.searchParams.get("shop_id") ?? undefined,
  );

  if (!result.ok || !result.buffer) {
    return Response.json(result, { status: 400 });
  }

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Type": result.contentType ?? "application/octet-stream",
    },
  });
}
