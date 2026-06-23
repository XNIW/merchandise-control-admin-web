import { NextResponse } from "next/server";
import { getShopPosRevenueReadModel } from "@/server/shop-admin/pos-revenue-read-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const readModel = await getShopPosRevenueReadModel({
    month: url.searchParams.get("month"),
    requestedShopId: url.searchParams.get("shop_id"),
    year: url.searchParams.get("year"),
  });

  return NextResponse.json(readModel, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
