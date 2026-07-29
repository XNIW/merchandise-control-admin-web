import { hasPosFirstLoginEnvelope } from "@/server/pos-auth/route-envelope";
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
  const context = createPosRouteRequestContext(request, "pos.auth.first-login");

  try {
    const body = await readPosJsonBody(request);

    if (!hasPosFirstLoginEnvelope(body)) {
      emitPosRouteRejectionAudit(context, "first_login");

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

    const { handlePosFirstLogin } = await import("@/server/pos-auth/service");
    const result = await handlePosFirstLogin(body, {
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
    createPosRouteRequestContext(request, "pos.auth.first-login"),
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
