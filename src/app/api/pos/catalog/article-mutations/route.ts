import {
  hasPosArticleMutationEnvelope,
  MAX_POS_ARTICLE_MUTATION_JSON_BODY_BYTES,
} from "@/server/pos-auth/route-envelope";
import {
  createPosRouteRequestContext,
  posJsonResponse,
  posMethodNotAllowedResponse,
  readPosJsonBody,
} from "../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = createPosRouteRequestContext(
    request,
    "pos.catalog.article_mutations",
  );

  try {
    const body = await readPosJsonBody(request, {
      maxBytes: MAX_POS_ARTICLE_MUTATION_JSON_BODY_BYTES,
    });

    if (!hasPosArticleMutationEnvelope(body)) {
      return posJsonResponse(
        {
          code: "validation_failed",
          message: "Request payload is invalid.",
          ok: false,
        },
        400,
        context,
      );
    }

    const { handlePosArticleMutations } = await import(
      "@/server/pos-auth/article-mutations"
    );
    const result = await handlePosArticleMutations(body, {
      cfRay: request.headers.get("cf-ray") ?? undefined,
      clientRequestId: context.clientRequestId,
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
      },
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
      "pos.catalog.article_mutations",
    ),
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
