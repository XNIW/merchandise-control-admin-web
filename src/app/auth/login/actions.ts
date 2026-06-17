"use server";

import { headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import {
  buildOAuthCallbackUrl,
  hasInvalidGoogleOAuthClientIdLocation,
  hasMisconfiguredOAuthRedirectUrl,
  isOAuthProviderNotEnabledBody,
  isGoogleOAuthAccountsLocation,
  loginResultUrl,
  requestOriginFromHeaders,
  safeInternalNextPath,
} from "@/lib/auth/oauth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountSignInState = {
  message: string;
  status: "idle" | "blocked";
};

function value(formData: FormData, key: string) {
  const raw = formData.get(key);

  return typeof raw === "string" ? raw : "";
}

function nextPathFromForm(formData: FormData) {
  const requested = value(formData, "next");

  return safeInternalNextPath(requested);
}

async function requestOrigin() {
  const headerStore = await headers();

  return requestOriginFromHeaders(headerStore);
}

function blocked(message: string): AccountSignInState {
  return {
    message,
    status: "blocked",
  };
}

const oauthAuthorizeProbeTimeoutMs = 3_000;

async function probeOAuthAuthorizeUrl(oauthUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, oauthAuthorizeProbeTimeoutMs);

  try {
    const response = await fetch(oauthUrl, {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!isGoogleOAuthAccountsLocation(location)) {
        return "blocked";
      }

      if (hasInvalidGoogleOAuthClientIdLocation(location)) {
        return "client_id_invalid";
      }

      return "redirect";
    }

    if (response.status === 400) {
      const body = await response.text();

      return isOAuthProviderNotEnabledBody(body)
        ? "provider_not_enabled"
        : "blocked";
    }

    return response.status >= 400 ? "blocked" : "passthrough";
  } catch {
    return "blocked";
  } finally {
    clearTimeout(timeout);
  }
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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: buildOAuthCallbackUrl(origin, nextPath),
    },
  });

  if (error || !data.url) {
    redirect(loginResultUrl(nextPath, "oauth_blocked"), RedirectType.replace);
  }

  if (hasMisconfiguredOAuthRedirectUrl(data.url, origin)) {
    redirect(
      loginResultUrl(nextPath, "oauth_redirect_misconfigured"),
      RedirectType.replace,
    );
  }

  const authorizeProbe = await probeOAuthAuthorizeUrl(data.url);

  if (authorizeProbe === "client_id_invalid") {
    redirect(
      loginResultUrl(nextPath, "oauth_google_client_id_invalid"),
      RedirectType.replace,
    );
  }

  if (authorizeProbe === "provider_not_enabled") {
    redirect(
      loginResultUrl(nextPath, "oauth_provider_not_enabled"),
      RedirectType.replace,
    );
  }

  if (authorizeProbe === "blocked") {
    redirect(loginResultUrl(nextPath, "oauth_blocked"), RedirectType.replace);
  }

  redirect(data.url, RedirectType.replace);
}
