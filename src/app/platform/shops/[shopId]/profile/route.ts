import { cookies } from "next/headers";
import { submitPlatformShopProfileUpdateForm } from "./updateFormSubmit";
import {
  createPlatformProvisioningAuthDiagnostics,
  platformProvisioningDiagnosticsEnabled,
} from "@/server/platform-admin/provisioning-request-auth";
import {
  guardPlatformProvisioningPostRequest,
  noStoreJson,
} from "@/server/platform-admin/provisioning-route-guard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    shopId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  await cookies();

  const blockedRequest = guardPlatformProvisioningPostRequest(request);

  if (blockedRequest) {
    return blockedRequest;
  }

  const { shopId } = await context.params;
  const authorizationHeader = request.headers.get("authorization");
  const formData = await request.formData();
  const diagnostics = createPlatformProvisioningAuthDiagnostics({
    browserSupabaseHost: request.headers.get("x-platform-supabase-host"),
    codeBranch: "platform-shop-profile-update-route",
    formMode: "shop-profile-update",
    requestContentType: request.headers.get("content-type"),
  });
  const result = await submitPlatformShopProfileUpdateForm(shopId, formData, {
    authorizationHeader,
    browserSupabaseHost: request.headers.get("x-platform-supabase-host"),
    diagnostics,
    formMode: "shop-profile-update",
    requestContentType: request.headers.get("content-type"),
  });
  const responseBody =
    !result.ok && platformProvisioningDiagnosticsEnabled()
      ? {
          ...result,
          diagnostics,
        }
      : result;

  return noStoreJson(responseBody);
}
