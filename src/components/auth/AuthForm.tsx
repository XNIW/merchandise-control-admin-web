"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthFormProps = {
  isConfigured: boolean;
};

type AuthState = "idle" | "pending" | "success" | "blocked";

function isSafeInternalNextPath(value: string | null): value is string {
  return Boolean(value?.startsWith("/") && !value.startsWith("//"));
}

export function AuthForm({ isConfigured }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<AuthState>("idle");
  const [message, setMessage] = useState("");
  const nextPath = useMemo(() => {
    const requested = searchParams.get("next");

    return isSafeInternalNextPath(requested) ? requested : "/";
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConfigured) {
      setState("blocked");
      setMessage("Supabase runtime is not configured for browser sign-in.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setState("blocked");
      setMessage("Email and password are required.");
      return;
    }

    const supabase = createSupabaseBrowserClient();

    if (!supabase) {
      setState("blocked");
      setMessage("Supabase browser auth is unavailable.");
      return;
    }

    setState("pending");
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setState("blocked");
      setMessage("Sign-in was blocked. Check the account and try again.");
      return;
    }

    setState("success");
    setMessage("Signed in. Opening requested console.");
    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="grid gap-4"
      aria-label="Admin account sign in"
    >
      <div className="grid gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-slate-800">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
        />
      </div>

      <div className="grid gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-slate-800"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
        />
      </div>

      <button
        type="submit"
        disabled={state === "pending" || !isConfigured}
        className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
      >
        {state === "pending" ? "Signing in" : "Sign in"}
      </button>

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={[
            "rounded-md border px-3 py-2 text-sm",
            state === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800",
          ].join(" ")}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
