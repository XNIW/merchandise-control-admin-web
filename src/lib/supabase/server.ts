import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

const supabaseServerEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

export type SupabaseServerEnvKey = (typeof supabaseServerEnvKeys)[number];

export type SupabaseServerConfig =
  | {
      status: "configured";
      url: string;
      publishableKey: string;
    }
  | {
      status: "not_configured";
      missing: readonly SupabaseServerEnvKey[];
      reason: string;
    };

export type SupabaseServerBoundaryStatus = {
  status: SupabaseServerConfig["status"];
  boundary: "server_only";
  dataAccess: "disabled" | "read_only_candidate";
  reason: string;
};

export type SupabaseServerClient = SupabaseClient<Database>;

export function resolveSupabaseServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseServerConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const values: Record<SupabaseServerEnvKey, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };

  const missing = supabaseServerEnvKeys.filter((key) => !values[key]);

  if (!url || !publishableKey) {
    return {
      status: "not_configured",
      missing,
      reason:
        "Supabase env names exist, but runtime values are not configured for Admin Web.",
    };
  }

  return {
    status: "configured",
    url,
    publishableKey,
  };
}

export async function createSupabaseServerClient(
  config: SupabaseServerConfig = resolveSupabaseServerConfig(),
): Promise<SupabaseServerClient | null> {
  if (config.status !== "configured") {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always persist refreshed cookies; middleware will own that path.
        }
      },
    },
    global: {
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/server-ssr",
      },
    },
  });
}

export function getSupabaseServerBoundaryStatus(
  config: SupabaseServerConfig = resolveSupabaseServerConfig(),
): SupabaseServerBoundaryStatus {
  if (config.status !== "configured") {
    return {
      status: "not_configured",
      boundary: "server_only",
      dataAccess: "disabled",
      reason: config.reason,
    };
  }

  return {
    status: "configured",
    boundary: "server_only",
    dataAccess: "read_only_candidate",
    reason:
      "Server SSR client can be constructed for read-only Platform Admin queries.",
  };
}
