"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function parseCookieSource(cookieSource: string) {
  const cookies = new Map<string, string>();

  for (const part of cookieSource.split("; ")) {
    const separatorIndex = part.indexOf("=");
    const name = separatorIndex >= 0 ? part.slice(0, separatorIndex) : "";
    const rawValue = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : "";

    if (!name) {
      continue;
    }

    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }

  return cookies;
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

  return window.atob(padded);
}

function readChunkedCookieValue(
  cookies: Map<string, string>,
  storageKey: string,
) {
  const unchunkedValue = cookies.get(storageKey);

  if (unchunkedValue) {
    return unchunkedValue;
  }

  const chunks: string[] = [];

  for (let index = 0; ; index += 1) {
    const chunk = cookies.get(`${storageKey}.${index}`);

    if (!chunk) {
      break;
    }

    chunks.push(chunk);
  }

  return chunks.length > 0 ? chunks.join("") : null;
}

function decodeStoredSession(value: string) {
  if (!value.startsWith("base64-")) {
    return value;
  }

  return base64UrlDecode(value.slice(7));
}

function readSupabaseAccessTokenFromCookie(cookieSource: string) {
  const cookies = parseCookieSource(cookieSource);
  const storageKeys = new Set<string>();

  for (const name of cookies.keys()) {
    if (!name.startsWith("sb-") || !name.includes("auth-token")) {
      continue;
    }

    storageKeys.add(name.replace(/[.][0-9]+$/, ""));
  }

  for (const storageKey of storageKeys) {
    const value = readChunkedCookieValue(cookies, storageKey);

    if (!value) {
      continue;
    }

    try {
      const parsed = JSON.parse(decodeStoredSession(value)) as {
        access_token?: unknown;
      };

      if (typeof parsed.access_token === "string" && parsed.access_token) {
        return parsed.access_token;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function sessionExpiredResponse() {
  return new Response(
    JSON.stringify({
      code: "unauthorized",
      credentialGenerated: false,
      formError: "Master Console session expired. Refresh and sign in again.",
      message: "Master Console session expired. Refresh and sign in again.",
      ok: false,
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
    },
  );
}

export async function submitPlatformProvisioningForm(
  url: string,
  body: FormData,
  cookieSource = document.cookie,
) {
  const accessToken = await readPlatformProvisioningAccessToken(cookieSource);

  if (!accessToken) {
    return sessionExpiredResponse();
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  return window.fetch(url, {
    body,
    credentials: "same-origin",
    headers,
    method: "POST",
  });
}

export async function readPlatformProvisioningAccessToken(
  cookieSource = document.cookie,
) {
  const supabase = createSupabaseBrowserClient();
  const sessionResult = supabase ? await supabase.auth.getSession() : null;
  let accessToken = sessionResult?.data.session?.access_token ?? null;

  if (!accessToken) {
    accessToken = readSupabaseAccessTokenFromCookie(cookieSource);
  }

  return accessToken;
}
