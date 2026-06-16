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

export type SupabaseRuntimeTargetDiagnostic = {
  projectRef: string;
  runtimeSource: ".env.local cloud" | "local supabase status" | "runtime env";
  targetClass: "cloud" | "local" | "not_configured" | "unknown";
};

export type SupabaseServerClient = SupabaseClient<Database>;

function redactProjectRef(value?: string) {
  const normalized = value?.trim();

  if (!normalized) {
    return "not_configured";
  }

  if (normalized.length <= 7) {
    return "redacted";
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-3)}`;
}

function projectRefFromUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const hostname = new URL(value).hostname;
    const [ref] = hostname.split(".");

    return ref;
  } catch {
    return undefined;
  }
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

export function getSupabaseRuntimeTargetDiagnostic(
  config: SupabaseServerConfig = resolveSupabaseServerConfig(),
  env: NodeJS.ProcessEnv = process.env,
): SupabaseRuntimeTargetDiagnostic {
  if (config.status !== "configured") {
    return {
      projectRef: "not_configured",
      runtimeSource: "runtime env",
      targetClass: "not_configured",
    };
  }

  try {
    const hostname = new URL(config.url).hostname;
    const targetClass = isLocalHostname(hostname)
      ? "local"
      : hostname.endsWith(".supabase.co")
        ? "cloud"
        : "unknown";
    const projectRef = env.SUPABASE_PROJECT_REF?.trim() || projectRefFromUrl(config.url);
    const runtimeSource =
      env.TEST_TARGET === "local"
        ? "local supabase status"
        : env.TEST_TARGET === "cloud"
          ? ".env.local cloud"
          : "runtime env";

    return {
      projectRef: redactProjectRef(projectRef),
      runtimeSource,
      targetClass,
    };
  } catch {
    return {
      projectRef: "not_configured",
      runtimeSource: "runtime env",
      targetClass: "unknown",
    };
  }
}

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
