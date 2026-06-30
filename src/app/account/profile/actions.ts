"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountProfileActionState = {
  code: "idle" | "not_configured" | "success" | "unauthorized" | "update_failed";
  message: string;
  ok: boolean;
};

export const initialAccountProfileActionState: AccountProfileActionState = {
  code: "idle",
  message: "",
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
      message: "",
      ok: false,
    };
  }

  const { data, error: userError } = await supabase.auth.getUser();
  const email = data.user?.email;

  if (userError || !email) {
    return {
      code: "unauthorized",
      message: "",
      ok: false,
    };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  revalidatePath("/account/profile");

  if (error) {
    return {
      code: "update_failed",
      message: "",
      ok: false,
    };
  }

  return {
    code: "success",
    message: "",
    ok: true,
  };
}
