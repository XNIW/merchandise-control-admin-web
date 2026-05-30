import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

type SupabaseBrowserConfig =
  | {
      status: "configured";
      url: string;
      publishableKey: string;
    }
  | {
      status: "not_configured";
    };

function resolveSupabaseBrowserConfig(): SupabaseBrowserConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return { status: "not_configured" };
  }

  return {
    status: "configured",
    url,
    publishableKey,
  };
}

export function createSupabaseBrowserClient() {
  const config = resolveSupabaseBrowserConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createBrowserClient<Database>(config.url, config.publishableKey, {
    global: {
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/browser-auth",
      },
    },
  });
}
