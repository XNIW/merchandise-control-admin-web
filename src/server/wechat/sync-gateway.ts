import "server-only";

import { resolveWeChatRuntimeConfig } from "@/server/auth/wechat-config";
import {
  callTrustedWeChatRpc,
  resolveWeChatMiniSession,
} from "@/server/auth/wechat-mini-session";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cursorPattern = /^(0|[1-9][0-9]{0,18})$/;
const scopePattern = /^[0-9a-f]{64}$/;

type SyncResult =
  | { data: Record<string, unknown>; ok: true; status: 200 }
  | {
      code: "backend_temporary" | "session_expired" | "validation_failed";
      ok: false;
      status: 400 | 401 | 503;
    };

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function actor(input: {
  authorization: string | null;
  deviceId: string | null;
}) {
  return resolveWeChatMiniSession({
    authorization: input.authorization,
    config: resolveWeChatRuntimeConfig(),
    deviceId: input.deviceId,
  });
}

export async function getWeChatMiniSyncCheckpoint(input: {
  afterId: string;
  authorization: string | null;
  deviceId: string | null;
  expectedScopeKey: string | null;
  lastReconciledAt: string | null;
  shopId: string;
}): Promise<SyncResult> {
  if (
    !uuidPattern.test(input.shopId) ||
    !cursorPattern.test(input.afterId) ||
    (input.expectedScopeKey !== null &&
      !scopePattern.test(input.expectedScopeKey)) ||
    (input.lastReconciledAt !== null &&
      (!Number.isFinite(Date.parse(input.lastReconciledAt)) ||
        input.lastReconciledAt.length > 64))
  ) {
    return { code: "validation_failed", ok: false, status: 400 };
  }
  const session = await actor(input);
  if (!session.ok) {
    return {
      code: session.code,
      ok: false,
      status: session.code === "session_expired" ? 401 : 503,
    };
  }
  const data = await callTrustedWeChatRpc("wechat_mini_sync_checkpoint_v1", {
    p_actor_profile_id: session.actorProfileId,
    p_after_id: input.afterId,
    p_device_identifier: input.deviceId,
    p_expected_scope_key: input.expectedScopeKey,
    p_last_reconciled_at: input.lastReconciledAt,
    p_shop_id: input.shopId,
  });
  if (
    !object(data) ||
    data.schemaVersion !== "wechat-mini-sync-checkpoint-v1" ||
    data.shopId !== input.shopId ||
    typeof data.eventMaxId !== "string" ||
    !cursorPattern.test(data.eventMaxId) ||
    typeof data.scopeKey !== "string" ||
    !scopePattern.test(data.scopeKey)
  ) {
    return { code: "backend_temporary", ok: false, status: 503 };
  }
  return { data, ok: true, status: 200 };
}

export async function getWeChatMiniSyncDelta(input: {
  afterId: string;
  authorization: string | null;
  deviceId: string | null;
  eventMaxId: string;
  limit: number;
  scopeKey: string;
  shopId: string;
}): Promise<SyncResult> {
  if (
    !uuidPattern.test(input.shopId) ||
    !cursorPattern.test(input.afterId) ||
    !cursorPattern.test(input.eventMaxId) ||
    !scopePattern.test(input.scopeKey) ||
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 50
  ) {
    return { code: "validation_failed", ok: false, status: 400 };
  }
  const session = await actor(input);
  if (!session.ok) {
    return {
      code: session.code,
      ok: false,
      status: session.code === "session_expired" ? 401 : 503,
    };
  }
  const data = await callTrustedWeChatRpc(
    "wechat_mini_sync_delta_v1",
    {
      p_actor_profile_id: session.actorProfileId,
      p_after_id: input.afterId,
      p_device_identifier: input.deviceId,
      p_expected_event_max_id: input.eventMaxId,
      p_expected_scope_key: input.scopeKey,
      p_limit: input.limit,
      p_shop_id: input.shopId,
    },
    6_000,
    262_144,
  );
  if (
    !object(data) ||
    data.schemaVersion !== "wechat-mini-sync-delta-v1" ||
    data.shopId !== input.shopId ||
    !Array.isArray(data.rows)
  ) {
    return { code: "backend_temporary", ok: false, status: 503 };
  }
  return { data, ok: true, status: 200 };
}
