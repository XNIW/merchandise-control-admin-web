import "server-only";

import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
} from "@/lib/supabase/server";

export type PlatformAdminSafetyGate =
  | "auth_ssr_not_configured"
  | "platform_admin_not_configured"
  | "server_only_boundary"
  | "rls_not_configured"
  | "read_only_contract";

export type PlatformAdminAuthzInput = {
  userId?: string | null;
  serverManagedRole?: string | null;
};

export type PlatformAdminAuthzDecision =
  | {
      status: "authorized";
      userId: string;
      role: "platform_admin";
      safetyGates: readonly PlatformAdminSafetyGate[];
    }
  | {
      status: "not_configured";
      reason: string;
      safetyGates: readonly PlatformAdminSafetyGate[];
    }
  | {
      status: "unauthorized";
      reason: string;
      safetyGates: readonly PlatformAdminSafetyGate[];
    };

export type RedactedPlatformAdminError = {
  code: string;
  message: string;
};

const platformAdminRole = "platform_admin";

export function authorizePlatformAdmin(
  input: PlatformAdminAuthzInput = {},
): PlatformAdminAuthzDecision {
  const supabaseConfig = resolveSupabaseServerConfig();

  if (supabaseConfig.status !== "configured") {
    return {
      status: "not_configured",
      reason:
        "Supabase runtime env is absent; platform admin authorization cannot run.",
      safetyGates: [
        "server_only_boundary",
        "auth_ssr_not_configured",
        "platform_admin_not_configured",
        "rls_not_configured",
        "read_only_contract",
      ],
    };
  }

  if (!input.userId) {
    return {
      status: "not_configured",
      reason:
        "Auth SSR session resolution requires a configured runtime request.",
      safetyGates: [
        "server_only_boundary",
        "auth_ssr_not_configured",
        "platform_admin_not_configured",
        "rls_not_configured",
        "read_only_contract",
      ],
    };
  }

  if (input.serverManagedRole !== platformAdminRole) {
    return {
      status: "unauthorized",
      reason:
        "The authenticated user is not authorized as a server-managed platform admin.",
      safetyGates: [
        "server_only_boundary",
        "platform_admin_not_configured",
        "rls_not_configured",
        "read_only_contract",
      ],
    };
  }

  return {
    status: "authorized",
    userId: input.userId,
    role: platformAdminRole,
    safetyGates: ["server_only_boundary", "read_only_contract"],
  };
}

export async function authorizeCurrentPlatformAdmin(
  client?: SupabaseServerClient | null,
): Promise<PlatformAdminAuthzDecision> {
  const supabaseConfig = resolveSupabaseServerConfig();

  if (supabaseConfig.status !== "configured") {
    return {
      status: "not_configured",
      reason:
        "Supabase runtime env is absent; platform admin authorization cannot run.",
      safetyGates: [
        "server_only_boundary",
        "auth_ssr_not_configured",
        "platform_admin_not_configured",
        "read_only_contract",
      ],
    };
  }

  const supabase = client ?? (await createSupabaseServerClient(supabaseConfig));

  if (!supabase) {
    return {
      status: "not_configured",
      reason:
        "Supabase server client is not available for Platform Admin authorization.",
      safetyGates: [
        "server_only_boundary",
        "auth_ssr_not_configured",
        "platform_admin_not_configured",
        "read_only_contract",
      ],
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      status: "unauthorized",
      reason: "No active server session is available for Platform Admin.",
      safetyGates: [
        "server_only_boundary",
        "platform_admin_not_configured",
        "read_only_contract",
      ],
    };
  }

  const { data: platformAdmin, error: platformAdminError } = await supabase
    .from("platform_admins")
    .select("profile_id,status,revoked_at")
    .eq("profile_id", userData.user.id)
    .eq("status", "active")
    .is("revoked_at", null)
    .maybeSingle();

  if (platformAdminError || !platformAdmin) {
    return {
      status: "unauthorized",
      reason:
        "The authenticated user is not authorized as an active platform admin.",
      safetyGates: [
        "server_only_boundary",
        "platform_admin_not_configured",
        "read_only_contract",
      ],
    };
  }

  return {
    status: "authorized",
    userId: userData.user.id,
    role: platformAdminRole,
    safetyGates: ["server_only_boundary", "read_only_contract"],
  };
}

export function redactPlatformAdminError(
  error: unknown,
): RedactedPlatformAdminError {
  const code =
    error instanceof Error && error.name ? error.name : "platform_admin_error";

  return {
    code,
    message: "Request could not be completed.",
  };
}
