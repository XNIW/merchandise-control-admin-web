"use server";

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
