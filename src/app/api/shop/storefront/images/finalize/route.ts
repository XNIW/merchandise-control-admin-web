import {
  parseStorefrontImageTarget,
  readStorefrontImageJson,
  storefrontImageJson,
} from "@/server/shop-admin/storefront-images/contract";
import { resolveStorefrontImageRouteContext } from "@/server/shop-admin/storefront-images/route-context";
import { finalizeStorefrontImage } from "@/server/shop-admin/storefront-images/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = parseStorefrontImageTarget(
    await readStorefrontImageJson(request),
  );
  if (!input)
    return storefrontImageJson({ code: "validation_failed", ok: false }, 400);
  const resolved = await resolveStorefrontImageRouteContext(request, input.shopId);
  if (resolved.status === "blocked") return resolved.response;
  const result = await finalizeStorefrontImage(resolved.context, input);
  return storefrontImageJson(result.body, result.status);
}
