import {
  parseStorefrontImageSource,
  readStorefrontImageJson,
  storefrontImageJson,
} from "@/server/shop-admin/storefront-images/contract";
import { resolveStorefrontImageRouteContext } from "@/server/shop-admin/storefront-images/route-context";
import { readStorefrontSourceImage } from "@/server/shop-admin/storefront-images/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = parseStorefrontImageSource(
    await readStorefrontImageJson(request),
  );
  if (!input)
    return storefrontImageJson({ code: "validation_failed", ok: false }, 400);
  const resolved = await resolveStorefrontImageRouteContext(request, input.shopId);
  if (resolved.status === "blocked") return resolved.response;
  const result = await readStorefrontSourceImage(resolved.context, input);
  if ("body" in result) return storefrontImageJson(result.body, result.status);
  const responseBytes = new Uint8Array(result.bytes.byteLength);
  responseBytes.set(result.bytes);
  return new Response(responseBytes.buffer, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": "inline; filename=storefront-source.jpg",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Type": result.contentType,
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}
