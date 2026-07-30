import {
  createPosProductImageErrorBody,
  hasPosProductImageRemoveEnvelope,
  MAX_POS_PRODUCT_IMAGE_JSON_BODY_BYTES,
} from "@/server/pos-auth/product-image-envelope";
import {
  createPosRouteRequestContext,
  emitPosRouteRejectionAudit,
  posJsonResponse,
  posMethodNotAllowedResponse,
  readPosJsonBody,
} from "../../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = createPosRouteRequestContext(
    request,
    "pos.catalog.product_images.remove",
  );

  try {
    const body = await readPosJsonBody(request, {
      maxBytes: MAX_POS_PRODUCT_IMAGE_JSON_BODY_BYTES,
    });

    if (!hasPosProductImageRemoveEnvelope(body)) {
      emitPosRouteRejectionAudit(context, "product_image_remove");

      return posJsonResponse(
        createPosProductImageErrorBody({
          code: "validation_failed",
          message: "Request payload is invalid.",
          operation: "remove",
          retryable: false,
          terminal: true,
        }),
        400,
        context,
      );
    }

    const { authorizePosProductImageRequest } =
      await import("@/server/pos-auth/product-image-auth");
    const authorization = await authorizePosProductImageRequest(
      body,
      "catalog.write",
    );

    if (!authorization.ok) {
      return posJsonResponse(authorization.body, authorization.status, context);
    }

    const { handlePosProductImageRemove } =
      await import("@/server/pos-auth/product-images");
    const result = await handlePosProductImageRemove(authorization.request, {
      clientRequestId: context.clientRequestId,
      edgeCorrelationHash: context.edgeCorrelationHash,
      requestId: context.serverRequestId,
      route: context.route,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return posJsonResponse(result.body, result.status, context);
  } catch {
    return posJsonResponse(
      createPosProductImageErrorBody({
        code: "db_failure",
        message: "POS product image request failed.",
        operation: "remove",
        retryable: true,
        terminal: false,
      }),
      500,
      context,
    );
  }
}

function methodNotAllowed(request: Request) {
  return posMethodNotAllowedResponse(
    "POST",
    createPosRouteRequestContext(request, "pos.catalog.product_images.remove"),
    createPosProductImageErrorBody({
      code: "method_not_allowed",
      message: "Method not allowed.",
      operation: "remove",
      retryable: false,
      terminal: true,
    }),
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
