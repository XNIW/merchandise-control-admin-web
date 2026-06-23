import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import { resolveShopAdminDataAccess } from "@/server/shop-admin/data-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SaleLedgerLineRow = {
  amount_clp: number | string;
  barcode: string | null;
  entry_type: string;
  line_position: number | null;
  product_name: string | null;
  quantity: number | string | null;
};

function numberValue(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

type LedgerReadResult = Promise<{
  data: SaleLedgerLineRow[] | null;
  error: { message?: string } | null;
}>;

type LedgerReadFilter = {
  eq(column: string, value: string): LedgerReadFilter;
  in(column: string, values: readonly string[]): LedgerReadFilter;
  limit(count: number): LedgerReadResult;
  order(column: string, options: { ascending: boolean }): LedgerReadFilter;
};

type LedgerReadClient = {
  from(table: "pos_revenue_ledger_entries"): {
    select(columns: string): LedgerReadFilter;
  };
};

function ledgerReadClient(client: SupabaseAdminClient) {
  return client as unknown as LedgerReadClient;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const posSaleId = url.searchParams.get("pos_sale_id");
  const requestedShopId = url.searchParams.get("shop_id");

  if (!posSaleId) {
    return NextResponse.json(
      { code: "validation_failed", ok: false },
      { status: 400 },
    );
  }

  const access = await resolveShopAdminDataAccess({ requestedShopId });

  if (access.status !== "ready") {
    return NextResponse.json(
      { code: "unauthorized", ok: false },
      { status: 401 },
    );
  }

  const config = resolveSupabaseAdminConfig();
  const admin = createSupabaseAdminClient(config);

  if (!admin) {
    return NextResponse.json(
      { code: "not_configured", ok: false },
      { status: 503 },
    );
  }

  const saleResult = await admin
    .from("pos_sales")
    .select("pos_sale_id")
    .eq("shop_id", access.selectedShop.shopId)
    .eq("pos_sale_id", posSaleId)
    .maybeSingle();

  if (saleResult.error) {
    return NextResponse.json(
      { code: "db_failure", ok: false },
      { status: 500 },
    );
  }

  if (!saleResult.data) {
    return NextResponse.json(
      { code: "not_found", ok: false },
      { status: 404 },
    );
  }

  const linesResult = await ledgerReadClient(admin)
    .from("pos_revenue_ledger_entries")
    .select("amount_clp,barcode,entry_type,line_position,product_name,quantity")
    .eq("shop_id", access.selectedShop.shopId)
    .eq("pos_sale_id", posSaleId)
    .in("entry_type", ["discount", "item", "refund_item", "tax", "void_marker"])
    .order("line_position", { ascending: true })
    .limit(200);

  if (linesResult.error) {
    return NextResponse.json(
      { code: "db_failure", ok: false },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      lines: (linesResult.data ?? []).map((line) => {
        const lineTotalClp = numberValue(line.amount_clp);
        const quantity = numberValue(line.quantity);
        const absoluteQuantity = Math.abs(quantity);

        return {
          barcode: line.barcode,
          entryType: line.entry_type,
          lineTotalClp,
          productName: line.product_name,
          quantity,
          unitPriceClp:
            absoluteQuantity > 0
              ? Math.round(Math.abs(lineTotalClp) / absoluteQuantity)
              : Math.abs(lineTotalClp),
        };
      }),
      ok: true,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
