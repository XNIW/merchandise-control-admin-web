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

export function posJsonResponse(body: unknown, status: number) {
  return Response.json(body, {
    headers: POS_JSON_HEADERS,
    status,
  });
}

export function posMethodNotAllowedResponse(allowedMethods = "POST") {
  return Response.json(
    { error: "method_not_allowed" },
    {
      headers: {
        ...POS_JSON_HEADERS,
        Allow: allowedMethods,
      },
      status: 405,
    },
  );
}
