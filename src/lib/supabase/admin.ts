import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseAdminEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type SupabaseAdminEnvKey = (typeof supabaseAdminEnvKeys)[number];

export type SupabaseAdminConfig =
  | {
      serviceRoleKey: string;
      status: "configured";
      url: string;
    }
  | {
      missing: readonly SupabaseAdminEnvKey[];
      reason: string;
      status: "not_configured";
    };

export type SupabaseAdminClient = SupabaseClient<Database>;

export function resolveSupabaseAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseAdminConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const values: Record<SupabaseAdminEnvKey, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
  const missing = supabaseAdminEnvKeys.filter((key) => !values[key]);

  if (!url || !serviceRoleKey) {
    return {
      missing,
      reason:
        "Supabase admin env names exist, but runtime values are not configured for POS backend endpoints.",
      status: "not_configured",
    };
  }

  return {
    serviceRoleKey,
    status: "configured",
    url,
  };
}

export function createSupabaseAdminClient(
  config: SupabaseAdminConfig = resolveSupabaseAdminConfig(),
): SupabaseAdminClient | null {
  if (config.status !== "configured") {
    return null;
  }

  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "merchandise-control-admin-web/pos-server",
      },
    },
  });
}
