import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { submitUnifiedPlatformShopProvisioningForm } from "../provisioningFormSubmit";
import {
  createPlatformProvisioningAuthDiagnostics,
  platformProvisioningDiagnosticsEnabled,
} from "@/server/platform-admin/provisioning-request-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await cookies();

  const authorizationHeader = request.headers.get("authorization");
  const formData = await request.formData();
  const formModeValue = formData.get("ownerSetupMode");
  const diagnostics = createPlatformProvisioningAuthDiagnostics({
    browserSupabaseHost: request.headers.get("x-platform-supabase-host"),
    codeBranch: "platform-provisioning-create-shop-route",
    formMode: typeof formModeValue === "string" ? formModeValue : null,
    requestContentType: request.headers.get("content-type"),
  });
  const result = await submitUnifiedPlatformShopProvisioningForm(formData, {
    authorizationHeader,
    browserSupabaseHost: request.headers.get("x-platform-supabase-host"),
    diagnostics,
    formMode: typeof formModeValue === "string" ? formModeValue : null,
    requestContentType: request.headers.get("content-type"),
  });
  const responseBody =
    !result.ok && platformProvisioningDiagnosticsEnabled()
      ? {
          ...result,
          diagnostics,
        }
      : result;

  return NextResponse.json(responseBody, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
