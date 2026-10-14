import "server-only";

import { randomBytes, randomInt } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveMiniDirectConfig } from "./wechat-mini-direct-config";
import {
  miniCapability,
  miniHash,
  miniObject,
  miniUuid,
} from "./wechat-mini-direct";

export async function miniAdminAction(
  request: Request,
  body: Record<string, unknown>,
) {
  const config = resolveMiniDirectConfig();
  const fail = (code: string) => ({ ok: false as const, code });
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    (request.headers.has("sec-fetch-site") &&
      request.headers.get("sec-fetch-site") !== "same-origin")
  )
    return fail("permission_denied");
  const client = await createSupabaseServerClient();
  if (!client) return fail("provider_not_configured");
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) return fail("permission_denied");
  // These calls retain the actual user's JWT and session_id; never service role.
  const rpc = async (name: string, params: Record<string, unknown> = {}) => {
    const response = await client.rpc(name as never, params as never);
    return response.error ? null : (response.data as unknown);
  };
  if (body.action === "list") {
    const mappings = await rpc("wechat_mini_mappings_v1");
    return Array.isArray(mappings)
      ? { ok: true as const, mappings }
      : fail("session_expired");
  }
  if (
    body.action === "unlink" &&
    body.consent === true &&
    typeof body.mappingId === "string" &&
    miniUuid.test(body.mappingId)
  ) {
    return (await rpc("wechat_mini_mapping_unlink_v1", {
      p_mapping_id: body.mappingId,
    })) === true
      ? { ok: true as const, state: "unlinked" }
      : fail("session_expired");
  }
  if (body.action === "start" && body.consent === true) {
    if (
      !config.enrollmentReady ||
      !config.common.miniAllowedProfileIds.includes(auth.user.id.toLowerCase())
    )
      return fail("provider_not_configured");
    const transferCode = randomBytes(32).toString("base64url");
    const adminCapability = randomBytes(32).toString("base64url");
    const result = await rpc("wechat_mini_pair_start_v1", {
      p_app_id: config.appId,
      p_transfer_hash: miniHash(
        config.common.hashSalt,
        "transfer",
        transferCode,
      ),
      p_admin_hash: miniHash(
        config.common.hashSalt,
        "pair-admin",
        adminCapability,
      ),
      p_comparison: String(randomInt(100_000_000)).padStart(8, "0"),
    });
    if (
      !miniObject(result) ||
      result.ok !== true ||
      typeof result.pairing_id !== "string" ||
      !miniUuid.test(result.pairing_id)
    )
      return fail("pairing_invalid");
    return {
      ok: true as const,
      pairingId: result.pairing_id,
      expiresAt: result.expires_at,
      transferCode,
      adminCapability,
    };
  }
  if (
    ["status", "approve", "cancel"].includes(String(body.action)) &&
    typeof body.pairingId === "string" &&
    miniUuid.test(body.pairingId) &&
    typeof body.adminCapability === "string" &&
    miniCapability.test(body.adminCapability) &&
    (body.action !== "approve" || body.consent === true)
  ) {
    if (
      !config.enrollmentReady ||
      !config.common.miniAllowedProfileIds.includes(auth.user.id.toLowerCase())
    )
      return fail("provider_not_configured");
    const result = await rpc("wechat_mini_pair_admin_v1", {
      p_pairing_id: body.pairingId,
      p_admin_hash: miniHash(
        config.common.hashSalt,
        "pair-admin",
        body.adminCapability,
      ),
      p_action: body.action,
    });
    if (miniObject(result) && result.ok === true) return result;
    if (miniObject(result) && result.code === "pairing_expired")
      return fail("pairing_expired");
  }
  return fail("pairing_invalid");
}
