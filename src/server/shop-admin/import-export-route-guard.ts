import "server-only";

import { MAX_IMPORT_BYTES } from "./import-export-readiness";

type CatalogImportInvalidRequestCode =
  | "file_too_large"
  | "invalid_content_type"
  | "invalid_origin"
  | "invalid_request_body";

function noStoreJson(
  body: Record<string, unknown>,
  init: {
    status: number;
  },
) {
  return Response.json(body, {
    status: init.status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function invalidCatalogImportRequest(
  requestCode: CatalogImportInvalidRequestCode,
  status: number,
) {
  const message =
    requestCode === "file_too_large"
      ? "The workbook is larger than the allowed import limit."
      : "Invalid catalog import request.";

  return noStoreJson(
    {
      code: requestCode === "file_too_large" ? "file_too_large" : "validation_failed",
      message,
      ok: false,
      requestCode,
    },
    { status },
  );
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function requestHost(request: Request) {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = firstHeaderValue(request.headers.get("host"));

  return forwardedHost ?? host ?? new URL(request.url).host;
}

function isMultipartFormData(contentType: string | null) {
  return contentType?.toLowerCase().startsWith("multipart/form-data") ?? false;
}

function parseContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function isSameOriginRequest(request: Request) {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();

  if (secFetchSite === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === requestHost(request);
  } catch {
    return false;
  }
}

export function guardCatalogImportExportPostRequest(request: Request) {
  if (!isSameOriginRequest(request)) {
    return invalidCatalogImportRequest("invalid_origin", 403);
  }

  if (!isMultipartFormData(request.headers.get("content-type"))) {
    return invalidCatalogImportRequest("invalid_content_type", 415);
  }

  const contentLength = parseContentLength(request.headers.get("content-length"));

  if (
    contentLength === null ||
    Number.isNaN(contentLength) ||
    contentLength > MAX_IMPORT_BYTES
  ) {
    return invalidCatalogImportRequest(
      contentLength !== null && contentLength > MAX_IMPORT_BYTES
        ? "file_too_large"
        : "invalid_request_body",
      413,
    );
  }

  return null;
}

export function guardCatalogImportWorkbookFile(file: File) {
  return file.size > MAX_IMPORT_BYTES
    ? invalidCatalogImportRequest("file_too_large", 413)
    : null;
}
