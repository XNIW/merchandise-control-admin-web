import {
  parseProductImageReadInput,
  productImageJson,
  readProductImageJson,
} from "@/server/shop-admin/product-images/contract";
import { resolveProductImageRequestActor } from "@/server/shop-admin/product-images/auth";
import {
  readProductImageUrls,
  recordProductImageDenied,
} from "@/server/shop-admin/product-images/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = parseProductImageReadInput(await readProductImageJson(request));
  if (!input) {
    return productImageJson(
      { code: "validation_failed", message: "Invalid request.", ok: false },
      400,
    );
  }

  const auth = await resolveProductImageRequestActor(
    request,
    input.shopId,
    "products.read",
  );
  if (auth.status !== "authorized") {
    await recordProductImageDenied({
      actorKind: auth.actorKind,
      actorProfileId: auth.actorProfileId,
      code: auth.code,
      operation: "read",
      productId: input.refs[0]?.productId,
      shopId: input.shopId,
    });
    const status =
      auth.code === "not_configured"
        ? 503
        : auth.code === "unauthorized"
          ? 401
          : 403;
    return productImageJson(
      { code: auth.code, message: "Request is not authorized.", ok: false },
      status,
    );
  }

  const result = await readProductImageUrls(auth.actor, input);
  return productImageJson(result.body, result.status);
}
