import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient, resolveSupabaseAdminConfig } from "@/lib/supabase/admin";
import type { WeChatMiniSessionResult } from "@/lib/auth/wechat-contract";
import type { WeChatRuntimeConfig } from "./wechat-config";

const defaultResponseLimit = 64 * 1024;
const maximumResponseLimit = 262_144;
const sessionTtlSeconds = 15 * 60;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;

const trustedWeChatRpcPaths = {
  wechat_link_attempt_begin_v1:
    "/rest/v1/rpc/wechat_link_attempt_begin_v1",
  wechat_link_attempt_fail_v1:
    "/rest/v1/rpc/wechat_link_attempt_fail_v1",
  wechat_link_attempt_finalize_v1:
    "/rest/v1/rpc/wechat_link_attempt_finalize_v1",
  wechat_link_attempt_reconcile_v1:
    "/rest/v1/rpc/wechat_link_attempt_reconcile_v1",
  wechat_mini_read_v1: "/rest/v1/rpc/wechat_mini_read_v1",
  wechat_mini_session_issue_v1:
    "/rest/v1/rpc/wechat_mini_session_issue_v1",
  wechat_mini_session_resolve_v1:
    "/rest/v1/rpc/wechat_mini_session_resolve_v1",
  wechat_mini_session_revoke_v1:
    "/rest/v1/rpc/wechat_mini_session_revoke_v1",
  wechat_mini_sync_checkpoint_v1:
    "/rest/v1/rpc/wechat_mini_sync_checkpoint_v1",
  wechat_mini_sync_delta_v1:
    "/rest/v1/rpc/wechat_mini_sync_delta_v1",
} as const;

export type TrustedWeChatRpcName = keyof typeof trustedWeChatRpcPaths;

type MiniSessionResolution =
  | {
      accountFingerprint: string;
      actorProfileId: string;
      expiresAt: number;
      generation: number;
      ok: true;
      sessionId: string;
    }
  | { code: "backend_temporary" | "session_expired"; ok: false };

function digest(salt: string, namespace: string, value: string) {
  return createHash("sha256")
    .update(`${salt}:${namespace}:${value}`)
    .digest("hex");
}

function bearerToken(authorization: string | null) {
  if (!authorization) return null;
  const [scheme, token, extra] = authorization.trim().split(/\s+/);
  return scheme?.toLowerCase() === "bearer" && tokenPattern.test(token ?? "") && !extra
    ? token
    : null;
}

async function readBoundedJson(response: Response, responseLimit: number) {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > responseLimit) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > responseLimit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return null;
  }
}

export async function callTrustedWeChatRpc(
  rpc: TrustedWeChatRpcName,
  params: Record<string, unknown>,
  timeoutMs = 5_000,
  responseLimit = defaultResponseLimit,
) {
  const config = resolveSupabaseAdminConfig();
  if (
    config.status !== "configured" ||
    !Number.isSafeInteger(responseLimit) ||
    responseLimit < 1 ||
    responseLimit > maximumResponseLimit
  ) return null;
  try {
    const response = await fetch(new URL(trustedWeChatRpcPaths[rpc], config.url), {
      body: JSON.stringify(params),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        "X-Client-Info": "merchandise-control/wechat-mini-bff-v1",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? await readBoundedJson(response, responseLimit) : null;
  } catch {
    return null;
  }
}

async function revokeByTokenHash(
  token: string,
  deviceId: string,
  config: WeChatRuntimeConfig,
) {
  return callTrustedWeChatRpc("wechat_mini_session_revoke_v1", {
    p_device_hash: digest(config.hashSalt, "device", deviceId),
    p_token_hash: digest(config.hashSalt, "session", token),
  });
}

export async function issueWeChatMiniSession(input: {
  actorProfileId: string;
  correlationId: string;
  deviceId: string;
  supabaseAccessToken: string;
  config: WeChatRuntimeConfig;
}): Promise<WeChatMiniSessionResult | null> {
  if (
    !uuidPattern.test(input.actorProfileId) ||
    !uuidPattern.test(input.correlationId) ||
    !uuidPattern.test(input.deviceId) ||
    !input.config.hashSalt
  ) {
    return null;
  }
  const sessionToken = randomBytes(32).toString("base64url");
  const accountFingerprint = digest(
    input.config.hashSalt,
    "account",
    input.actorProfileId,
  );
  const issued = (await callTrustedWeChatRpc("wechat_mini_session_issue_v1", {
    p_account_fingerprint: accountFingerprint,
    p_actor_profile_id: input.actorProfileId,
    p_correlation_id: input.correlationId,
    p_device_hash: digest(input.config.hashSalt, "device", input.deviceId),
    p_token_hash: digest(input.config.hashSalt, "session", sessionToken),
    p_ttl_seconds: sessionTtlSeconds,
  })) as Record<string, unknown> | null;
  if (
    issued?.ok !== true ||
    !uuidPattern.test(String(issued.session_id ?? "")) ||
    issued.account_fingerprint !== accountFingerprint ||
    typeof issued.expires_at !== "string"
  ) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    await revokeByTokenHash(sessionToken, input.deviceId, input.config);
    return null;
  }
  try {
    const { error } = await admin.auth.admin.signOut(
      input.supabaseAccessToken,
      "local",
    );
    if (error) {
      await revokeByTokenHash(sessionToken, input.deviceId, input.config);
      return null;
    }
  } catch {
    await revokeByTokenHash(sessionToken, input.deviceId, input.config);
    return null;
  }

  const expiresAt = Math.floor(Date.parse(issued.expires_at) / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    await revokeByTokenHash(sessionToken, input.deviceId, input.config);
    return null;
  }
  return {
    accountFingerprint,
    expiresAt,
    expiresIn: Math.min(
      sessionTtlSeconds,
      expiresAt - Math.floor(Date.now() / 1000),
    ),
    sessionToken,
    tokenType: "bearer",
    user: { provider: "custom:wechat" },
  };
}

export async function resolveWeChatMiniSession(input: {
  authorization: string | null;
  deviceId: string | null;
  config?: WeChatRuntimeConfig;
}): Promise<MiniSessionResolution> {
  const config = input.config;
  const token = bearerToken(input.authorization);
  if (!config?.hashSalt || !token || !uuidPattern.test(input.deviceId ?? "")) {
    return { code: "session_expired", ok: false };
  }
  const resolved = (await callTrustedWeChatRpc("wechat_mini_session_resolve_v1", {
    p_device_hash: digest(config.hashSalt, "device", input.deviceId as string),
    p_token_hash: digest(config.hashSalt, "session", token),
  })) as Record<string, unknown> | null;
  if (!resolved) return { code: "backend_temporary", ok: false };
  if (resolved.ok !== true) return { code: "session_expired", ok: false };
  const expiresAt = Math.floor(Date.parse(String(resolved.expires_at ?? "")) / 1000);
  if (
    !uuidPattern.test(String(resolved.actor_profile_id ?? "")) ||
    !uuidPattern.test(String(resolved.session_id ?? "")) ||
    !sha256Pattern.test(String(resolved.account_fingerprint ?? "")) ||
    !Number.isSafeInteger(resolved.generation) ||
    !Number.isSafeInteger(expiresAt)
  ) {
    return { code: "backend_temporary", ok: false };
  }
  return {
    accountFingerprint: String(resolved.account_fingerprint),
    actorProfileId: String(resolved.actor_profile_id),
    expiresAt,
    generation: Number(resolved.generation),
    ok: true,
    sessionId: String(resolved.session_id),
  };
}

export async function revokeWeChatMiniSession(input: {
  authorization: string | null;
  deviceId: string | null;
  config: WeChatRuntimeConfig;
}) {
  const token = bearerToken(input.authorization);
  return Boolean(
    token &&
      uuidPattern.test(input.deviceId ?? "") &&
      input.config.hashSalt &&
      (await revokeByTokenHash(
        token,
        input.deviceId as string,
        input.config,
      )) !== null,
  );
}
