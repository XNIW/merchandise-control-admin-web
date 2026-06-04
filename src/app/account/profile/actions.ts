"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountProfileActionState = {
  code: "not_configured" | "success" | "unauthorized" | "update_failed";
  message: string;
  ok: boolean;
};

export const initialAccountProfileActionState: AccountProfileActionState = {
  code: "success",
  message: "Action ready.",
  ok: true,
};

export async function sendPasswordResetEmailAction(
  _previousState: AccountProfileActionState,
): Promise<AccountProfileActionState> {
  void _previousState;

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      code: "not_configured",
      message: "Supabase Auth is not configured in this runtime.",
      ok: false,
    };
  }

  const { data, error: userError } = await supabase.auth.getUser();
  const email = data.user?.email;

  if (userError || !email) {
    return {
      code: "unauthorized",
      message: "Sign in with a personal admin account before requesting a reset.",
      ok: false,
    };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  revalidatePath("/account/profile");

  if (error) {
    return {
      code: "update_failed",
      message: "Password reset email could not be sent.",
      ok: false,
    };
  }

  return {
    code: "success",
    message: "Password reset email requested for the current account.",
    ok: true,
  };
}
