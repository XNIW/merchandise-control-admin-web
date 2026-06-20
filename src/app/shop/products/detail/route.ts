import { getShopProductDetailModalReadModel } from "@/server/shop-admin/detail-modal-read-model";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id")?.trim() ?? "";

  if (!productId || productId.length > 160) {
    return noStoreJson(
      {
        product: null,
        reason: "Product id is required.",
        status: "not_found",
      },
      400,
    );
  }

  const readModel = await getShopProductDetailModalReadModel({
    productId,
    requestedShopId: url.searchParams.get("shop_id"),
  });

  return noStoreJson(readModel, readModel.status === "ready" ? 200 : 404);
}
