import { hasPosCatalogPullEnvelope } from "@/server/pos-auth/route-envelope";
import {
  createPosRouteRequestContext,
  emitPosRouteRejectionAudit,
  posJsonResponse,
  posMethodNotAllowedResponse,
  readPosJsonBody,
} from "../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = createPosRouteRequestContext(request, "pos.catalog.pull");
  let catalogPull:
    | typeof import("@/server/pos-auth/catalog-pull")
    | undefined;

  try {
    const body = await readPosJsonBody(request);

    if (!hasPosCatalogPullEnvelope(body)) {
      emitPosRouteRejectionAudit(context, "catalog_pull");

      return posJsonResponse(
        {
          code: "validation_failed",
          message: "Request payload is invalid.",
          ok: false,
          root: "validation",
          stage: "catalog_pull",
        },
        400,
        context,
      );
    }

    catalogPull = await import("@/server/pos-auth/catalog-pull");
    const result = await catalogPull.handlePosCatalogPull(body, {
      clientRequestId: context.clientRequestId,
      edgeCorrelationHash: context.edgeCorrelationHash,
      requestId: context.serverRequestId,
      route: context.route,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return posJsonResponse(result.body, result.status, context);
  } catch {
    try {
      if (!catalogPull) {
        throw new Error("catalog route module unavailable");
      }

      const result = await catalogPull.handlePosCatalogRouteFailure({
        clientRequestId: context.clientRequestId,
        edgeCorrelationHash: context.edgeCorrelationHash,
        requestId: context.serverRequestId,
        route: context.route,
        userAgent: request.headers.get("user-agent") ?? undefined,
      });

      return posJsonResponse(result.body, result.status, context);
    } catch {
      return posJsonResponse(
        {
          code: "db_failure",
          message: "POS request failed.",
          ok: false,
          root: "unhandled_exception",
          stage: "catalog_pull",
        },
        500,
        context,
      );
    }
  }
}

function methodNotAllowed(request: Request) {
  return posMethodNotAllowedResponse(
    "POST",
    createPosRouteRequestContext(request, "pos.catalog.pull"),
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
