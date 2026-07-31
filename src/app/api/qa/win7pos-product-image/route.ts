import { NextResponse } from "next/server";
import { handleTask150BoundaryRequest } from "@/server/qa/task-150-win7pos-image-boundary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
    status,
  });
}

async function readBoundedUtf8Body(request: Request) {
  if (!request.body) return { bodyBytes: 0, raw: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bodyBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bodyBytes += value.byteLength;
      if (bodyBytes > MAX_BODY_BYTES) {
        await reader.cancel("TASK-150 input limit exceeded");
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(bodyBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bodyBytes, raw: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const mediaType = contentType.split(";", 1)[0].trim();
  if (mediaType !== "application/json") {
    return response({ ok: false, code: "validation_failed" }, 415);
  }
  const declaredLengthHeader = request.headers.get("content-length");
  const declaredLength = Number(declaredLengthHeader ?? "0");
  if (
    !Number.isSafeInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_BODY_BYTES
  ) {
    return response({ ok: false, code: "validation_failed" }, 413);
  }
  let bounded: Awaited<ReturnType<typeof readBoundedUtf8Body>>;
  try {
    bounded = await readBoundedUtf8Body(request);
  } catch {
    return response({ ok: false, code: "validation_failed" }, 400);
  }
  if (!bounded) {
    return response({ ok: false, code: "validation_failed" }, 413);
  }
  const { bodyBytes, raw } = bounded;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return response({ ok: false, code: "validation_failed" }, 400);
  }
  const url = new URL(request.url);
  const result = await handleTask150BoundaryRequest({
    baseUrl: url.origin,
    body,
    bodyBytes,
    host: request.headers.get("host") ?? url.host,
  });
  return response(result.body, result.status);
}

function methodNotAllowed() {
  return response({ ok: false, code: "method_not_allowed" }, 405);
}

export {
  methodNotAllowed as DELETE,
  methodNotAllowed as GET,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS,
  methodNotAllowed as PATCH,
  methodNotAllowed as PUT,
};
