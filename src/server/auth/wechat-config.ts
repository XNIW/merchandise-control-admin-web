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

function bridgeUrl(value: string | undefined, allowlistValue: string | undefined) {
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
  const activation: WeChatExternalActivationState = !anySurfaceEnabled
    ? "disabled"
    : serverReady && adminReady && bridgeReady && providerValid
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
  return config.activation === "ready" && config.enabledSurfaces[surface];
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
    enabledSurfaces: config.enabledSurfaces,
    identityContract: "supabase-custom-oidc-bridge-v1" as const,
    pollingIntervalSeconds: 10,
    provider: config.oidcProvider,
    reason: config.reason,
  };
}

export function flagNameForSurface(surface: WeChatNativeSurface) {
  return flagNames[surface];
}
