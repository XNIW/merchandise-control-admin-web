import { getShopHistoryDetailModalReadModel } from "@/server/shop-admin/detail-modal-read-model";

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
