import "server-only";

import { randomUUID } from "node:crypto";

export const MAX_POS_JSON_BODY_BYTES = 16 * 1024;

const POS_JSON_HEADERS = {
  "Cache-Control": "no-store",
} as const;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SENSITIVE_REQUEST_ID_PATTERN =
  /(mcpos_(?:device|session)_|bearer|token|secret|password|credential|pin|access[_-]?token|refresh[_-]?token|eyJ)/i;

export type PosRouteRequestContext = {
  clientRequestId?: string;
  route: string;
  serverRequestId: string;
};

function safeRequestId(value: string | null) {
  const normalized = value?.trim() ?? "";

  if (!REQUEST_ID_PATTERN.test(normalized)) {
    return undefined;
  }

  return SENSITIVE_REQUEST_ID_PATTERN.test(normalized) ? undefined : normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requestHeaders(context?: PosRouteRequestContext) {
  if (!context) {
    return POS_JSON_HEADERS;
  }

  return {
    ...POS_JSON_HEADERS,
    "X-Request-Id": context.serverRequestId,
    ...(context.clientRequestId ? { "X-Client-Request-Id": context.clientRequestId } : {}),
  };
}

function withRequestId(body: unknown, context?: PosRouteRequestContext) {
  if (!context || !isPlainObject(body) || body.ok !== false) {
    return body;
  }

  return {
    ...body,
    ...(context.clientRequestId ? { clientRequestId: context.clientRequestId } : {}),
    requestId: context.serverRequestId,
  };
}

export function createPosRouteRequestContext(
  request: Request,
  route: string,
): PosRouteRequestContext {
  const clientRequestId =
    safeRequestId(request.headers.get("x-client-request-id")) ??
    safeRequestId(request.headers.get("x-request-id"));

  return {
    clientRequestId,
    route,
    serverRequestId: `posreq_${randomUUID()}`,
  };
}

function hasJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  return mediaType === "application/json";
}

function hasAllowedContentLength(request: Request, maxBytes: number) {
  const rawLength = request.headers.get("content-length");

  if (!rawLength) {
    return true;
  }

  const contentLength = Number(rawLength);

  return (
    Number.isFinite(contentLength) &&
    contentLength >= 0 &&
    contentLength <= maxBytes
  );
}

async function readLimitedBodyText(request: Request, maxBytes: number) {
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    receivedBytes += value.byteLength;

    if (receivedBytes > maxBytes) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const bodyBytes = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bodyBytes);
}

export async function readPosJsonBody(
  request: Request,
  options: { maxBytes?: number } = {},
) {
  const maxBytes = options.maxBytes ?? MAX_POS_JSON_BODY_BYTES;

  if (!hasJsonContentType(request) || !hasAllowedContentLength(request, maxBytes)) {
    return null;
  }

  const text = await readLimitedBodyText(request, maxBytes);

  if (text === null || text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function posJsonResponse(
  body: unknown,
  status: number,
  context?: PosRouteRequestContext,
) {
  return Response.json(withRequestId(body, context), {
    headers: requestHeaders(context),
    status,
  });
}

export function posMethodNotAllowedResponse(
  allowedMethods = "POST",
  context?: PosRouteRequestContext,
) {
  return Response.json(
    withRequestId({
      code: "method_not_allowed",
      message: "Method not allowed.",
      ok: false,
    }, context),
    {
      headers: {
        ...requestHeaders(context),
        Allow: allowedMethods,
      },
      status: 405,
    },
  );
}
