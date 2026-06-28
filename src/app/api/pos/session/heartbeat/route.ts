import { handlePosHeartbeat } from "@/server/pos-auth/service";
import {
  createPosRouteRequestContext,
  posJsonResponse,
  posMethodNotAllowedResponse,
  readPosJsonBody,
} from "../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = createPosRouteRequestContext(request, "pos.session.heartbeat");

  try {
    const result = await handlePosHeartbeat(await readPosJsonBody(request), {
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
    createPosRouteRequestContext(request, "pos.session.heartbeat"),
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
