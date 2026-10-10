import { handlePosCatalogImportMultipart, RECOVERY_ACTIONS, type RecoveryAction } from "@/server/pos-auth/catalog-import-multipart";
import { MAX_POS_CATALOG_IMPORT_JSON_BODY_BYTES } from "@/server/pos-auth/catalog-import-sync";
import { createPosRouteRequestContext, posJsonResponse, posMethodNotAllowedResponse, readPosJsonBody } from "../../../_shared/pos-route-security";

export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{action:string}>};
export async function POST(request:Request,routeContext:Context) {
  const {action}=await routeContext.params;
  const context=createPosRouteRequestContext(request,"pos.catalog.import_recovery");
  if (!RECOVERY_ACTIONS.includes(action as RecoveryAction)) return posJsonResponse({ok:false,code:"not_found"},404,context);
  try {
    const result=await handlePosCatalogImportMultipart(action as RecoveryAction,await readPosJsonBody(request,{maxBytes:MAX_POS_CATALOG_IMPORT_JSON_BODY_BYTES}),{
      cfRay:request.headers.get("cf-ray")??undefined,clientRequestId:context.clientRequestId,requestId:context.serverRequestId,route:context.route,userAgent:request.headers.get("user-agent")??undefined,
    });
    return posJsonResponse(result.body,result.status,context);
  } catch {return posJsonResponse({ok:false,code:"db_failure",message:"POS request failed."},500,context);}
}
function methodNotAllowed(request:Request) {return posMethodNotAllowedResponse("POST",createPosRouteRequestContext(request,"pos.catalog.import_recovery"));}
export {methodNotAllowed as DELETE,methodNotAllowed as GET,methodNotAllowed as HEAD,methodNotAllowed as OPTIONS,methodNotAllowed as PATCH,methodNotAllowed as PUT};
