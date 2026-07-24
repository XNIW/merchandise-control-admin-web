import { type NextRequest, NextResponse } from "next/server";
import { resolveShopAdminDataAccess } from "@/server/shop-admin/data-access";
import { readSafeSyncEvents } from "@/server/sync-events/read-boundary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const shopId = request.nextUrl.searchParams.get("shopId")?.trim() ?? "";
  const access = await resolveShopAdminDataAccess({
    requestedShopId: shopId,
    requiredPermission: "history.read",
  });

  if (
    access.status !== "ready" ||
    access.principalKind !== "personal_account" ||
    access.selectedShop.shopId !== shopId
  ) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }

  const result = await readSafeSyncEvents(access.supabase, {
    limit: 1,
    shopId,
  });

  if (result.error) {
    return NextResponse.json({ code: result.error }, { status: 503 });
  }

  return NextResponse.json(
    { eventMarker: result.data.eventMarker },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
