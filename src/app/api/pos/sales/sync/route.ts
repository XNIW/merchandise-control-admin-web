import {
  handlePosSalesSync,
  MAX_POS_SALES_SYNC_JSON_BODY_BYTES,
} from "@/server/pos-auth/sales-sync";
import {
  createPosRouteRequestContext,
  posJsonResponse,
  posMethodNotAllowedResponse,
  readPosJsonBody,
} from "../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = createPosRouteRequestContext(request, "pos.sales.sync");

  try {
    const result = await handlePosSalesSync(
      await readPosJsonBody(request, {
        maxBytes: MAX_POS_SALES_SYNC_JSON_BODY_BYTES,
      }),
      {
        clientRequestId: context.clientRequestId,
        idempotencyKeyHeader: request.headers.get("idempotency-key") ?? undefined,
        requestId: context.serverRequestId,
        route: context.route,
        userAgent: request.headers.get("user-agent") ?? undefined,
      },
    );

    return posJsonResponse(result.body, result.status, context);
  } catch {
    return posJsonResponse(
      {
        code: "db_failure",
        message: "POS request failed.",
        ok: false,
      },
      500,
      context,
    );
  }
}

function methodNotAllowed(request: Request) {
  return posMethodNotAllowedResponse(
    "POST",
    createPosRouteRequestContext(request, "pos.sales.sync"),
  );
}

export {
  methodNotAllowed as DELETE,
  methodNotAllowed as GET,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS,
  methodNotAllowed as PATCH,
  methodNotAllowed as PUT,
};
