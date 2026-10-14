import { handleMiniProgramProductImageRequest } from "@/server/shop-admin/product-images/mini-program-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleMiniProgramProductImageRequest(request, "intent");
}
