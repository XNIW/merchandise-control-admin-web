import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

type PosSecretKind = "device" | "session";

export function generatePosSecret(kind: PosSecretKind) {
  return `mcpos_${kind}_${randomBytes(32).toString("base64url")}`;
}

export function hashPosSecret(secret: string) {
  return `sha256:${createHash("sha256").update(secret, "utf8").digest("hex")}`;
}

export function verifyPosSecret(secret: string, expectedHash: string) {
  if (!secret || !expectedHash) {
    return false;
  }

  const candidate = Buffer.from(hashPosSecret(secret), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
