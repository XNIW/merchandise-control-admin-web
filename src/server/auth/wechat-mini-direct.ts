import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { callTrustedWeChatRpc } from "./wechat-mini-session";
import {
  miniDirectProtocol,
  resolveMiniDirectConfig,
  type MiniDirectConfig,
} from "./wechat-mini-direct-config";
import { verifyWeChatMiniCode } from "./wechat-code2session";

export const miniUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const miniCapability = /^[A-Za-z0-9_-]{43}$/;
export function miniHash(salt: string, kind: string, value: string) {
  return createHash("sha256").update(`${salt}:${kind}:${value}`).digest("hex");
}
export function miniObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
const denied = (code: string) => ({ ok: false as const, code });

export async function createMiniDirectChallenge(
  body: Record<string, unknown>,
  config = resolveMiniDirectConfig(),
) {
  if (
    body.protocol !== miniDirectProtocol ||
    typeof body.deviceId !== "string" ||
    !miniUuid.test(body.deviceId) ||
    typeof body.verifier !== "string" ||
    !miniCapability.test(body.verifier) ||
    !["login", "pair_claim", "pair_confirm"].includes(String(body.purpose))
  )
    return denied("validation_failed");
  if (!(body.purpose === "login" ? config.loginReady : config.enrollmentReady))
    return denied("provider_not_configured");
  if (
    (body.purpose === "pair_claim" &&
      (typeof body.transferCode !== "string" ||
        !miniCapability.test(body.transferCode))) ||
    (body.purpose === "pair_confirm" &&
      (typeof body.pairingId !== "string" || !miniUuid.test(body.pairingId))) ||
    (body.purpose === "login" &&
      (body.transferCode !== undefined || body.pairingId !== undefined))
  )
    return denied("validation_failed");
  const result = await callTrustedWeChatRpc("wechat_mini_proof_create_v1", {
    p_app_id: config.appId,
    p_verifier_hash: miniHash(
      config.common.hashSalt,
      "verifier",
      body.verifier,
    ),
    p_device_hash: miniHash(config.common.hashSalt, "device", body.deviceId),
    p_purpose: body.purpose,
    p_pairing_id: body.purpose === "pair_confirm" ? body.pairingId : null,
    p_transfer_hash:
      body.purpose === "pair_claim"
        ? miniHash(
            config.common.hashSalt,
            "transfer",
            String(body.transferCode),
          )
        : null,
  });
  if (
    !miniObject(result) ||
    result.ok !== true ||
    typeof result.proof_id !== "string" ||
    !miniUuid.test(result.proof_id) ||
    typeof result.expires_at !== "string"
  )
    return denied("backend_temporary");
  const ttl = Math.floor((Date.parse(result.expires_at) - Date.now()) / 1000);
  if (!Number.isFinite(ttl) || ttl < 1 || ttl > 300)
    return denied("backend_temporary");
  return {
    ok: true as const,
    protocol: miniDirectProtocol,
    challengeId: result.proof_id,
    expiresIn: ttl,
  };
}

async function verifiedProof(
  body: Record<string, unknown>,
  config: MiniDirectConfig,
) {
  if (
    body.protocol !== miniDirectProtocol ||
    typeof body.challengeId !== "string" ||
    !miniUuid.test(body.challengeId) ||
    typeof body.deviceId !== "string" ||
    !miniUuid.test(body.deviceId) ||
    typeof body.verifier !== "string" ||
    !miniCapability.test(body.verifier) ||
    typeof body.code !== "string" ||
    !/^[A-Za-z0-9_-]{1,512}$/.test(body.code)
  )
    return false;
  const codeHash = miniHash(config.common.hashSalt, "code", body.code);
  const claimed = await callTrustedWeChatRpc("wechat_mini_proof_claim_v1", {
    p_proof_id: body.challengeId,
    p_app_id: config.appId,
    p_code_hash: codeHash,
    p_verifier_hash: miniHash(
      config.common.hashSalt,
      "verifier",
      body.verifier,
    ),
    p_device_hash: miniHash(config.common.hashSalt, "device", body.deviceId),
  });
  if (claimed !== true) return false;
  const identityHash = await verifyWeChatMiniCode(body.code, config);
  return (
    identityHash !== null &&
    (await callTrustedWeChatRpc("wechat_mini_proof_verify_v1", {
      p_proof_id: body.challengeId,
      p_app_id: config.appId,
      p_code_hash: codeHash,
      p_identity_hash: identityHash,
    })) === true
  );
}

export async function exchangeMiniDirect(
  body: Record<string, unknown>,
  config = resolveMiniDirectConfig(),
) {
  if (!config.loginReady) return denied("provider_not_configured");
  if (!(await verifiedProof(body, config))) return denied("exchange_failed");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = miniHash(config.common.hashSalt, "session", token);
  const result = await callTrustedWeChatRpc("wechat_mini_direct_issue_v1", {
    p_proof_id: body.challengeId,
    p_token_hash: tokenHash,
    p_allowed_profiles: config.common.miniAllowedProfileIds,
    p_fingerprint_salt: config.common.hashSalt,
  });
  if (
    !miniObject(result) ||
    result.ok !== true ||
    result.protocol !== miniDirectProtocol ||
    typeof result.actor_profile_id !== "string" ||
    !config.common.miniAllowedProfileIds.includes(result.actor_profile_id) ||
    typeof result.account_fingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(result.account_fingerprint) ||
    typeof result.session_id !== "string" ||
    !miniUuid.test(result.session_id) ||
    !Number.isSafeInteger(result.generation) ||
    Number(result.generation) < 1 ||
    typeof result.expires_at !== "string" ||
    !(Date.parse(result.expires_at) > Date.now()) ||
    Date.parse(result.expires_at) > Date.now() + 900_000
  ) {
    await callTrustedWeChatRpc("wechat_mini_session_revoke_v1", {
      p_token_hash: tokenHash,
      p_device_hash: miniHash(
        config.common.hashSalt,
        "device",
        String(body.deviceId),
      ),
    });
    return denied(
      miniObject(result) && result.code === "enrollment_required"
        ? "enrollment_required"
        : "backend_temporary",
    );
  }
  return {
    ok: true as const,
    protocol: miniDirectProtocol,
    session: {
      protocol: miniDirectProtocol,
      sessionToken: token,
      expiresAt: Math.floor(Date.parse(result.expires_at) / 1000),
      expiresIn: Math.floor(
        (Date.parse(result.expires_at) - Date.now()) / 1000,
      ),
      tokenType: "bearer",
      accountFingerprint: result.account_fingerprint,
      user: { provider: "wechat-mini" },
    },
  };
}

export async function claimMiniPairing(
  body: Record<string, unknown>,
  config = resolveMiniDirectConfig(),
) {
  if (!config.enrollmentReady) return denied("provider_not_configured");
  if (
    typeof body.transferCode !== "string" ||
    !miniCapability.test(body.transferCode) ||
    !(await verifiedProof(body, config))
  )
    return denied("pairing_invalid");
  const capability = randomBytes(32).toString("base64url");
  const result = await callTrustedWeChatRpc("wechat_mini_pair_claim_v1", {
    p_proof_id: body.challengeId,
    p_transfer_hash: miniHash(
      config.common.hashSalt,
      "transfer",
      body.transferCode,
    ),
    p_mini_hash: miniHash(config.common.hashSalt, "pair-mini", capability),
    p_allowed_profiles: config.common.miniAllowedProfileIds,
  });
  if (
    !miniObject(result) ||
    result.ok !== true ||
    typeof result.pairing_id !== "string" ||
    !miniUuid.test(result.pairing_id) ||
    typeof result.comparison !== "string" ||
    !/^[0-9]{8}$/.test(result.comparison) ||
    typeof result.account_name !== "string" ||
    result.account_name.length > 256
  )
    return denied("pairing_invalid");
  return {
    ok: true as const,
    protocol: miniDirectProtocol,
    pairingId: result.pairing_id,
    miniCapability: capability,
    comparison: result.comparison,
    accountName: result.account_name,
    expiresAt: result.expires_at,
  };
}
export async function confirmMiniPairing(
  body: Record<string, unknown>,
  config = resolveMiniDirectConfig(),
) {
  if (!config.enrollmentReady) return denied("provider_not_configured");
  if (
    typeof body.pairingId !== "string" ||
    !miniUuid.test(body.pairingId) ||
    typeof body.miniCapability !== "string" ||
    !miniCapability.test(body.miniCapability) ||
    body.consent !== true ||
    !(await verifiedProof(body, config))
  )
    return denied("pairing_invalid");
  const result = await callTrustedWeChatRpc("wechat_mini_pair_confirm_v1", {
    p_proof_id: body.challengeId,
    p_pairing_id: body.pairingId,
    p_mini_hash: miniHash(
      config.common.hashSalt,
      "pair-mini",
      body.miniCapability,
    ),
    p_allowed_profiles: config.common.miniAllowedProfileIds,
  });
  return miniObject(result) && result.ok === true && result.state === "linked"
    ? { ok: true as const, state: "linked" as const }
    : denied("pairing_invalid");
}
