import "server-only";

export const MAX_POS_JSON_BODY_BYTES = 16 * 1024;

const POS_JSON_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function hasJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();

  return mediaType === "application/json";
}

function hasAllowedContentLength(request: Request) {
  const rawLength = request.headers.get("content-length");

  if (!rawLength) {
    return true;
  }

  const contentLength = Number(rawLength);

  return (
    Number.isFinite(contentLength) &&
    contentLength >= 0 &&
    contentLength <= MAX_POS_JSON_BODY_BYTES
  );
}

async function readLimitedBodyText(request: Request) {
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

    if (receivedBytes > MAX_POS_JSON_BODY_BYTES) {
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

export async function readPosJsonBody(request: Request) {
  if (!hasJsonContentType(request) || !hasAllowedContentLength(request)) {
    return null;
  }

  const text = await readLimitedBodyText(request);

  if (text === null || text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function posJsonResponse(body: unknown, status: number) {
  return Response.json(body, {
    headers: POS_JSON_HEADERS,
    status,
  });
}
