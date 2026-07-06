import {
  handlePosCatalogImportSync,
  MAX_POS_CATALOG_IMPORT_JSON_BODY_BYTES,
} from "@/server/pos-auth/catalog-import-sync";
import {
  createPosRouteRequestContext,
  posJsonResponse,
  posMethodNotAllowedResponse,
  readPosJsonBody,
} from "../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = createPosRouteRequestContext(request, "pos.catalog.import_sync");

  try {
    const result = await handlePosCatalogImportSync(
      await readPosJsonBody(request, {
        maxBytes: MAX_POS_CATALOG_IMPORT_JSON_BODY_BYTES,
      }),
      {
        cfRay: request.headers.get("cf-ray") ?? undefined,
        clientRequestId: context.clientRequestId,
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
    createPosRouteRequestContext(request, "pos.catalog.import_sync"),
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
