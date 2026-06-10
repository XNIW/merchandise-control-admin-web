import { cookies } from "next/headers";
import {
  submitInitialManager1001RecoveryForm,
} from "../provisioningFormSubmit";
import {
  guardPlatformProvisioningPostRequest,
  noStoreJson,
} from "@/server/platform-admin/provisioning-route-guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await cookies();

  const blockedRequest = guardPlatformProvisioningPostRequest(request);

  if (blockedRequest) {
    return blockedRequest;
  }

  const formData = await request.formData();
  const result = await submitInitialManager1001RecoveryForm(formData, {
    authorizationHeader: request.headers.get("authorization"),
    browserSupabaseHost: request.headers.get("x-platform-supabase-host"),
    requestContentType: request.headers.get("content-type"),
  });

  return noStoreJson(result);
}
