"use server";

import { headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import {
  buildOAuthCallbackUrl,
  hasMisconfiguredOAuthRedirectUrl,
  loginResultUrl,
  requestOriginFromHeaders,
  safeInternalNextPath,
} from "@/lib/auth/oauth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountSignInState = {
  code:
    | "auth_not_configured"
    | "idle"
    | "sign_in_blocked"
    | "validation_failed";
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

function blocked(code: AccountSignInState["code"]): AccountSignInState {
  return {
    code,
    message: "",
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
    return blocked("validation_failed");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return blocked("auth_not_configured");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return blocked("sign_in_blocked");
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

  redirect(data.url, RedirectType.replace);
}
