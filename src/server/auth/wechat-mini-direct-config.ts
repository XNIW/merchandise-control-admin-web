import "server-only";

import { resolveWeChatRuntimeConfig } from "./wechat-config";

export const miniDirectProtocol = "wechat-mini-code2session-v1" as const;

export function resolveMiniDirectConfig(env: NodeJS.ProcessEnv = process.env) {
  const common = resolveWeChatRuntimeConfig(env);
  const appId = env.WECHAT_MINI_PROGRAM_APP_ID?.trim() ?? "";
  const appSecret = env.WECHAT_MINI_PROGRAM_APP_SECRET?.trim() ?? "";
  const identityKey = env.WECHAT_MINI_IDENTITY_HMAC_KEY_V1?.trim() ?? "";
  const selected = env.WECHAT_MINI_AUTH_PROTOCOL === miniDirectProtocol;
  const configured = selected && common.miniReady === true;
  return {
    appId,
    appSecret,
    common,
    identityKey,
    selected,
    configured,
    loginReady: configured && common.enabledSurfaces.mini_program,
    enrollmentReady:
      configured && env.WECHAT_MINI_ENROLLMENT_ENABLED === "true",
  };
}

export type MiniDirectConfig = ReturnType<typeof resolveMiniDirectConfig>;
