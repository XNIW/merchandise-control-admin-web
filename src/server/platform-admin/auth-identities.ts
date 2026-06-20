import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type { AdminWebPerfTrace } from "@/server/admin-web-perf";

export type PlatformAuthProviderType =
  | "email"
  | "oauth"
  | "phone"
  | "unknown";

export type PlatformAuthIdentitySummary = {
  authUserId: string;
  createdAt: string;
  displayName: string;
  email: string;
  provider: string;
  providerType: PlatformAuthProviderType;
};

export type PlatformAuthIdentityLoadResult =
  | {
      identities: readonly PlatformAuthIdentitySummary[];
      scannedCount: number;
      status: "ready";
      truncated: boolean;
    }
  | {
      identities: readonly PlatformAuthIdentitySummary[];
      reason: string;
      scannedCount: number;
      status: "error" | "not_configured";
      truncated: false;
    };

const maxSearchLength = 120;
const authListPageSize = 1000;
const authListDefaultMaxUsers = 5000;
const authSearchMaxUsers = 50000;

export function normalizePlatformUserSearchQuery(value?: string | null) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  return normalized.length > maxSearchLength
    ? normalized.slice(0, maxSearchLength)
    : normalized;
}

export function escapePostgrestLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function normalizeSafeDisplayString(value?: string | null, max = 80) {
  const normalized = (value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized.slice(0, max) : "";
}

function emailLocalDisplayName(email: string) {
  return normalizeSafeDisplayString(
    email.split("@")[0]?.replace(/[._-]+/g, " ") ?? "",
  );
}

function displayNameFromMetadata(user: User) {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;

  for (const key of ["display_name", "full_name", "name"]) {
    const value = metadata[key];

    if (typeof value !== "string") {
      continue;
    }

    const normalized = normalizeSafeDisplayString(value);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function safeDisplayNameForUser(user: User) {
  const email = normalizeSafeDisplayString(user.email, 180);

  return (
    displayNameFromMetadata(user) ||
    (email ? emailLocalDisplayName(email) : "") ||
    `Auth user ${user.id.slice(0, 8)}`
  );
}

function safeProviderValue(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeSafeDisplayString(value, 40).toLowerCase();
}

function providerSummaryForUser(user: User): {
  provider: string;
  providerType: PlatformAuthProviderType;
} {
  const providers = new Set<string>();
  const appProvider = safeProviderValue(user.app_metadata?.provider);

  if (appProvider) {
    providers.add(appProvider);
  }

  for (const identity of user.identities ?? []) {
    const provider = safeProviderValue(
      (identity as { provider?: unknown }).provider,
    );

    if (provider) {
      providers.add(provider);
    }
  }

  const provider = Array.from(providers).sort().join(", ") || "unknown";
  const primary = provider.split(", ")[0] ?? "unknown";

  if (primary === "email") {
    return { provider, providerType: "email" };
  }

  if (primary === "phone") {
    return { provider, providerType: "phone" };
  }

  if (primary === "unknown") {
    return { provider, providerType: "unknown" };
  }

  return { provider, providerType: "oauth" };
}

function mapAuthUserToSummary(user: User): PlatformAuthIdentitySummary {
  const provider = providerSummaryForUser(user);

  return {
    authUserId: user.id,
    createdAt: user.created_at,
    displayName: safeDisplayNameForUser(user),
    email: normalizeSafeDisplayString(user.email, 180) || "Email unavailable",
    provider: provider.provider,
    providerType: provider.providerType,
  };
}

function authIdentityMatchesSearch(
  identity: PlatformAuthIdentitySummary,
  normalizedSearch: string,
) {
  if (!normalizedSearch) {
    return true;
  }

  const haystack = [
    identity.authUserId,
    identity.createdAt,
    identity.displayName,
    identity.email,
    identity.provider,
    identity.providerType,
  ]
    .join("\n")
    .toLocaleLowerCase();

  return haystack.includes(normalizedSearch.toLocaleLowerCase());
}

async function tracedAdminCall<T>(
  perfTrace: AdminWebPerfTrace | undefined,
  label: string,
  task: () => Promise<T>,
) {
  perfTrace?.query(label);

  return perfTrace ? perfTrace.time(label, task) : task();
}

export async function loadPlatformAuthIdentitySummaries(
  searchQuery?: string,
  perfTrace?: AdminWebPerfTrace,
): Promise<PlatformAuthIdentityLoadResult> {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return {
      identities: [],
      reason:
        "Supabase Auth identity summaries require server admin runtime env after Platform Admin authorization.",
      scannedCount: 0,
      status: "not_configured",
      truncated: false,
    };
  }

  const admin = createSupabaseAdminClient(config);

  if (!admin) {
    return {
      identities: [],
      reason:
        "Supabase Auth identity summaries are unavailable for this request.",
      scannedCount: 0,
      status: "not_configured",
      truncated: false,
    };
  }

  const normalizedSearch = normalizePlatformUserSearchQuery(searchQuery);
  const maxUsers = normalizedSearch
    ? authSearchMaxUsers
    : authListDefaultMaxUsers;
  const identities: PlatformAuthIdentitySummary[] = [];
  let scannedCount = 0;
  let page = 1;
  let truncated = false;

  while (scannedCount < maxUsers) {
    const { data, error } = await tracedAdminCall(
      perfTrace,
      "platform.auth.admin.listUsers",
      () =>
        admin.auth.admin.listUsers({
          page,
          perPage: authListPageSize,
        }),
    );

    if (error) {
      return {
        identities: [],
        reason:
          "Supabase Auth identity summaries could not be loaded through the server admin boundary.",
        scannedCount,
        status: "error",
        truncated: false,
      };
    }

    for (const user of data.users) {
      scannedCount += 1;
      const identity = mapAuthUserToSummary(user);

      if (authIdentityMatchesSearch(identity, normalizedSearch)) {
        identities.push(identity);
      }
    }

    if (page >= data.lastPage || data.users.length === 0) {
      break;
    }

    if (scannedCount >= maxUsers) {
      truncated = page < data.lastPage;
      break;
    }

    page += 1;
  }

  return {
    identities,
    scannedCount,
    status: "ready",
    truncated,
  };
}

export async function loadAuthIdentitySummariesByIds(
  profileIds: readonly string[],
  perfTrace?: AdminWebPerfTrace,
): Promise<PlatformAuthIdentityLoadResult> {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return {
      identities: [],
      reason:
        "Supabase Auth identity summaries require server admin runtime env after authorization.",
      scannedCount: 0,
      status: "not_configured",
      truncated: false,
    };
  }

  const admin = createSupabaseAdminClient(config);

  if (!admin) {
    return {
      identities: [],
      reason:
        "Supabase Auth identity summaries are unavailable for this request.",
      scannedCount: 0,
      status: "not_configured",
      truncated: false,
    };
  }

  const ids = Array.from(new Set(profileIds)).filter((profileId) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      profileId,
    ),
  );
  const identities: PlatformAuthIdentitySummary[] = [];
  let scannedCount = 0;

  for (const profileId of ids) {
    const { data, error } = await tracedAdminCall(
      perfTrace,
      "platform.auth.admin.getUserById",
      () => admin.auth.admin.getUserById(profileId),
    );
    scannedCount += 1;

    if (error) {
      continue;
    }

    if (data.user) {
      identities.push(mapAuthUserToSummary(data.user));
    }
  }

  return {
    identities,
    scannedCount,
    status: "ready",
    truncated: false,
  };
}
