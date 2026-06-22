import { getShopInventoryProductsPage } from "@/server/shop-admin/inventory-read-model";

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

function normalizedParam(url: URL, key: string) {
  const value = url.searchParams.get(key)?.trim();

  return value ? value : "";
}

function normalizeState(value: string) {
  return value === "archived" || value === "all" ? value : "active";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = normalizedParam(url, "q").replace(/\s+/g, " ").slice(0, 120);

  if (query.length < 2) {
    return noStoreJson([]);
  }

  const page = await getShopInventoryProductsPage({
    filters: {
      categoryId: normalizedParam(url, "category"),
      query,
      state: normalizeState(normalizedParam(url, "state")),
      supplierId: normalizedParam(url, "supplier"),
    },
    includeExactTotals: false,
    page: 1,
    pageSize: 10,
    requestedShopId: normalizedParam(url, "shop_id"),
  });

  if (page.status !== "ready") {
    return noStoreJson([]);
  }

  return noStoreJson(
    page.products.slice(0, 8).map((product) => ({
      barcode: product.barcode,
      itemNumber: product.itemNumber,
      productId: product.productId,
      productName: product.productName,
      purchasePrice: product.purchasePrice,
      retailPrice: product.retailPrice,
      searchValue:
        product.productName ??
        product.secondProductName ??
        product.itemNumber ??
        product.barcode,
      secondProductName: product.secondProductName,
      stockQuantity: product.stockQuantity,
    })),
  );
}
