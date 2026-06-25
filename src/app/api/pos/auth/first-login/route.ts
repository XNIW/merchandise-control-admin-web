import { handlePosFirstLogin } from "@/server/pos-auth/service";
import {
  posJsonResponse,
  posMethodNotAllowedResponse,
  readPosJsonBody,
} from "../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await handlePosFirstLogin(await readPosJsonBody(request), {
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return posJsonResponse(result.body, result.status);
}

export function GET() {
  return posMethodNotAllowedResponse();
}
