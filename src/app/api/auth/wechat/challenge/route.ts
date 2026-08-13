import { NextResponse } from "next/server";
import {
  isWeChatLinkMode,
  isWeChatNativeSurface,
} from "@/lib/auth/wechat-contract";
import {
  isWeChatSurfaceReady,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";
import { issueWeChatChallenge } from "@/server/auth/wechat-exchange";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const deviceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base64UrlPattern = /^[A-Za-z0-9_-]{43,128}$/;
const requestBodyLimit = 4_096;
const trustedProxyIpPattern = /^[0-9a-f:.]{3,64}$/i;

async function readBoundedBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return { status: "unsupported_media_type" as const };
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > requestBodyLimit)
  ) {
    return { status: "too_large" as const };
  }
  if (!request.body) return { status: "invalid" as const };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > requestBodyLimit) {
        await reader.cancel().catch(() => undefined);
        return { status: "too_large" as const };
      }
      chunks.push(value);
    }
  } catch {
    return { status: "invalid" as const };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { status: "ok" as const, value: JSON.parse(text) as unknown };
  } catch {
    return { status: "invalid" as const };
  }
}

function clientIp(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.WECHAT_TRUST_CLOUDFLARE_CONNECTING_IP !== "true") {
    return "untrusted_ingress";
  }
  const candidate = request.headers.get("cf-connecting-ip")?.trim();
  return candidate && trustedProxyIpPattern.test(candidate)
    ? candidate
    : "untrusted_ingress";
}

export async function POST(request: Request) {
  const parsed = await readBoundedBody(request);
  if (parsed.status === "too_large") {
    return NextResponse.json(
      { code: "body_too_large", ok: false },
      { status: 413 },
    );
  }
  if (parsed.status === "unsupported_media_type") {
    return NextResponse.json(
      { code: "validation_failed", ok: false },
      { status: 415 },
    );
  }
  const body =
    parsed.status === "ok" &&
    parsed.value !== null &&
    typeof parsed.value === "object" &&
    !Array.isArray(parsed.value)
      ? (parsed.value as Record<string, unknown>)
      : null;
  if (
    !body ||
    !isWeChatNativeSurface(body.surface) ||
    !isWeChatLinkMode(body.mode) ||
    typeof body.deviceId !== "string" ||
    !deviceIdPattern.test(body.deviceId) ||
    ((body.state === undefined) !== (body.nonce === undefined)) ||
    (body.state !== undefined &&
      (typeof body.state !== "string" || !base64UrlPattern.test(body.state))) ||
    (body.nonce !== undefined &&
      (typeof body.nonce !== "string" || !base64UrlPattern.test(body.nonce)))
  ) {
    return NextResponse.json(
      { code: "state_invalid", ok: false },
      { status: 400 },
    );
  }

  const config = resolveWeChatRuntimeConfig();
  if (
    !isWeChatSurfaceReady(body.surface, config) ||
    (body.mode === "link" && !config.linkingEnabled)
  ) {
    return NextResponse.json(
      { code: "provider_not_configured", ok: false },
      { status: 503 },
    );
  }

  const outcome = await issueWeChatChallenge({
    config,
    deviceId: body.deviceId,
    ipAddress: clientIp(request),
    mode: body.mode,
    requestedNonce: typeof body.nonce === "string" ? body.nonce : undefined,
    requestedState: typeof body.state === "string" ? body.state : undefined,
    surface: body.surface,
  });
  return NextResponse.json(outcome, {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: outcome.ok ? 200 : outcome.status,
  });
}
