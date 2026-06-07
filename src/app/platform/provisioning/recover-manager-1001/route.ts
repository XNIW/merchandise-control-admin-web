import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  submitInitialManager1001RecoveryForm,
} from "../provisioningFormSubmit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await cookies();

  const formData = await request.formData();
  const result = await submitInitialManager1001RecoveryForm(formData, {
    authorizationHeader: request.headers.get("authorization"),
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
