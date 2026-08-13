import {
  WECHAT_CATALOG_MUTATION_BODY_LIMIT,
  callWeChatCatalogMutation,
  isMiniProgramCatalogMutationReady,
  parseWeChatCatalogMutationInput,
  parseWeChatMutationHeaders,
} from "@/server/wechat/catalog-mutation-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

function json(body: Record<string, unknown>, status: number, correlationId?: string) {
  return Response.json(body, {
    headers: {
      ...RESPONSE_HEADERS,
      ...(correlationId ? { "X-Correlation-ID": correlationId } : {}),
    },
    status,
  });
}

async function readBoundedJson(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  ) {
    return { status: "unsupported_media_type" as const };
  }
  const length = request.headers.get("content-length");
  if (
    length &&
    (!Number.isSafeInteger(Number(length)) ||
      Number(length) < 0 ||
      Number(length) > WECHAT_CATALOG_MUTATION_BODY_LIMIT)
  ) {
    return { status: "too_large" as const };
  }
  if (!request.body) return { status: "invalid" as const };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > WECHAT_CATALOG_MUTATION_BODY_LIMIT) {
      await reader.cancel();
      return { status: "too_large" as const };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      status: "ok" as const,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ) as unknown,
    };
  } catch {
    return { status: "invalid" as const };
  }
}

export async function POST(request: Request) {
  const identifiers = parseWeChatMutationHeaders(request.headers);
  if (!identifiers) return json({ code: "validation_failed", ok: false }, 400);

  if (!isMiniProgramCatalogMutationReady()) {
    return json(
      { code: "provider_not_configured", ok: false },
      503,
      identifiers.correlationId,
    );
  }

  const parsedBody = await readBoundedJson(request);
  if (parsedBody.status === "unsupported_media_type") {
    return json(
      { code: "unsupported_media_type", ok: false },
      415,
      identifiers.correlationId,
    );
  }
  if (parsedBody.status === "too_large") {
    return json(
      { code: "payload_too_large", ok: false },
      413,
      identifiers.correlationId,
    );
  }
  const mutation =
    parsedBody.status === "ok"
      ? parseWeChatCatalogMutationInput(parsedBody.value)
      : null;
  if (!mutation) {
    return json(
      { code: "validation_failed", ok: false },
      400,
      identifiers.correlationId,
    );
  }

  const result = await callWeChatCatalogMutation({
    authorization: request.headers.get("authorization"),
    correlationId: identifiers.correlationId,
    deviceId: request.headers.get("x-wechat-device-id"),
    idempotencyKey: identifiers.idempotencyKey,
    mutation,
  });
  return json(result.body, result.status, identifiers.correlationId);
}

function methodNotAllowed() {
  return Response.json(
    { code: "method_not_allowed", ok: false },
    { headers: { ...RESPONSE_HEADERS, Allow: "POST" }, status: 405 },
  );
}

export {
  methodNotAllowed as DELETE,
  methodNotAllowed as GET,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS,
  methodNotAllowed as PATCH,
  methodNotAllowed as PUT,
};
