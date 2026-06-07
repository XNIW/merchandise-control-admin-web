import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
} from "@/lib/supabase/server";

export type PlatformProvisioningAuthSource = "bearer" | "cookie" | "none";

export type PlatformProvisioningRequestAuthDiagnostics = {
  authorizationHeaderLooksBearer: boolean;
  authorizationHeaderPresent: boolean;
  authSourceUsed: PlatformProvisioningAuthSource;
  bearerLooksLikeJwt: boolean;
  bearerResponseAud: string | null;
  bearerResponseHasUserId: boolean;
  bearerResponseOk: boolean;
  bearerResponseRole: string | null;
  bearerResponseStatus: number | null;
  bearerUserResolved: boolean;
  browserSupabaseHost: string | null;
  codeBranch: string;
  cookieUserResolved: boolean;
  formMode: string | null;
  platformAdminResolved: boolean;
  requestContentType: string | null;
  serverSupabaseHost: string | null;
  verificationApiKeySource: "anon" | "publishable";
};

type ResolvePlatformAdminForRequestInput = {
  authorizationHeader?: string | null;
  browserSupabaseHost?: string | null;
  diagnostics?: PlatformProvisioningRequestAuthDiagnostics;
  formMode?: string | null;
  requestContentType?: string | null;
};

type ResolvePlatformAdminForRequestResult =
  | {
      actorProfileId: string;
      adminClient: SupabaseAdminClient;
      diagnostics: PlatformProvisioningRequestAuthDiagnostics;
      status: "authorized";
    }
  | {
      code: "not_configured" | "unauthorized";
      diagnostics: PlatformProvisioningRequestAuthDiagnostics;
      status: "blocked";
    };

export function createPlatformProvisioningAuthDiagnostics(
  input: Pick<
    ResolvePlatformAdminForRequestInput,
    "browserSupabaseHost" | "formMode" | "requestContentType"
  > & {
    codeBranch: string;
  },
): PlatformProvisioningRequestAuthDiagnostics {
  return {
    authorizationHeaderLooksBearer: false,
    authorizationHeaderPresent: false,
    authSourceUsed: "none",
    bearerLooksLikeJwt: false,
    bearerResponseAud: null,
    bearerResponseHasUserId: false,
    bearerResponseOk: false,
    bearerResponseRole: null,
    bearerResponseStatus: null,
    bearerUserResolved: false,
    browserSupabaseHost: input.browserSupabaseHost ?? null,
    codeBranch: input.codeBranch,
    cookieUserResolved: false,
    formMode: input.formMode ?? null,
    platformAdminResolved: false,
    requestContentType: input.requestContentType ?? null,
    serverSupabaseHost: supabaseHost(process.env.NEXT_PUBLIC_SUPABASE_URL),
    verificationApiKeySource: "publishable",
  };
}

export function platformProvisioningDiagnosticsEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.TEST_TARGET === "local" || env.CONFIRM_TASK051_FULL_E2E === "yes";
}

function supabaseHost(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host;
  } catch {
    return "invalid";
  }
}

function readBearerToken(authorization: string | null | undefined) {
  const [scheme, token, extra] = (authorization ?? "").trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    return null;
  }

  return token;
}

function looksLikeJwt(token: string | null) {
  return Boolean(token && token.split(".").length === 3);
}

const bearerVerificationTimeoutMs = 10_000;

async function userIsActivePlatformAdmin(
  adminClient: SupabaseAdminClient,
  userId: string,
) {
  const authUserResult = await adminClient.auth.admin.getUserById(userId);

  if (authUserResult.error || !authUserResult.data.user) {
    return false;
  }

  const adminResult = await adminClient
    .from("platform_admins")
    .select("profile_id")
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("revoked_at", null)
    .maybeSingle();

  return !adminResult.error && Boolean(adminResult.data);
}

async function resolveBearerUserId(input: {
  apiKey: string;
  bearerToken: string;
  diagnostics: PlatformProvisioningRequestAuthDiagnostics;
  url: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    bearerVerificationTimeoutMs,
  );

  try {
    const response = await fetch(`${input.url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${input.bearerToken}`,
        apikey: input.apiKey,
        "X-Client-Info":
          "merchandise-control-admin-web/provisioning-bearer-verifier",
      },
      signal: controller.signal,
    });

    input.diagnostics.bearerResponseOk = response.ok;
    input.diagnostics.bearerResponseStatus = response.status;

    if (!response.ok) {
      return null;
    }

    const user = (await response.json()) as {
      aud?: unknown;
      id?: unknown;
      role?: unknown;
    };

    input.diagnostics.bearerResponseAud =
      typeof user.aud === "string" ? user.aud : null;
    input.diagnostics.bearerResponseHasUserId = typeof user.id === "string";
    input.diagnostics.bearerResponseRole =
      typeof user.role === "string" ? user.role : null;

    if (
      typeof user.id !== "string" ||
      user.aud !== "authenticated" ||
      user.role !== "authenticated"
    ) {
      return null;
    }

    return user.id;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolvePlatformAdminForRequest(
  input: ResolvePlatformAdminForRequestInput = {},
): Promise<ResolvePlatformAdminForRequestResult> {
  const diagnostics =
    input.diagnostics ??
    createPlatformProvisioningAuthDiagnostics({
      browserSupabaseHost: input.browserSupabaseHost,
      codeBranch: "platform-provisioning-auth-resolver",
      formMode: input.formMode,
      requestContentType: input.requestContentType,
    });
  const adminConfig = resolveSupabaseAdminConfig();
  const serverConfig = resolveSupabaseServerConfig();
  const serverClient =
    serverConfig.status === "configured"
      ? await createSupabaseServerClient(serverConfig)
      : null;

  diagnostics.browserSupabaseHost =
    input.browserSupabaseHost ?? diagnostics.browserSupabaseHost;
  diagnostics.formMode = input.formMode ?? diagnostics.formMode;
  diagnostics.requestContentType =
    input.requestContentType ?? diagnostics.requestContentType;
  diagnostics.serverSupabaseHost = supabaseHost(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (
    adminConfig.status !== "configured" ||
    serverConfig.status !== "configured" ||
    !serverClient
  ) {
    diagnostics.codeBranch = "platform-provisioning-auth-not-configured";

    return {
      code: "not_configured",
      diagnostics,
      status: "blocked",
    };
  }

  const adminClient = createSupabaseAdminClient(adminConfig);
  const verificationApiKey = process.env.SUPABASE_ANON_KEY?.trim();
  const resolvedVerificationApiKey =
    verificationApiKey || serverConfig.publishableKey;

  diagnostics.verificationApiKeySource = verificationApiKey
    ? "anon"
    : "publishable";

  if (!adminClient) {
    diagnostics.codeBranch = "platform-provisioning-auth-admin-client-missing";

    return {
      code: "not_configured",
      diagnostics,
      status: "blocked",
    };
  }

  const authorizationHeader = input.authorizationHeader ?? null;
  const bearerToken = readBearerToken(authorizationHeader);

  diagnostics.authorizationHeaderPresent = Boolean(authorizationHeader);
  diagnostics.authorizationHeaderLooksBearer = Boolean(bearerToken);
  diagnostics.bearerLooksLikeJwt = looksLikeJwt(bearerToken);

  if (bearerToken) {
    diagnostics.codeBranch = "platform-provisioning-auth-bearer";

    const userId = await resolveBearerUserId({
      apiKey: resolvedVerificationApiKey,
      bearerToken,
      diagnostics,
      url: serverConfig.url,
    });

    diagnostics.bearerUserResolved = Boolean(userId);

    if (userId && (await userIsActivePlatformAdmin(adminClient, userId))) {
      diagnostics.authSourceUsed = "bearer";
      diagnostics.platformAdminResolved = true;

      return {
        actorProfileId: userId,
        adminClient,
        diagnostics,
        status: "authorized",
      };
    }

    return {
      code: "unauthorized",
      diagnostics,
      status: "blocked",
    };
  }

  diagnostics.codeBranch = "platform-provisioning-auth-cookie";

  const cookieUserResult = await serverClient.auth.getUser();
  const cookieUserId = cookieUserResult.data.user?.id ?? null;

  diagnostics.cookieUserResolved = Boolean(cookieUserId);

  if (cookieUserId && (await userIsActivePlatformAdmin(adminClient, cookieUserId))) {
    diagnostics.authSourceUsed = "cookie";
    diagnostics.platformAdminResolved = true;

    return {
      actorProfileId: cookieUserId,
      adminClient,
      diagnostics,
      status: "authorized",
    };
  }

  return {
    code: "unauthorized",
    diagnostics,
    status: "blocked",
  };
}
