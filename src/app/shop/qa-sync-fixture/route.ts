import { NextResponse, type NextRequest } from "next/server";
import {
  archiveProduct,
  createCategory,
  createProduct,
  createSupplier,
  updateCategory,
  updateProduct,
  updateSupplier,
} from "@/server/shop-admin/catalog-mutations";
import {
  createHistoryEntry,
  tombstoneHistoryEntry,
  updateHistoryEntry,
} from "@/server/shop-admin/history-mutations";
import type { ShopAdminActionResult } from "@/server/shop-admin/action-context";

export const dynamic = "force-dynamic";

const allowedHosts = new Set([
  "localhost:3000",
  "127.0.0.1:3000",
  "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev",
]);

type StepResult = {
  code: string;
  elapsedMs: number;
  ok: boolean;
  targetId?: string;
};
type FixturePart = "all" | "history" | "lookups" | "products";

function isAllowedHost(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  return allowedHosts.has(host);
}

function cleanPrefix(value: string | null) {
  const prefix = value?.trim() ?? "";
  const allowedPrefix =
    prefix.startsWith("SYNC_TEST_") || prefix.startsWith("SYNC_PERF_");

  if (
    allowedPrefix &&
    prefix.endsWith("_") &&
    prefix.length >= 16 &&
    prefix.length <= 96 &&
    /^[A-Z0-9_]+$/.test(prefix)
  ) {
    return prefix;
  }

  return null;
}

function cleanPart(value: string | null): FixturePart | null {
  const part = value?.trim() || "all";

  return part === "all" || part === "history" || part === "lookups" || part === "products"
    ? part
    : null;
}

function requireTargetId(result: ShopAdminActionResult, step: string) {
  if (!result.targetId) {
    throw new Error(`${step}:missing_target_id`);
  }

  return result.targetId;
}

async function runStep(
  name: string,
  steps: Record<string, StepResult>,
  action: () => Promise<ShopAdminActionResult>,
) {
  const startedAt = Date.now();
  const result = await action();

  steps[name] = {
    code: result.code,
    elapsedMs: Date.now() - startedAt,
    ok: result.ok,
    targetId: result.targetId,
  };

  if (!result.ok) {
    throw new Error(`${name}:${result.code}`);
  }

  return result;
}

function rowsText(prefix: string, suffix: string) {
  return ["barcode,count", `${prefix}${suffix},1`].join("\n");
}

async function runLookupFixture(input: {
  prefix: string;
  requestedShopId?: string;
  steps: Record<string, StepResult>;
}) {
  const standaloneSupplier = await runStep("supplier_create", input.steps, () =>
    createSupplier({
      name: `${input.prefix}SUPPLIER_UPDATE_INITIAL`,
      requestedShopId: input.requestedShopId,
    }),
  );
  await runStep("supplier_update", input.steps, () =>
    updateSupplier({
      id: requireTargetId(standaloneSupplier, "supplier_create"),
      name: `${input.prefix}SUPPLIER_UPDATE_FINAL`,
      requestedShopId: input.requestedShopId,
    }),
  );

  const standaloneCategory = await runStep("category_create", input.steps, () =>
    createCategory({
      name: `${input.prefix}CATEGORY_UPDATE_INITIAL`,
      requestedShopId: input.requestedShopId,
    }),
  );
  await runStep("category_update", input.steps, () =>
    updateCategory({
      id: requireTargetId(standaloneCategory, "category_create"),
      name: `${input.prefix}CATEGORY_UPDATE_FINAL`,
      requestedShopId: input.requestedShopId,
    }),
  );
}

async function runProductFixture(input: {
  prefix: string;
  requestedShopId?: string;
  steps: Record<string, StepResult>;
}) {
  const productSupplier = `${input.prefix}PRODUCT_SUPPLIER`;
  const productCategory = `${input.prefix}PRODUCT_CATEGORY`;
  const productSupplierResult = await runStep("product_supplier_create", input.steps, () =>
    createSupplier({
      name: productSupplier,
      requestedShopId: input.requestedShopId,
    }),
  );
  const productCategoryResult = await runStep("product_category_create", input.steps, () =>
    createCategory({
      name: productCategory,
      requestedShopId: input.requestedShopId,
    }),
  );
  const supplierId = requireTargetId(productSupplierResult, "product_supplier_create");
  const categoryId = requireTargetId(productCategoryResult, "product_category_create");

  await runStep("product_create", input.steps, () =>
    createProduct({
      barcode: `${input.prefix}PRODUCT_CREATE`,
      categoryId,
      productName: `${input.prefix}PRODUCT_CREATE_NAME`,
      purchasePrice: 11,
      requestedShopId: input.requestedShopId,
      retailPrice: 15,
      stockQuantity: 3,
      supplierId,
    }),
  );

  const productForUpdate = await runStep("product_update_seed", input.steps, () =>
    createProduct({
      barcode: `${input.prefix}PRODUCT_UPDATE`,
      categoryId,
      productName: `${input.prefix}PRODUCT_UPDATE_INITIAL_NAME`,
      purchasePrice: 21,
      requestedShopId: input.requestedShopId,
      retailPrice: 25,
      stockQuantity: 4,
      supplierId,
    }),
  );
  await runStep("product_update", input.steps, () =>
    updateProduct({
      barcode: `${input.prefix}PRODUCT_UPDATE`,
      categoryId,
      productId: requireTargetId(productForUpdate, "product_update_seed"),
      productName: `${input.prefix}PRODUCT_UPDATE_FINAL_NAME`,
      purchasePrice: 22,
      requestedShopId: input.requestedShopId,
      retailPrice: 26,
      stockQuantity: 6,
      supplierId,
    }),
  );

  const productForTombstone = await runStep("product_tombstone_seed", input.steps, () =>
    createProduct({
      barcode: `${input.prefix}PRODUCT_TOMBSTONE`,
      categoryId,
      productName: `${input.prefix}PRODUCT_TOMBSTONE_NAME`,
      purchasePrice: 31,
      requestedShopId: input.requestedShopId,
      retailPrice: 35,
      stockQuantity: 5,
      supplierId,
    }),
  );
  await runStep("product_tombstone", input.steps, () =>
    archiveProduct({
      id: requireTargetId(productForTombstone, "product_tombstone_seed"),
      reason: "SYNC_TEST staging QA tombstone",
      requestedShopId: input.requestedShopId,
    }),
  );
}

async function runHistoryFixture(input: {
  prefix: string;
  requestedShopId?: string;
  steps: Record<string, StepResult>;
}) {
  const productSupplier = `${input.prefix}PRODUCT_SUPPLIER`;
  const productCategory = `${input.prefix}PRODUCT_CATEGORY`;

  await runStep("history_create", input.steps, () =>
    createHistoryEntry({
      category: productCategory,
      completeRows: true,
      displayName: `${input.prefix}HISTORY_CREATE`,
      requestedShopId: input.requestedShopId,
      rowsText: rowsText(input.prefix, "HISTORY_CREATE"),
      supplier: productSupplier,
    }),
  );

  const historyForUpdate = await runStep("history_update_seed", input.steps, () =>
    createHistoryEntry({
      category: productCategory,
      completeRows: true,
      displayName: `${input.prefix}HISTORY_UPDATE_INITIAL`,
      requestedShopId: input.requestedShopId,
      rowsText: rowsText(input.prefix, "HISTORY_UPDATE_INITIAL"),
      supplier: productSupplier,
    }),
  );
  await runStep("history_update", input.steps, () =>
    updateHistoryEntry({
      category: productCategory,
      completeRows: true,
      displayName: `${input.prefix}HISTORY_UPDATE_FINAL`,
      remoteId: requireTargetId(historyForUpdate, "history_update_seed"),
      requestedShopId: input.requestedShopId,
      rowsText: rowsText(input.prefix, "HISTORY_UPDATE_FINAL"),
      supplier: productSupplier,
    }),
  );

  const historyForTombstone = await runStep("history_tombstone_seed", input.steps, () =>
    createHistoryEntry({
      category: productCategory,
      completeRows: true,
      displayName: `${input.prefix}HISTORY_TOMBSTONE`,
      requestedShopId: input.requestedShopId,
      rowsText: rowsText(input.prefix, "HISTORY_TOMBSTONE"),
      supplier: productSupplier,
    }),
  );
  await runStep("history_tombstone", input.steps, () =>
    tombstoneHistoryEntry({
      reason: "SYNC_TEST staging QA tombstone",
      remoteId: requireTargetId(historyForTombstone, "history_tombstone_seed"),
      requestedShopId: input.requestedShopId,
    }),
  );
}

export async function GET(request: NextRequest) {
  if (!isAllowedHost(request)) {
    return new NextResponse(null, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const prefix = cleanPrefix(searchParams.get("prefix"));
  const part = cleanPart(searchParams.get("part"));
  const confirm = searchParams.get("confirm");
  const requestedShopId = searchParams.get("shop_id") ?? undefined;

  if (!prefix || !part || confirm !== "staging-sync-qa") {
    return NextResponse.json(
      { ok: false, code: "validation_failed" },
      { status: 400 },
    );
  }

  const steps: Record<string, StepResult> = {};
  const startedAt = Date.now();
  const correlationId = `${prefix}${part}`;

  try {
    if (part === "all" || part === "lookups") {
      await runLookupFixture({ prefix, requestedShopId, steps });
    }

    if (part === "all" || part === "products") {
      await runProductFixture({ prefix, requestedShopId, steps });
    }

    if (part === "all" || part === "history") {
      await runHistoryFixture({ prefix, requestedShopId, steps });
    }

    return NextResponse.json({
      ok: true,
      code: "success",
      correlationId,
      part,
      prefix,
      steps,
      totalElapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "qa_fixture_failed",
        correlationId,
        error: error instanceof Error ? error.message : "unknown",
        part,
        prefix,
        steps,
        totalElapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
