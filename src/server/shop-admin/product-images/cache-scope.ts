import "server-only";

import { createHash } from "node:crypto";
import type { ProductImageActorKind } from "./auth";

export function createProductImageCacheScope(
  actorKind: ProductImageActorKind,
  actorProfileId: string,
) {
  return createHash("sha256")
    .update(`${actorKind}:${actorProfileId}`)
    .digest("hex");
}
