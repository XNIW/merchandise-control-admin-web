import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  WeChatAuditEvent,
  WeChatChallengeResult,
  WeChatErrorCode,
  WeChatLinkMode,
  WeChatNativeSurface,
  WeChatSessionResult,
} from "@/lib/auth/wechat-contract";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WeChatRuntimeConfig } from "./wechat-config";
import {
  issueWeChatMiniSession,
  revokeWeChatMiniSession,
} from "./wechat-mini-session";
import {
  beginWeChatLinkAttempt,
  failWeChatLinkAttempt,
  finalizeWeChatLinkAttempt,
  reconcileWeChatLinkAttempts,
} from "./wechat-link-saga";

const challengeTtlSeconds = 300;
const outboundTimeoutMs = 8_000;
const outboundResponseLimit = 64 * 1_024;

type RpcResult<T> = Promise<{ data: T | null; error: { message?: string } | null }>;
type ChallengeRpcClient = {
  rpc(name: string, params: Record<string, unknown>): RpcResult<unknown>;
};

async function auditedFailure(
  client: ChallengeRpcClient,
  input: {
    code: WeChatErrorCode;
    correlationId: string;
    event?: WeChatAuditEvent;
    mode: WeChatLinkMode;
    status: number;
    surface: WeChatNativeSurface;
  },
): Promise<ExchangeFailure> {
  await audit(client, {
    correlationId: input.correlationId,
    event: input.event ?? "auth.wechat.exchange_blocked",
    mode: input.mode,
    reason: input.code,
    result: "blocked",
    surface: input.surface,
  });
  return { code: input.code, ok: false, status: input.status };
}

type ExchangeInput = {
  authorization: string | null;
  code: string;
  correlationId: string;
  deviceId: string;
  ipAddress: string;
  mode: WeChatLinkMode;
  nonce: string;
  state: string;
  surface: WeChatNativeSurface;
};

type ExchangeOutcome =
  | { ok: true; session: WeChatSessionResult }
  | { code: WeChatErrorCode; ok: false; status: number };
type ExchangeFailure = Extract<ExchangeOutcome, { ok: false }>;

function digest(salt: string, value: string) {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function basicAuthorization(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

function isTokenShape(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 16_384 &&
    !/[\s\u0000-\u001f\u007f]/.test(value)
  );
}

async function readBoundedJson(response: Response) {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > outboundResponseLimit)
  ) {
    return null;
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
      if (total > outboundResponseLimit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return null;
  }
}

function safeBridgeFailure(status: number): ExchangeFailure {
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return { code: "code_invalid", ok: false, status: 401 };
  }
  if (status === 409) {
    return { code: "identity_conflict", ok: false, status: 409 };
  }
  if (status === 410) {
    return { code: "code_expired", ok: false, status: 401 };
  }
  if (status === 429) {
    return { code: "rate_limited", ok: false, status: 429 };
  }
  return { code: "backend_temporary", ok: false, status: 503 };
}

async function resolveExistingLinkActor(
  authorization: string,
  config: WeChatRuntimeConfig,
) {
  try {
    const response = await fetch(new URL("/auth/v1/user", config.supabaseUrl), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        apikey: config.supabasePublishableKey,
        Authorization: authorization,
      },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(outboundTimeoutMs),
    });
    if (!response.ok) return null;
    const body = (await readBoundedJson(response)) as { id?: unknown } | null;
    return typeof body?.id === "string" ? body.id : null;
  } catch {
    return null;
  }
}

async function audit(
  client: ChallengeRpcClient,
  input: {
    event: WeChatAuditEvent;
    result: "blocked" | "success";
    correlationId: string;
    subjectHash?: string;
    surface: WeChatNativeSurface;
    mode: WeChatLinkMode;
    reason?: WeChatErrorCode;
  },
) {
  const { error } = await client.rpc("wechat_auth_audit_v1", {
    p_actor_profile_id: null,
    p_correlation_id: input.correlationId,
    p_event_key: input.event,
    p_metadata_redacted: {
      mode: input.mode,
      reason: input.reason ?? null,
      surface: input.surface,
    },
    p_result: input.result,
    p_subject_hash: input.subjectHash ?? null,
  });
  return !error;
}

export async function issueWeChatChallenge(input: {
  config: WeChatRuntimeConfig;
  deviceId: string;
  ipAddress: string;
  mode: WeChatLinkMode;
  requestedNonce?: string;
  requestedState?: string;
  surface: WeChatNativeSurface;
}): Promise<
  | { ok: true; challenge: WeChatChallengeResult }
  | { code: WeChatErrorCode; ok: false; status: number }
> {
  const admin = createSupabaseAdminClient();
  if (!admin || !input.config.hashSalt) {
    return { code: "provider_not_configured", ok: false, status: 503 };
  }

  const state = input.requestedState ?? randomBytes(32).toString("base64url");
  const nonce = input.requestedNonce ?? randomBytes(32).toString("base64url");
  const correlationId = randomUUID();
  const { error } = await (admin as unknown as ChallengeRpcClient).rpc(
    "wechat_auth_challenge_issue_v1",
    {
      p_correlation_id: correlationId,
      p_device_hash: digest(input.config.hashSalt, input.deviceId),
      p_ip_hash: digest(input.config.hashSalt, input.ipAddress),
      p_mode: input.mode,
      p_nonce_hash: digest(input.config.hashSalt, nonce),
      p_state_hash: digest(input.config.hashSalt, state),
      p_surface: input.surface,
      p_ttl_seconds: challengeTtlSeconds,
    },
  );

  if (error) {
    return error.message?.includes("wechat_rate_limited")
      ? { code: "rate_limited", ok: false, status: 429 }
      : { code: "backend_temporary", ok: false, status: 503 };
  }

  return {
    challenge: {
      correlationId,
      expiresInSeconds: challengeTtlSeconds,
      nonce,
      state,
    },
    ok: true,
  };
}

export async function exchangeWeChatCode(
  input: ExchangeInput,
  config: WeChatRuntimeConfig,
): Promise<ExchangeOutcome> {
  const admin = createSupabaseAdminClient();
  if (
    !admin ||
    !config.bridgeExchangeUrl ||
    !config.bridgeClientId ||
    !config.bridgeClientSecret ||
    !config.hashSalt ||
    !config.supabaseUrl ||
    !config.supabasePublishableKey
  ) {
    return { code: "provider_not_configured", ok: false, status: 503 };
  }
  if (input.mode === "link" && !config.linkingEnabled) {
    return { code: "provider_not_configured", ok: false, status: 503 };
  }

  const rpcClient = admin as unknown as ChallengeRpcClient;
  const { data, error } = await rpcClient.rpc(
    "wechat_auth_challenge_consume_v1",
    {
      p_correlation_id: input.correlationId,
      p_device_hash: digest(config.hashSalt, input.deviceId),
      p_ip_hash: digest(config.hashSalt, input.ipAddress),
      p_mode: input.mode,
      p_nonce_hash: digest(config.hashSalt, input.nonce),
      p_state_hash: digest(config.hashSalt, input.state),
      p_surface: input.surface,
    },
  );

  if (error || data !== true) {
    // Invalid or replayed challenges are unauthenticated noise. Persisting one
    // append-only audit row for every miss would turn this public boundary into
    // an unbounded database-write primitive. Issued challenges are already
    // bounded and every post-consumption outcome remains audited below.
    return { code: "state_invalid", ok: false, status: 401 };
  }

  if (input.mode === "link" && !input.authorization?.startsWith("Bearer ")) {
    await audit(rpcClient, {
      correlationId: input.correlationId,
      event: "auth.wechat.exchange_blocked",
      mode: input.mode,
      reason: "session_expired",
      result: "blocked",
      surface: input.surface,
    });
    return { code: "session_expired", ok: false, status: 401 };
  }

  if (input.surface === "mini_program" && input.mode === "link") {
    return auditedFailure(rpcClient, {
      code: "identity_conflict",
      correlationId: input.correlationId,
      event: "auth.wechat.link_conflict",
      mode: input.mode,
      status: 409,
      surface: input.surface,
    });
  }

  let linkAttempt: {
    actorProfileId: string;
    attemptId: string;
    nonce: string;
  } | null = null;
  if (input.mode === "link" && input.authorization) {
    const actorProfileId = await resolveExistingLinkActor(
      input.authorization,
      config,
    );
    if (
      !actorProfileId ||
      !(await reconcileWeChatLinkAttempts(actorProfileId))
    ) {
      return auditedFailure(rpcClient, {
        code: "session_expired",
        correlationId: input.correlationId,
        mode: input.mode,
        status: 401,
        surface: input.surface,
      });
    }
    const attempt = await beginWeChatLinkAttempt({
      actorProfileId,
      config,
      correlationId: input.correlationId,
      nonce: input.nonce,
      surface: input.surface as "android" | "ios",
    });
    if (!attempt) {
      return auditedFailure(rpcClient, {
        code: "backend_temporary",
        correlationId: input.correlationId,
        mode: input.mode,
        status: 503,
        surface: input.surface,
      });
    }
    linkAttempt = { actorProfileId, ...attempt };
  }

  const failLink = async (code: string, conflict = false) => {
    if (!linkAttempt) return;
    await failWeChatLinkAttempt({
      actorProfileId: linkAttempt.actorProfileId,
      attemptId: linkAttempt.attemptId,
      conflict,
      failureCode: code,
    });
  };

  let bridgeResponse: Response;
  try {
    bridgeResponse = await fetch(config.bridgeExchangeUrl, {
      body: JSON.stringify({
        code: input.code,
        correlation_id: input.correlationId,
        nonce: input.nonce,
        surface: input.surface,
      }),
      headers: {
        Accept: "application/json",
        Authorization: basicAuthorization(
          config.bridgeClientId,
          config.bridgeClientSecret,
        ),
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(outboundTimeoutMs),
    });
  } catch {
    await failLink("bridge_unavailable");
    return auditedFailure(rpcClient, {
      code: "backend_temporary",
      correlationId: input.correlationId,
      mode: input.mode,
      status: 503,
      surface: input.surface,
    });
  }

  if (!bridgeResponse.ok) {
    const outcome = safeBridgeFailure(bridgeResponse.status);
    await failLink(
      outcome.code === "identity_conflict" ? "identity_conflict" : "bridge_rejected",
      outcome.code === "identity_conflict",
    );
    await audit(rpcClient, {
      correlationId: input.correlationId,
      event:
        outcome.code === "identity_conflict"
          ? "auth.wechat.link_conflict"
          : "auth.wechat.exchange_blocked",
      mode: input.mode,
      reason: outcome.code,
      result: "blocked",
      surface: input.surface,
    });
    return outcome;
  }

  const bridgeBody = (await readBoundedJson(bridgeResponse)) as {
    id_token?: unknown;
  } | null;
  if (!isTokenShape(bridgeBody?.id_token)) {
    await failLink("bridge_invalid_response");
    return auditedFailure(rpcClient, {
      code: "backend_temporary",
      correlationId: input.correlationId,
      mode: input.mode,
      status: 503,
      surface: input.surface,
    });
  }

  const tokenUrl = new URL("/auth/v1/token", config.supabaseUrl);
  tokenUrl.searchParams.set("grant_type", "id_token");
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(tokenUrl, {
      body: JSON.stringify({
        id_token: bridgeBody.id_token,
        link_identity: input.mode === "link",
        nonce: input.nonce,
        provider: config.oidcProvider,
      }),
      headers: {
        Accept: "application/json",
        apikey: config.supabasePublishableKey,
        ...(input.mode === "link" && input.authorization
          ? { Authorization: input.authorization }
          : {}),
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(outboundTimeoutMs),
    });
  } catch {
    await failLink("provider_unavailable");
    return auditedFailure(rpcClient, {
      code: "backend_temporary",
      correlationId: input.correlationId,
      mode: input.mode,
      status: 503,
      surface: input.surface,
    });
  }

  if (!tokenResponse.ok) {
    const outcome = safeBridgeFailure(tokenResponse.status);
    await failLink(
      outcome.code === "identity_conflict" ? "identity_conflict" : "provider_rejected",
      outcome.code === "identity_conflict",
    );
    await audit(rpcClient, {
      correlationId: input.correlationId,
      event:
        outcome.code === "identity_conflict"
          ? "auth.wechat.link_conflict"
          : "auth.wechat.exchange_blocked",
      mode: input.mode,
      reason: outcome.code,
      result: "blocked",
      surface: input.surface,
    });
    return outcome;
  }

  const body = (await readBoundedJson(tokenResponse)) as {
    access_token?: unknown;
    expires_at?: unknown;
    expires_in?: unknown;
    refresh_token?: unknown;
    token_type?: unknown;
    user?: { id?: unknown };
  } | null;
  if (
    !isTokenShape(body?.access_token) ||
    !isTokenShape(body?.refresh_token) ||
    typeof body?.expires_at !== "number" ||
    typeof body.expires_in !== "number" ||
    body.token_type !== "bearer" ||
    typeof body.user?.id !== "string"
  ) {
    await failLink("provider_invalid_response");
    return auditedFailure(rpcClient, {
      code: "backend_temporary",
      correlationId: input.correlationId,
      mode: input.mode,
      status: 503,
      surface: input.surface,
    });
  }

  if (linkAttempt) {
    if (body.user.id !== linkAttempt.actorProfileId) {
      await failLink("actor_mismatch", true);
      return auditedFailure(rpcClient, {
        code: "identity_conflict",
        correlationId: input.correlationId,
        event: "auth.wechat.link_conflict",
        mode: input.mode,
        status: 409,
        surface: input.surface,
      });
    }
    if (
      !(await finalizeWeChatLinkAttempt({
        actorProfileId: linkAttempt.actorProfileId,
        attemptId: linkAttempt.attemptId,
        config,
        nonce: linkAttempt.nonce,
      }))
    ) {
      return auditedFailure(rpcClient, {
        code: "backend_temporary",
        correlationId: input.correlationId,
        mode: input.mode,
        status: 503,
        surface: input.surface,
      });
    }
  }

  const miniSession =
    input.surface === "mini_program"
      ? await issueWeChatMiniSession({
          actorProfileId: body.user.id,
          config,
          correlationId: input.correlationId,
          deviceId: input.deviceId,
          supabaseAccessToken: body.access_token,
        })
      : null;
  if (input.surface === "mini_program" && !miniSession) {
    return auditedFailure(rpcClient, {
      code: "backend_temporary",
      correlationId: input.correlationId,
      mode: input.mode,
      status: 503,
      surface: input.surface,
    });
  }

  const auditRecorded = await audit(rpcClient, {
    correlationId: input.correlationId,
    event:
      input.mode === "link"
        ? "auth.wechat.link_succeeded"
        : "auth.wechat.exchange_succeeded",
    mode: input.mode,
    result: "success",
    subjectHash: digest(config.hashSalt, body.user.id),
    surface: input.surface,
  });
  if (!auditRecorded) {
    if (miniSession) {
      await revokeWeChatMiniSession({
        authorization: `Bearer ${miniSession.sessionToken}`,
        config,
        deviceId: input.deviceId,
      });
    }
    return { code: "backend_temporary", ok: false, status: 503 };
  }

  if (miniSession) {
    return { ok: true, session: miniSession };
  }

  return {
    ok: true,
    session: {
      accessToken: body.access_token,
      expiresAt: body.expires_at,
      expiresIn: body.expires_in,
      refreshToken: body.refresh_token,
      tokenType: "bearer",
      user: { id: body.user.id, provider: "custom:wechat" },
    },
  };
}
