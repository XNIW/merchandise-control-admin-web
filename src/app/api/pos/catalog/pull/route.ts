import {
  handlePosCatalogPull,
  handlePosCatalogRouteFailure,
} from "@/server/pos-auth/catalog-pull";
import {
  createPosRouteRequestContext,
  posJsonResponse,
  posMethodNotAllowedResponse,
  readPosJsonBody,
} from "../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = createPosRouteRequestContext(request, "pos.catalog.pull");

  try {
    const result = await handlePosCatalogPull(await readPosJsonBody(request), {
      clientRequestId: context.clientRequestId,
      edgeCorrelationHash: context.edgeCorrelationHash,
      requestId: context.serverRequestId,
      route: context.route,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return posJsonResponse(result.body, result.status, context);
  } catch {
    const result = await handlePosCatalogRouteFailure({
      clientRequestId: context.clientRequestId,
      edgeCorrelationHash: context.edgeCorrelationHash,
      requestId: context.serverRequestId,
      route: context.route,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return posJsonResponse(result.body, result.status, context);
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
