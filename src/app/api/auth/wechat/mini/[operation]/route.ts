import { NextResponse } from "next/server";
import {
  claimMiniPairing,
  confirmMiniPairing,
  createMiniDirectChallenge,
  exchangeMiniDirect,
  miniObject,
} from "@/server/auth/wechat-mini-direct";
import { miniAdminAction } from "@/server/auth/wechat-mini-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function bodyObject(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json" ||
    !request.body
  )
    return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timeout = setTimeout(() => {
    void reader.cancel().catch(() => undefined);
  }, 5_000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4_096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
    return miniObject(value) ? value : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
  };
  try {
    const { operation } = await context.params;
    const body = await bodyObject(request);
    if (!body)
      return NextResponse.json(
        { ok: false, code: "validation_failed" },
        { status: 400, headers },
      );
    const handler = {
      challenge: createMiniDirectChallenge,
      exchange: exchangeMiniDirect,
      "pair-claim": claimMiniPairing,
      "pair-confirm": confirmMiniPairing,
    }[operation];
    const result =
      operation === "admin"
        ? await miniAdminAction(request, body)
        : handler
          ? await handler(body)
          : { ok: false, code: "validation_failed" };
    const status =
      result.ok === true
        ? 200
        : "code" in result && result.code === "provider_not_configured"
          ? 503
          : 400;
    return NextResponse.json(
      operation === "exchange" && result.ok === true && "session" in result
        ? result.session
        : result,
      { status, headers },
    );
  } catch {
    // No request, upstream error, credential or capability reaches framework logs.
    return NextResponse.json(
      { ok: false, code: "backend_temporary" },
      { status: 503, headers },
    );
  }
}
