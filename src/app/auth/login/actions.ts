"use server";

import { headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountSignInState = {
  message: string;
  status: "idle" | "blocked";
};

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

function isSafeInternalNextPath(value: string | null): value is string {
  return Boolean(value?.startsWith("/") && !value.startsWith("//"));
}

function nextPathFromForm(formData: FormData) {
  const requested = value(formData, "next");

  return isSafeInternalNextPath(requested) ? requested : "/";
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function safeHttpOrigin(value: string | null) {
  const origin = firstHeaderValue(value);

  if (!origin) {
    return "";
  }

  try {
    const parsed = new URL(origin);

    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin
      : "";
  } catch {
    return "";
  }
}

async function requestOrigin() {
  const headerStore = await headers();
  const origin = safeHttpOrigin(headerStore.get("origin"));

  if (origin) {
    return origin;
  }

  const forwardedProto = firstHeaderValue(headerStore.get("x-forwarded-proto"));
  const proto =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : "http";
  const host = firstHeaderValue(
    headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
  );

  return safeHttpOrigin(host ? `${proto}://${host}` : null);
}

function loginResultUrl(nextPath: string, result: string) {
  const params = new URLSearchParams({
    mode: "admin-account",
    next: nextPath,
    result,
  });

  return `/auth/login?${params.toString()}`;
}

function blocked(message: string): AccountSignInState {
  return {
    message,
    status: "blocked",
  };
}

export async function accountSignInAction(
  _previousState: AccountSignInState,
  formData: FormData,
): Promise<AccountSignInState> {
  const nextPath = nextPathFromForm(formData);
  const email = value(formData, "email").trim();
  const password = value(formData, "password");

  if (!email || !password) {
    return blocked("Email and password are required.");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return blocked("Supabase runtime is not configured for server sign-in.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return blocked("Sign-in was blocked. Check the account and try again.");
  }

  redirect(nextPath, RedirectType.replace);
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  const nextPath = nextPathFromForm(formData);
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(
      loginResultUrl(nextPath, "oauth_not_configured"),
      RedirectType.replace,
    );
  }

  const origin = await requestOrigin();

  if (!origin) {
    redirect(
      loginResultUrl(nextPath, "oauth_origin_missing"),
      RedirectType.replace,
    );
  }

  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", nextPath);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    redirect(loginResultUrl(nextPath, "oauth_blocked"), RedirectType.replace);
  }

  redirect(data.url, RedirectType.replace);
}
