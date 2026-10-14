import "server-only";

import type {
  WeChatExternalActivationState,
  WeChatNativeSurface,
  WeChatSurface,
} from "@/lib/auth/wechat-contract";
import { resolveSupabaseAdminConfig } from "@/lib/supabase/admin";
import { resolveSupabaseServerConfig } from "@/lib/supabase/server";

const flagNames: Record<WeChatSurface, string> = {
  web: "WECHAT_AUTH_WEB_ENABLED",
  android: "WECHAT_AUTH_ANDROID_ENABLED",
  ios: "WECHAT_AUTH_IOS_ENABLED",
  mini_program: "WECHAT_AUTH_MINI_PROGRAM_ENABLED",
};

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true" || value?.trim() === "1";
}

function uuidAllowlist(value: string | undefined): readonly string[] {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase());
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  return entries.length <= 100 && entries.every((entry) => uuid.test(entry))
    ? [...new Set(entries)]
    : [];
}

function bridgeUrl(
  value: string | undefined,
  allowlistValue: string | undefined,
) {
  const candidate = value?.trim();
  const allowedHosts = new Set(
    (allowlistValue ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !allowedHosts.has(parsed.hostname.toLowerCase())
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export type WeChatRuntimeConfig = {
  activation: WeChatExternalActivationState;
  bridgeClientId: string;
  bridgeClientSecret: string;
  bridgeExchangeUrl: URL | null;
  enabledSurfaces: Readonly<Record<WeChatSurface, boolean>>;
  hashSalt: string;
  linkingEnabled: boolean;
  miniAllowedProfileIds: readonly string[];
  miniAllowedShopIds: readonly string[];
  miniCatalogMutationsEnabled: boolean;
  miniProtocol?: string;
  miniReady?: boolean;
  miniEnrollmentReady?: boolean;
  oidcReady?: boolean;
  oidcProvider: "custom:wechat";
  reason: string;
  supabasePublishableKey: string;
  supabaseUrl: string;
};

export function resolveWeChatRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): WeChatRuntimeConfig {
  const enabledSurfaces = Object.fromEntries(
    Object.entries(flagNames).map(([surface, name]) => [
      surface,
      enabled(env[name]),
    ]),
  ) as Record<WeChatSurface, boolean>;
  const server = resolveSupabaseServerConfig(env);
  const admin = resolveSupabaseAdminConfig(env);
  const bridgeExchangeUrl = bridgeUrl(
    env.WECHAT_IDENTITY_BRIDGE_EXCHANGE_URL,
    env.WECHAT_IDENTITY_BRIDGE_HOST_ALLOWLIST,
  );
  const bridgeClientId = env.WECHAT_IDENTITY_BRIDGE_CLIENT_ID?.trim() ?? "";
  const bridgeClientSecret =
    env.WECHAT_IDENTITY_BRIDGE_CLIENT_SECRET?.trim() ?? "";
  const hashSalt = env.WECHAT_AUTH_TECHNICAL_HASH_SALT?.trim() ?? "";
  const oidcProvider = env.WECHAT_OIDC_PROVIDER?.trim();
  const providerValid = oidcProvider === "custom:wechat";
  const serverReady = server.status === "configured";
  const adminReady = admin.status === "configured";
  const bridgeReady = Boolean(
    bridgeExchangeUrl && bridgeClientId && bridgeClientSecret && hashSalt,
  );
  const anySurfaceEnabled = Object.values(enabledSurfaces).some(Boolean);
  const miniAllowedProfileIds = uuidAllowlist(
    env.WECHAT_MINI_PROGRAM_TESTER_PROFILE_ALLOWLIST,
  );
  const miniAllowedShopIds = uuidAllowlist(
    env.WECHAT_MINI_PROGRAM_SHOP_ALLOWLIST,
  );
  const miniProtocol =
    env.WECHAT_MINI_AUTH_PROTOCOL ?? "mini-id-token-nonce-v1";
  const oidcReady = serverReady && adminReady && bridgeReady && providerValid;
  const directReady =
    miniProtocol === "wechat-mini-code2session-v1" &&
    serverReady &&
    adminReady &&
    env.WECHAT_MINI_UPSTREAM_TRACING_DISABLED === "true" &&
    env.NEXT_OTEL_FETCH_DISABLED === "1" &&
    /^wx[0-9a-f]{16}$/.test(env.WECHAT_MINI_PROGRAM_APP_ID ?? "") &&
    /^[0-9a-f]{32}$/i.test(env.WECHAT_MINI_PROGRAM_APP_SECRET ?? "") &&
    /^[A-Za-z0-9_-]{43}$/.test(env.WECHAT_MINI_IDENTITY_HMAC_KEY_V1 ?? "") &&
    hashSalt.length >= 32;
  const activation: WeChatExternalActivationState = !anySurfaceEnabled
    ? "disabled"
    : (oidcReady &&
          (enabledSurfaces.web ||
            enabledSurfaces.android ||
            enabledSurfaces.ios)) ||
        (enabledSurfaces.mini_program &&
          miniAllowedProfileIds.length > 0 &&
          miniAllowedShopIds.length > 0 &&
          (directReady ||
            (miniProtocol === "mini-id-token-nonce-v1" && oidcReady)))
      ? "ready"
      : "external_activation_required";

  return {
    activation,
    bridgeClientId,
    bridgeClientSecret,
    bridgeExchangeUrl,
    enabledSurfaces,
    hashSalt,
    linkingEnabled: enabled(env.WECHAT_AUTH_LINKING_ENABLED),
    miniAllowedProfileIds,
    miniAllowedShopIds,
    miniProtocol,
    miniReady:
      miniAllowedProfileIds.length > 0 &&
      miniAllowedShopIds.length > 0 &&
      (directReady || (miniProtocol === "mini-id-token-nonce-v1" && oidcReady)),
    miniEnrollmentReady:
      directReady &&
      miniAllowedProfileIds.length > 0 &&
      miniAllowedShopIds.length > 0 &&
      env.WECHAT_MINI_ENROLLMENT_ENABLED === "true",
    oidcReady,
    // Match the existing catalog/image mutation gate exactly.
    miniCatalogMutationsEnabled:
      env.WECHAT_MINI_PROGRAM_CATALOG_MUTATIONS_ENABLED === "true",
    oidcProvider: "custom:wechat",
    reason:
      activation === "ready"
        ? "Configured for enabled surfaces. Live WeChat approval must still be evidenced."
        : activation === "disabled"
          ? "Every WeChat surface feature flag is OFF."
          : "An enabled surface is missing a verified bridge, Supabase, provider, allowlist, or hash-salt setting.",
    supabasePublishableKey:
      server.status === "configured" ? server.publishableKey : "",
    supabaseUrl: server.status === "configured" ? server.url : "",
  };
}

export function isWeChatSurfaceReady(
  surface: WeChatSurface,
  config: WeChatRuntimeConfig = resolveWeChatRuntimeConfig(),
) {
  return (
    config.activation === "ready" &&
    config.enabledSurfaces[surface] &&
    (surface === "mini_program" || config.oidcReady !== false) &&
    (surface !== "mini_program" || config.miniReady !== false) &&
    (surface !== "mini_program" ||
      (config.miniAllowedProfileIds.length > 0 &&
        config.miniAllowedShopIds.length > 0))
  );
}

export function isWeChatLinkingReady(
  config: WeChatRuntimeConfig = resolveWeChatRuntimeConfig(),
) {
  return config.linkingEnabled && isWeChatSurfaceReady("web", config);
}

export function publicWeChatConfiguration(
  config: WeChatRuntimeConfig = resolveWeChatRuntimeConfig(),
) {
  return {
    activation: config.activation,
    linkingEnabled: config.linkingEnabled,
    miniCatalogMutationsEnabled: config.miniCatalogMutationsEnabled,
    miniProtocol: config.miniProtocol ?? "mini-id-token-nonce-v1",
    miniProvider:
      config.miniProtocol === "wechat-mini-code2session-v1"
        ? "wechat-mini"
        : "custom:wechat",
    miniEnrollmentReady: config.miniEnrollmentReady === true,
    enabledSurfaces: config.enabledSurfaces,
    readySurfaces: Object.fromEntries(
      (Object.keys(flagNames) as WeChatSurface[]).map((surface) => [
        surface,
        isWeChatSurfaceReady(surface, config),
      ]),
    ),
    identityContract: "supabase-custom-oidc-bridge-v1" as const,
    pollingIntervalSeconds: 10,
    provider: config.oidcProvider,
    reason: config.reason,
  };
}

export function flagNameForSurface(surface: WeChatNativeSurface) {
  return flagNames[surface];
}
