import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
  type SupabaseServerConfig,
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
      actorAccessToken: string;
      actorProfileId: string;
      diagnostics: PlatformProvisioningRequestAuthDiagnostics;
      status: "authorized";
    }
  | {
      code: "auth_mismatch" | "not_configured" | "unauthorized";
      diagnostics: PlatformProvisioningRequestAuthDiagnostics;
      status: "blocked";
    };

type CookiePlatformAdminResolution =
  | {
      actorAccessToken: string;
      actorProfileId: string;
      status: "authorized";
    }
  | {
      actorProfileId: string | null;
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
  client: SupabaseServerClient,
  userId: string,
) {
  const adminResult = await client
    .from("platform_admins")
    .select("profile_id")
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("revoked_at", null)
    .maybeSingle();

  return !adminResult.error && Boolean(adminResult.data);
}

function createBearerSupabaseClient(
  config: Extract<SupabaseServerConfig, { status: "configured" }>,
  bearerToken: string,
): SupabaseServerClient {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "X-Client-Info":
          "merchandise-control-admin-web/platform-provisioning-auth",
      },
    },
  });
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

async function resolveCookiePlatformAdmin(input: {
  diagnostics: PlatformProvisioningRequestAuthDiagnostics;
  serverClient: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
}): Promise<CookiePlatformAdminResolution> {
  const cookieUserResult = await input.serverClient.auth.getUser();
  const cookieUserId = cookieUserResult.data.user?.id ?? null;

  input.diagnostics.cookieUserResolved = Boolean(cookieUserId);

  if (
    !cookieUserId ||
    !(await userIsActivePlatformAdmin(input.serverClient, cookieUserId))
  ) {
    return {
      actorProfileId: cookieUserId,
      status: "blocked",
    };
  }

  const sessionResult = await input.serverClient.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token ?? null;

  if (!accessToken) {
    return {
      actorProfileId: cookieUserId,
      status: "blocked",
    };
  }

  return {
    actorAccessToken: accessToken,
    actorProfileId: cookieUserId,
    status: "authorized",
  };
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

  const verificationApiKey = process.env.SUPABASE_ANON_KEY?.trim();
  const resolvedVerificationApiKey =
    verificationApiKey || serverConfig.publishableKey;

  diagnostics.verificationApiKeySource = verificationApiKey
    ? "anon"
    : "publishable";

  const authorizationHeader = input.authorizationHeader ?? null;
  const bearerToken = readBearerToken(authorizationHeader);

  diagnostics.authorizationHeaderPresent = Boolean(authorizationHeader);
  diagnostics.authorizationHeaderLooksBearer = Boolean(bearerToken);
  diagnostics.bearerLooksLikeJwt = looksLikeJwt(bearerToken);

  if (bearerToken) {
    diagnostics.codeBranch = "platform-provisioning-auth-bearer";

    const bearerUserId = await resolveBearerUserId({
      apiKey: resolvedVerificationApiKey,
      bearerToken,
      diagnostics,
      url: serverConfig.url,
    });

    diagnostics.bearerUserResolved = Boolean(bearerUserId);

    const bearerIsPlatformAdmin = Boolean(
      bearerUserId &&
        (await userIsActivePlatformAdmin(
          createBearerSupabaseClient(serverConfig, bearerToken),
          bearerUserId,
        )),
    );
    const cookieResolution = await resolveCookiePlatformAdmin({
      diagnostics,
      serverClient,
    });
    const cookieUserId = cookieResolution.actorProfileId;

    if (bearerUserId && cookieUserId && bearerUserId !== cookieUserId) {
      diagnostics.codeBranch = "platform-provisioning-auth-mismatch";

      return {
        code: "auth_mismatch",
        diagnostics,
        status: "blocked",
      };
    }

    if (bearerUserId && bearerIsPlatformAdmin) {
      diagnostics.authSourceUsed = "bearer";
      diagnostics.platformAdminResolved = true;

      return {
        actorAccessToken: bearerToken,
        actorProfileId: bearerUserId,
        diagnostics,
        status: "authorized",
      };
    }

    if (cookieResolution.status === "authorized") {
      diagnostics.authSourceUsed = "cookie";
      diagnostics.codeBranch = "platform-provisioning-auth-cookie-fallback";
      diagnostics.platformAdminResolved = true;

      return {
        actorAccessToken: cookieResolution.actorAccessToken,
        actorProfileId: cookieResolution.actorProfileId,
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

  const cookieResolution = await resolveCookiePlatformAdmin({
    diagnostics,
    serverClient,
  });

  if (cookieResolution.status === "authorized") {
    diagnostics.authSourceUsed = "cookie";
    diagnostics.platformAdminResolved = true;

    return {
      actorAccessToken: cookieResolution.actorAccessToken,
      actorProfileId: cookieResolution.actorProfileId,
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
