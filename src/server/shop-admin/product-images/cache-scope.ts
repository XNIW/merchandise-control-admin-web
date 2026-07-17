import "server-only";

import { createHash } from "node:crypto";
import type { ProductImageActorKind } from "./auth";

export function createProductImageCacheScope(
  _actorKind: ProductImageActorKind,
  actorProfileId: string,
) {
  return createHash("sha256")
    .update(`product-image-account:${actorProfileId}`)
    .digest("hex");
}
