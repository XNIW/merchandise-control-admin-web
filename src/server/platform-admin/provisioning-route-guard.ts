import "server-only";

import { NextResponse } from "next/server";

const maxProvisioningBodyBytes = 64 * 1024;
const allowedProvisioningContentTypes = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
] as const;

type ProvisioningInvalidRequestCode =
  | "invalid_content_type"
  | "invalid_origin"
  | "invalid_request_body";

function redactedInvalidRequestBody(code: ProvisioningInvalidRequestCode) {
  return {
    code: "validation_failed",
    credentialGenerated: false,
    formError: "Invalid provisioning request.",
    message: "Invalid provisioning request.",
    ok: false,
    requestCode: code,
  };
}

export function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function requestHost(request: Request) {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = firstHeaderValue(request.headers.get("host"));

  return forwardedHost ?? host ?? new URL(request.url).host;
}

function isAllowedFormContentType(contentType: string | null) {
  const normalized = contentType?.toLowerCase() ?? "";

  return allowedProvisioningContentTypes.some((allowed) =>
    normalized.startsWith(allowed),
  );
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

export function guardPlatformProvisioningPostRequest(request: Request) {
  if (!isSameOriginRequest(request)) {
    return noStoreJson(redactedInvalidRequestBody("invalid_origin"), {
      status: 403,
    });
  }

  if (!isAllowedFormContentType(request.headers.get("content-type"))) {
    return noStoreJson(redactedInvalidRequestBody("invalid_content_type"), {
      status: 415,
    });
  }

  const contentLength = parseContentLength(request.headers.get("content-length"));

  if (
    contentLength === null ||
    Number.isNaN(contentLength) ||
    contentLength > maxProvisioningBodyBytes
  ) {
    return noStoreJson(redactedInvalidRequestBody("invalid_request_body"), {
      status: 413,
    });
  }

  return null;
}
