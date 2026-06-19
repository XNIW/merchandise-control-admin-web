import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/locales";

export type AccountOrigin = "google" | "email" | "apple" | "wechat" | "unknown";

export type AccountIdentitySummary = {
  kind: "account_identity";
  profileId: string;
  email: string | null;
  displayName: string | null;
  origin: AccountOrigin;
  originLabel: string;
  rawProvider?: string | null;
};

export type AccountIdentityInput = {
  profileId: string;
  email?: string | null;
  displayName?: string | null;
  rawProvider?: string | null;
};

const originLabels: Record<
  SupportedLocale,
  Record<AccountOrigin, string>
> = {
  en: {
    apple: "Apple ID",
    email: "Email",
    google: "Google",
    unknown: "Origin unavailable",
    wechat: "WeChat",
  },
  es: {
    apple: "Apple ID",
    email: "Email",
    google: "Google",
    unknown: "Origen no disponible",
    wechat: "WeChat",
  },
  it: {
    apple: "Apple ID",
    email: "Email",
    google: "Google",
    unknown: "Origine non disponibile",
    wechat: "WeChat",
  },
  "zh-CN": {
    apple: "Apple ID",
    email: "邮箱",
    google: "Google",
    unknown: "来源不可用",
    wechat: "微信",
  },
};

const profileLabels: Record<SupportedLocale, string> = {
  en: "Profile",
  es: "Perfil",
  it: "Profilo",
  "zh-CN": "个人资料",
};

const unknownAccountLabels: Record<SupportedLocale, string> = {
  en: "Unknown account",
  es: "Cuenta desconocida",
  it: "Account sconosciuto",
  "zh-CN": "未知账号",
};

function normalizeSafeText(value: string | null | undefined, max = 180) {
  const normalized = (value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized.slice(0, max) : null;
}

function providerTokens(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase()
    .split(/[^a-z0-9_+-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeAccountOrigin(
  rawProvider: string | null | undefined,
): AccountOrigin {
  for (const token of providerTokens(rawProvider)) {
    if (token === "google") {
      return "google";
    }

    if (token === "email") {
      return "email";
    }

    if (token === "apple" || token === "apple_id" || token === "appleid") {
      return "apple";
    }

    if (token === "wechat" || token === "weixin") {
      return "wechat";
    }
  }

  return "unknown";
}

export function accountOriginLabel(
  origin: AccountOrigin,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  return originLabels[locale][origin];
}

export function accountProfileLabel(locale: SupportedLocale = DEFAULT_LOCALE) {
  return profileLabels[locale];
}

export function unknownAccountLabel(locale: SupportedLocale = DEFAULT_LOCALE) {
  return unknownAccountLabels[locale];
}

export function shortAccountProfileId(profileId: string) {
  return profileId.length > 12
    ? `${profileId.slice(0, 8)}...${profileId.slice(-4)}`
    : profileId;
}

export function createAccountIdentitySummary({
  displayName,
  email,
  profileId,
  rawProvider,
}: AccountIdentityInput): AccountIdentitySummary {
  const origin = normalizeAccountOrigin(rawProvider);

  return {
    displayName: normalizeSafeText(displayName),
    email: normalizeSafeText(email),
    kind: "account_identity",
    origin,
    originLabel: accountOriginLabel(origin),
    profileId,
    rawProvider: normalizeSafeText(rawProvider, 80),
  };
}

export function isAccountIdentitySummary(
  value: unknown,
): value is AccountIdentitySummary {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === "account_identity" &&
    typeof (value as { profileId?: unknown }).profileId === "string"
  );
}

export function accountIdentityPrimaryText(
  identity: AccountIdentitySummary,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  return (
    identity.email ??
    identity.displayName ??
    `${unknownAccountLabel(locale)} ${shortAccountProfileId(identity.profileId)}`
  );
}

export function accountIdentitySearchText(identity: AccountIdentitySummary) {
  return [
    identity.email,
    identity.displayName,
    identity.originLabel,
    identity.rawProvider,
    identity.profileId,
    shortAccountProfileId(identity.profileId),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}
