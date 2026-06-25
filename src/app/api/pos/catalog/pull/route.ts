import { handlePosCatalogPull } from "@/server/pos-auth/catalog-pull";
import {
  posJsonResponse,
  posMethodNotAllowedResponse,
  readPosJsonBody,
} from "../../_shared/pos-route-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await handlePosCatalogPull(await readPosJsonBody(request), {
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return posJsonResponse(result.body, result.status);
}

export function GET() {
  return posMethodNotAllowedResponse();
}
