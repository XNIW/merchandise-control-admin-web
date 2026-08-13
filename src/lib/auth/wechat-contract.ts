export const weChatSurfaces = ["web", "android", "ios", "mini_program"] as const;
export type WeChatSurface = (typeof weChatSurfaces)[number];

export type AuthProvider = "email" | "google" | "wechat";
export type WeChatNativeSurface = Exclude<WeChatSurface, "web">;
export type WeChatLinkMode = "link" | "login";

export type WeChatExternalActivationState =
  | "disabled"
  | "external_activation_required"
  | "ready";

export type WeChatLinkState =
  | "not_linked"
  | "linked"
  | "conflict"
  | "link_required";

export type WeChatSessionState =
  | "signed_out"
  | "exchanging"
  | "active"
  | "expired"
  | "revoked";

export const weChatErrorCodes = [
  "account_suspended",
  "backend_temporary",
  "body_too_large",
  "code_expired",
  "code_invalid",
  "code_missing",
  "identity_already_linked",
  "identity_conflict",
  "membership_missing",
  "provider_not_configured",
  "rate_limited",
  "session_expired",
  "state_expired",
  "state_invalid",
  "state_replayed",
  "user_cancelled",
  "user_denied",
] as const;
export type WeChatErrorCode = (typeof weChatErrorCodes)[number];

export const weChatAuditEvents = [
  "auth.wechat.exchange_succeeded",
  "auth.wechat.exchange_blocked",
  "auth.wechat.link_succeeded",
  "auth.wechat.link_conflict",
] as const;
export type WeChatAuditEvent = (typeof weChatAuditEvents)[number];

export type WeChatChallengeResult = {
  correlationId: string;
  expiresInSeconds: number;
  nonce: string;
  state: string;
};

export type WeChatSupabaseSessionResult = {
  accessToken: string;
  expiresAt: number;
  expiresIn: number;
  refreshToken: string;
  tokenType: "bearer";
  user: {
    id: string;
    provider: "custom:wechat";
  };
};

export type WeChatMiniSessionResult = {
  accountFingerprint: string;
  expiresAt: number;
  expiresIn: number;
  sessionToken: string;
  tokenType: "bearer";
  user: {
    provider: "custom:wechat";
  };
};

export type WeChatSessionResult =
  | WeChatMiniSessionResult
  | WeChatSupabaseSessionResult;

export function isWeChatNativeSurface(value: unknown): value is WeChatNativeSurface {
  return value === "android" || value === "ios" || value === "mini_program";
}

export function isWeChatLinkMode(value: unknown): value is WeChatLinkMode {
  return value === "login" || value === "link";
}
