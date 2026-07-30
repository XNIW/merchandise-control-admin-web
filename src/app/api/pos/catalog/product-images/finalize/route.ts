import {
  createPosProductImageErrorBody,
  hasPosProductImageFinalizeEnvelope,
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
    "pos.catalog.product_images.finalize",
  );

  try {
    const body = await readPosJsonBody(request, {
      maxBytes: MAX_POS_PRODUCT_IMAGE_JSON_BODY_BYTES,
    });

    if (!hasPosProductImageFinalizeEnvelope(body)) {
      emitPosRouteRejectionAudit(context, "product_image_finalize");

      return posJsonResponse(
        createPosProductImageErrorBody({
          code: "validation_failed",
          message: "Request payload is invalid.",
          operation: "finalize",
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

    const { handlePosProductImageFinalize } =
      await import("@/server/pos-auth/product-images");
    const result = await handlePosProductImageFinalize(authorization.request, {
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
        operation: "finalize",
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
    createPosRouteRequestContext(
      request,
      "pos.catalog.product_images.finalize",
    ),
    createPosProductImageErrorBody({
      code: "method_not_allowed",
      message: "Method not allowed.",
      operation: "finalize",
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
