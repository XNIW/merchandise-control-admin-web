import {
  handlePosSalesSync,
  MAX_POS_SALES_SYNC_JSON_BODY_BYTES,
} from "@/server/pos-auth/sales-sync";
import { posJsonResponse, readPosJsonBody } from "../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await handlePosSalesSync(
    await readPosJsonBody(request, {
      maxBytes: MAX_POS_SALES_SYNC_JSON_BODY_BYTES,
    }),
    {
      idempotencyKeyHeader: request.headers.get("idempotency-key") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    },
  );

  return posJsonResponse(result.body, result.status);
}
