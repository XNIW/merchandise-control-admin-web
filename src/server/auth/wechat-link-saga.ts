import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { WeChatNativeSurface } from "@/lib/auth/wechat-contract";
import { callTrustedWeChatRpc } from "./wechat-mini-session";
import type { WeChatRuntimeConfig } from "./wechat-config";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noncePattern = /^[A-Za-z0-9_-]{32,128}$/;

function digest(salt: string, value: string) {
  return createHash("sha256").update(`${salt}:link:${value}`).digest("hex");
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function beginWeChatLinkAttempt(input: {
  actorProfileId: string;
  config: WeChatRuntimeConfig;
  correlationId?: string;
  nonce?: string;
  surface: "web" | Exclude<WeChatNativeSurface, "mini_program">;
}) {
  const nonce = input.nonce ?? randomBytes(32).toString("base64url");
  const correlationId = input.correlationId ?? randomUUID();
  if (
    !input.config.hashSalt ||
    !uuidPattern.test(input.actorProfileId) ||
    !uuidPattern.test(correlationId) ||
    !noncePattern.test(nonce)
  ) {
    return null;
  }
  const result = await callTrustedWeChatRpc("wechat_link_attempt_begin_v1", {
    p_actor_profile_id: input.actorProfileId,
    p_correlation_id: correlationId,
    p_nonce_hash: digest(input.config.hashSalt, nonce),
    p_provider: input.config.oidcProvider,
    p_surface: input.surface,
    p_ttl_seconds: 600,
  });
  if (
    !object(result) ||
    result.ok !== true ||
    !uuidPattern.test(String(result.attempt_id ?? ""))
  ) {
    return null;
  }
  return {
    attemptId: String(result.attempt_id),
    correlationId,
    nonce,
  };
}

export async function finalizeWeChatLinkAttempt(input: {
  actorProfileId: string;
  attemptId: string;
  config: WeChatRuntimeConfig;
  nonce: string;
}) {
  if (
    !input.config.hashSalt ||
    !uuidPattern.test(input.actorProfileId) ||
    !uuidPattern.test(input.attemptId) ||
    !noncePattern.test(input.nonce)
  ) {
    return false;
  }
  const result = await callTrustedWeChatRpc("wechat_link_attempt_finalize_v1", {
    p_actor_profile_id: input.actorProfileId,
    p_attempt_id: input.attemptId,
    p_nonce_hash: digest(input.config.hashSalt, input.nonce),
  });
  return object(result) && result.ok === true && result.status === "audit_finalized";
}

export async function failWeChatLinkAttempt(input: {
  actorProfileId: string;
  attemptId: string;
  conflict?: boolean;
  failureCode: string;
}) {
  if (
    !uuidPattern.test(input.actorProfileId) ||
    !uuidPattern.test(input.attemptId) ||
    !/^[a-z0-9_]{1,64}$/.test(input.failureCode)
  ) {
    return false;
  }
  const result = await callTrustedWeChatRpc("wechat_link_attempt_fail_v1", {
    p_actor_profile_id: input.actorProfileId,
    p_attempt_id: input.attemptId,
    p_conflict: input.conflict ?? false,
    p_failure_code: input.failureCode,
  });
  return result === true;
}

export async function reconcileWeChatLinkAttempts(actorProfileId: string) {
  if (!uuidPattern.test(actorProfileId)) return false;
  const result = await callTrustedWeChatRpc("wechat_link_attempt_reconcile_v1", {
    p_actor_profile_id: actorProfileId,
    p_limit: 10,
  });
  return object(result) && result.ok === true;
}

export async function reconcileCurrentWeChatLink(
  actorProfileId: string,
  config: WeChatRuntimeConfig,
) {
  return Boolean(
    config.linkingEnabled &&
      (await reconcileWeChatLinkAttempts(actorProfileId)),
  );
}
