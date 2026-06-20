import "server-only";

import type {
  AuditLog,
  PlatformAdminRecord,
  PlatformDataHealth,
  PlatformDeviceOverview,
  PlatformSyncOverview,
  Profile,
  Shop,
  ShopMember,
} from "@/domain/platform-admin/types";
import {
  isActiveMembershipStatus,
  isOperationalMembership,
  operationalMembershipsForProfile,
  shopById,
} from "@/domain/platform-admin/semantics";
import {
  createSupabaseServerClient,
  getSupabaseRuntimeTargetDiagnostic,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
  type SupabaseRuntimeTargetDiagnostic,
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  createAdminWebPerfTrace,
  type AdminWebPerfTrace,
} from "@/server/admin-web-perf";
import { authorizeCurrentPlatformAdmin } from "./authz";
import {
  escapePostgrestLikePattern,
  loadPlatformAuthIdentitySummaries,
  normalizePlatformUserSearchQuery,
  type PlatformAuthIdentityLoadResult,
  type PlatformAuthIdentitySummary,
  type PlatformAuthProviderType,
} from "./auth-identities";
import {
  mapProfileRow,
  mapShopMemberRow,
  mapShopOwnerMappingRow,
  mapShopRow,
  type AuditLogRowCandidate,
  type ProfileRowCandidate,
  type ShopMemberRowCandidate,
  type ShopOwnerMapping,
  type ShopOwnerMappingRowCandidate,
  type ShopRowCandidate,
} from "./mappers";
import type { InventorySourceMappingState } from "./inventory-sources";

type Tables = Database["public"]["Tables"];

type PlatformReadStatus = "ready" | "not_configured" | "unauthorized" | "error";

type PlatformReadIssue = {
  area: "auth_identities" | "mobile_inventory_data" | "staff_accounts_safe";
  code: string;
  message: string;
  severity: "warning";
};

type StaffSafeSummary = {
  last_login_at: string | null;
  role_key: string | null;
  shop_id: string | null;
  staff_id: string | null;
  status: string | null;
  updated_at: string | null;
};

export type PlatformProfileSyncState =
  | "auth_only"
  | "origin_unavailable"
  | "profile_ok"
  | "profile_only";

export type PlatformShopAccessState =
  | "member"
  | "member_and_platform_admin"
  | "none"
  | "platform_admin";

export type PlatformMobileInventoryDataStatus =
  | "none"
  | "present"
  | "unavailable";

export type PlatformMobileInventoryDataSummary = {
  categoriesCount: number | null;
  hasMobileInventoryData: boolean;
  mobileDataScope: "owner_scoped";
  productPricesCount: number | null;
  productsCount: number | null;
  sharedSheetSessionsCount: number | null;
  shopId: string | null;
  shopInventoryMappingState: InventorySourceMappingState;
  status: PlatformMobileInventoryDataStatus;
  suppliersCount: number | null;
  syncEventsCount: number | null;
};

export type PlatformUserAccountSummary = {
  createdAt: string;
  currentShopAdminMembershipCount: number;
  disabledShopAdminMembershipCount: number;
  displayName: string;
  email: string;
  historicalShopAdminMembershipCount: number;
  mobileInventoryData: PlatformMobileInventoryDataSummary;
  nonOperationalMembershipCount: number;
  totalMembershipCount: number;
  membershipCount: number;
  profileId: string;
  profileStatus: Profile["profile_status"] | "not_configured";
  profileSyncState: PlatformProfileSyncState;
  provider: string;
  providerType: PlatformAuthProviderType | "unavailable";
  shopAdminMembershipCount: number;
  shopAccessState: PlatformShopAccessState;
};

export type PlatformAdminReadModelOptions = {
  auditLogLimit?: number;
  includeAuditLogs?: boolean;
  includeAuthIdentities?: boolean;
  includeMobileInventoryCounts?: boolean;
  includePlatformAdmins?: boolean;
  includeProfiles?: boolean;
  includeShopDevices?: boolean;
  includeShopMembers?: boolean;
  includeShopOwnerMappings?: boolean;
  includeShops?: boolean;
  includeStaffSafeRows?: boolean;
  includeSyncEvents?: boolean;
  mobileInventoryShopIds?: readonly string[];
  perfTrace?: AdminWebPerfTrace;
  readModelName?: string;
  usersSearchQuery?: string;
};

export type PlatformAdminReadModelFoundation = {
  boundary: "server_only";
  readOnly: true;
  safety: "platform_admin_rls";
  status: PlatformReadStatus;
  reason: string;
};

export type PlatformAdminLiveReadModel = PlatformAdminReadModelFoundation & {
  profiles: readonly Profile[];
  shops: readonly Shop[];
  shopMembers: readonly ShopMember[];
  auditLogs: readonly AuditLog[];
  shopOwnerMappings: readonly ShopOwnerMapping[];
  platformAdmins: readonly PlatformAdminRecord[];
  platformAdminProfileIds: readonly string[];
  shopDevices: readonly PlatformDeviceOverview[];
  syncEvents: readonly PlatformSyncOverview[];
  staffSafeRows: readonly StaffSafeSummary[];
  authIdentities: readonly PlatformAuthIdentitySummary[];
  authIdentityStatus: {
    reason?: string;
    scannedCount: number;
    status: PlatformAuthIdentityLoadResult["status"];
    truncated: boolean;
  };
  userAccounts: readonly PlatformUserAccountSummary[];
  usersSearchQuery: string;
  readIssues: readonly PlatformReadIssue[];
  runtimeTarget: SupabaseRuntimeTargetDiagnostic;
  dataHealth: PlatformDataHealth;
  currentProfileId?: string;
};

const emptyHealth: PlatformDataHealth = {
  shops_without_owner: 0,
  profiles_without_membership: 0,
  orphaned_memberships: 0,
  suspended_shops_with_recent_activity: 0,
  audit_coverage: "NOT_RUN",
  inventory_mapping_status: "NOT_RUN",
  sync_history_mapping_status: "NOT_RUN",
  device_schema_status: "NOT_RUN",
  staff_schema_status: "NOT_RUN",
  migration_drift_status: "NOT_RUN",
};

function foundation(
  status: PlatformReadStatus,
  reason: string,
): PlatformAdminReadModelFoundation {
  return {
    boundary: "server_only",
    readOnly: true,
    reason,
    safety: "platform_admin_rls",
    status,
  };
}

function emptyModel(
  status: Exclude<PlatformReadStatus, "ready">,
  reason: string,
): PlatformAdminLiveReadModel {
  return {
    ...foundation(status, reason),
    auditLogs: [],
    authIdentities: [],
    authIdentityStatus: {
      reason: "Auth identity summaries are loaded only for the Users section.",
      scannedCount: 0,
      status: "not_configured",
      truncated: false,
    },
    currentProfileId: undefined,
    dataHealth: emptyHealth,
    platformAdminProfileIds: [],
    platformAdmins: [],
    profiles: [],
    readIssues: [],
    runtimeTarget: getSupabaseRuntimeTargetDiagnostic(),
    shopDevices: [],
    shopMembers: [],
    shopOwnerMappings: [],
    shops: [],
    staffSafeRows: [],
    syncEvents: [],
    userAccounts: [],
    usersSearchQuery: "",
  };
}

function limitText(value: string, max = 180) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

async function tracedQuery<T>(
  perfTrace: AdminWebPerfTrace | undefined,
  label: string,
  task: () => PromiseLike<T>,
): Promise<T> {
  perfTrace?.query(label);

  if (!perfTrace) {
    return await task();
  }

  return perfTrace.time(label, async () => await task());
}

export function redactPlatformMetadata(value: unknown): string {
  if (!value) {
    return "metadata_redacted: empty";
  }

  if (Array.isArray(value)) {
    return `metadata_redacted: array(${Math.min(value.length, 25)})`;
  }

  if (typeof value === "object") {
    return `metadata_redacted: object(${Object.keys(value).length} keys)`;
  }

  return "metadata_redacted: scalar";
}

function normalizeResult(value: string): AuditLog["result"] {
  if (
    value === "success" ||
    value === "blocked" ||
    value === "simulated" ||
    value === "failure"
  ) {
    return value;
  }

  return "blocked";
}

function normalizeScope(value: string): AuditLog["scope"] {
  return value === "shop" ? "shop" : "global";
}

function normalizeSeverity(value: string): AuditLog["severity"] {
  if (value === "info" || value === "warning" || value === "critical") {
    return value;
  }

  return "warning";
}

function mapAuditRow(row: AuditLogRowCandidate): AuditLog {
  return {
    actor_profile_id: row.actor_profile_id ?? undefined,
    audit_log_id: row.audit_log_id,
    created_at: row.created_at,
    event: row.event ?? row.event_key,
    metadata_summary: redactPlatformMetadata(row.metadata_redacted),
    result: normalizeResult(row.result),
    scope: normalizeScope(row.scope),
    severity: normalizeSeverity(row.severity),
    shop_id: row.shop_id ?? undefined,
    target_id: row.target_id ?? undefined,
    target_type: row.target_type ?? undefined,
  };
}

function mapPlatformAdminRow(
  row: Tables["platform_admins"]["Row"],
): PlatformAdminRecord {
  return {
    granted_at: row.granted_at,
    last_reviewed_at: row.last_reviewed_at ?? undefined,
    platform_admin_id: row.platform_admin_id,
    profile_id: row.profile_id,
    reason_redacted: row.reason_redacted ?? undefined,
    revoked_at: row.revoked_at ?? undefined,
    status: row.status === "active" && row.revoked_at === null ? "active" : "revoked",
  };
}

function isShopAdminRole(member: ShopMember) {
  return member.role_id === "shop_owner" || member.role_id === "shop_manager";
}

function mapDeviceRow(row: Tables["shop_devices"]["Row"]): PlatformDeviceOverview {
  return {
    app_version: row.app_version ?? undefined,
    device_identifier: row.device_identifier,
    device_type: row.device_type,
    display_name: row.display_name,
    last_seen_at: row.last_seen_at ?? undefined,
    shop_device_id: row.shop_device_id,
    shop_id: row.shop_id,
    status: row.status,
    updated_at: row.updated_at,
  };
}

function mapSyncRow(row: Tables["sync_events"]["Row"]): PlatformSyncOverview {
  return {
    changed_count: row.changed_count,
    created_at: row.created_at,
    domain: row.domain,
    event_type: row.event_type,
    metadata_summary: limitText(redactPlatformMetadata(row.metadata)),
    owner_user_id: row.owner_user_id,
    source: row.source ?? undefined,
    source_device_id: row.source_device_id ?? undefined,
    store_id: row.store_id ?? undefined,
    sync_event_id: String(row.id),
  };
}

type MobileInventoryCountKey =
  | "categoriesCount"
  | "productPricesCount"
  | "productsCount"
  | "sharedSheetSessionsCount"
  | "suppliersCount"
  | "syncEventsCount";

type MobileInventoryCountTable =
  | "inventory_categories"
  | "inventory_product_prices"
  | "inventory_products"
  | "inventory_suppliers"
  | "shared_sheet_sessions"
  | "sync_events";

type MobileInventoryCountResult = {
  count: number | null;
  errorMessage: string | null;
};

const mobileInventoryCountTables: readonly {
  key: MobileInventoryCountKey;
  table: MobileInventoryCountTable;
}[] = [
  { key: "productsCount", table: "inventory_products" },
  { key: "suppliersCount", table: "inventory_suppliers" },
  { key: "categoriesCount", table: "inventory_categories" },
  { key: "productPricesCount", table: "inventory_product_prices" },
  { key: "sharedSheetSessionsCount", table: "shared_sheet_sessions" },
  { key: "syncEventsCount", table: "sync_events" },
];

function emptyMobileInventoryDataSummary(
  mapping?: ShopOwnerMapping,
): PlatformMobileInventoryDataSummary {
  return {
    categoriesCount: 0,
    hasMobileInventoryData: false,
    mobileDataScope: "owner_scoped",
    productPricesCount: 0,
    productsCount: 0,
    sharedSheetSessionsCount: 0,
    shopId: mapping?.shopId ?? null,
    shopInventoryMappingState: mapping?.mappingState ?? "not_configured",
    status: "none",
    suppliersCount: 0,
    syncEventsCount: 0,
  };
}

function shopOwnerMappingForOwner(
  ownerUserId: string,
  mappings: readonly ShopOwnerMapping[],
) {
  const ownerMappings = mappings.filter(
    (mapping) => mapping.ownerUserId === ownerUserId,
  );

  return (
    ownerMappings.find((mapping) => mapping.mappingState === "mapped") ??
    ownerMappings[0]
  );
}

async function safeCountOwnerRows(
  supabase: SupabaseServerClient,
  table: MobileInventoryCountTable,
  ownerUserId: string,
  perfTrace?: AdminWebPerfTrace,
): Promise<MobileInventoryCountResult> {
  const selectOwnerOnly = "owner_user_id";
  const countOptions = { count: "exact", head: true } as const;
  let result: { count: number | null; error: { message: string } | null };

  switch (table) {
    case "inventory_categories":
      result = await tracedQuery(
        perfTrace,
        "platform.mobile_inventory.inventory_categories.count",
        () =>
          supabase
            .from("inventory_categories")
            .select(selectOwnerOnly, countOptions)
            .eq("owner_user_id", ownerUserId),
      );
      break;
    case "inventory_product_prices":
      result = await tracedQuery(
        perfTrace,
        "platform.mobile_inventory.inventory_product_prices.count",
        () =>
          supabase
            .from("inventory_product_prices")
            .select(selectOwnerOnly, countOptions)
            .eq("owner_user_id", ownerUserId),
      );
      break;
    case "inventory_products":
      result = await tracedQuery(
        perfTrace,
        "platform.mobile_inventory.inventory_products.count",
        () =>
          supabase
            .from("inventory_products")
            .select(selectOwnerOnly, countOptions)
            .eq("owner_user_id", ownerUserId),
      );
      break;
    case "inventory_suppliers":
      result = await tracedQuery(
        perfTrace,
        "platform.mobile_inventory.inventory_suppliers.count",
        () =>
          supabase
            .from("inventory_suppliers")
            .select(selectOwnerOnly, countOptions)
            .eq("owner_user_id", ownerUserId),
      );
      break;
    case "shared_sheet_sessions":
      result = await tracedQuery(
        perfTrace,
        "platform.mobile_inventory.shared_sheet_sessions.count",
        () =>
          supabase
            .from("shared_sheet_sessions")
            .select(selectOwnerOnly, countOptions)
            .eq("owner_user_id", ownerUserId),
      );
      break;
    case "sync_events":
      result = await tracedQuery(
        perfTrace,
        "platform.mobile_inventory.sync_events.count",
        () =>
          supabase
            .from("sync_events")
            .select(selectOwnerOnly, countOptions)
            .eq("owner_user_id", ownerUserId),
      );
      break;
  }

  if (result.error) {
    return {
      count: null,
      errorMessage: result.error.message,
    };
  }

  return {
    count: result.count ?? 0,
    errorMessage: null,
  };
}

function mobileInventorySummaryFromCounts(input: {
  counts: Partial<Record<MobileInventoryCountKey, number | null>>;
  mapping?: ShopOwnerMapping;
}): PlatformMobileInventoryDataSummary {
  const counts = {
    categoriesCount: input.counts.categoriesCount ?? null,
    productPricesCount: input.counts.productPricesCount ?? null,
    productsCount: input.counts.productsCount ?? null,
    sharedSheetSessionsCount: input.counts.sharedSheetSessionsCount ?? null,
    suppliersCount: input.counts.suppliersCount ?? null,
    syncEventsCount: input.counts.syncEventsCount ?? null,
  };
  const countValues = Object.values(counts);
  const hasMobileInventoryData = countValues.some(
    (count) => typeof count === "number" && count > 0,
  );
  const hasUnavailableCount = countValues.some((count) => count === null);

  return {
    ...counts,
    hasMobileInventoryData,
    mobileDataScope: "owner_scoped",
    shopId: input.mapping?.shopId ?? null,
    shopInventoryMappingState: input.mapping?.mappingState ?? "not_configured",
    status: hasMobileInventoryData
      ? "present"
      : hasUnavailableCount
        ? "unavailable"
        : "none",
  };
}

async function loadMobileInventoryDataSummaries(
  supabase: SupabaseServerClient,
  ownerUserIds: readonly string[],
  mappings: readonly ShopOwnerMapping[],
  perfTrace?: AdminWebPerfTrace,
) {
  const ids = Array.from(new Set(ownerUserIds)).filter(isUuidLike);
  const summaries = new Map<string, PlatformMobileInventoryDataSummary>();
  const unavailableTables = new Set<MobileInventoryCountTable>();

  if (ids.length === 0) {
    return {
      summaries,
      unavailableTables: [] as MobileInventoryCountTable[],
    };
  }

  const countsByOwnerId = new Map<
    string,
    Partial<Record<MobileInventoryCountKey, number | null>>
  >();

  for (const ownerUserId of ids) {
    countsByOwnerId.set(ownerUserId, {});
  }

  for (const { key, table } of mobileInventoryCountTables) {
    const tableCounts = await Promise.all(
      ids.map(async (ownerUserId) => {
        const result = await safeCountOwnerRows(
          supabase,
          table,
          ownerUserId,
          perfTrace,
        );

        if (result.errorMessage) {
          unavailableTables.add(table);
        }

        return { count: result.count, ownerUserId };
      }),
    );

    for (const { count, ownerUserId } of tableCounts) {
      const ownerCounts = countsByOwnerId.get(ownerUserId) ?? {};
      ownerCounts[key] = count;
      countsByOwnerId.set(ownerUserId, ownerCounts);
    }
  }

  for (const ownerUserId of ids) {
    const mapping = shopOwnerMappingForOwner(ownerUserId, mappings);
    summaries.set(
      ownerUserId,
      mobileInventorySummaryFromCounts({
        counts: countsByOwnerId.get(ownerUserId) ?? {},
        mapping,
      }),
    );
  }

  return {
    summaries,
    unavailableTables: Array.from(unavailableTables),
  };
}

function buildDataHealth(input: {
  auditLogs: readonly AuditLog[];
  platformAdmins: readonly PlatformAdminRecord[];
  profiles: readonly Profile[];
  shopDevices: readonly PlatformDeviceOverview[];
  shopMembers: readonly ShopMember[];
  shopOwnerMappings: readonly ShopOwnerMapping[];
  shops: readonly Shop[];
  staffSafeRows: readonly StaffSafeSummary[];
  syncEvents: readonly PlatformSyncOverview[];
  readIssues: readonly PlatformReadIssue[];
}): PlatformDataHealth {
  const shopsById = shopById(input.shops);
  const activeOwnerShopIds = new Set(
    input.shopMembers
      .filter(
        (member) =>
          member.role_id === "shop_owner" &&
          isOperationalMembership(member, shopsById.get(member.shop_id)),
      )
      .map((member) => member.shop_id),
  );
  const memberProfileIds = new Set(
    input.shopMembers
      .filter((member) =>
        isOperationalMembership(member, shopsById.get(member.shop_id)),
      )
      .map((member) => member.profile_id),
  );
  const profileIds = new Set(input.profiles.map((profile) => profile.profile_id));
  const shopIds = new Set(input.shops.map((shop) => shop.shop_id));
  const shopByOwner = new Map(
    input.shopOwnerMappings
      .filter((mapping) => mapping.mappingState === "mapped" && mapping.ownerUserId)
      .map((mapping) => [mapping.ownerUserId as string, mapping.shopId]),
  );
  const recentSyncShopIds = new Set(
    input.syncEvents
      .map((event) => shopByOwner.get(event.owner_user_id))
      .filter((shopId): shopId is string => Boolean(shopId)),
  );

  const platformAdminProfileIds = new Set(
    input.platformAdmins
      .filter((admin) => admin.status === "active")
      .map((admin) => admin.profile_id),
  );

  return {
    audit_coverage: input.auditLogs.length > 0 ? "PASS" : "PASS_WITH_NOTES",
    device_schema_status:
      input.shopDevices.length > 0 ? "PASS" : "PASS_WITH_NOTES",
    inventory_mapping_status: input.shopOwnerMappings.some(
      (mapping) => mapping.mappingState === "mapped",
    )
      ? "PASS"
      : "PASS_WITH_NOTES",
    migration_drift_status: "NOT_RUN",
    orphaned_memberships: input.shopMembers.filter(
      (member) => !profileIds.has(member.profile_id) || !shopIds.has(member.shop_id),
    ).length,
    profiles_without_membership: input.profiles.filter(
      (profile) =>
        !memberProfileIds.has(profile.profile_id) &&
        !platformAdminProfileIds.has(profile.profile_id),
    ).length,
    shops_without_owner: input.shops.filter(
      (shop) =>
        shop.shop_status !== "archived" &&
        shop.shop_status !== "pending_setup" &&
        !activeOwnerShopIds.has(shop.shop_id),
    ).length,
    staff_schema_status: input.readIssues.some(
      (issue) => issue.area === "staff_accounts_safe",
    )
      ? "BLOCKED"
      : input.staffSafeRows.length > 0
        ? "PASS"
        : "PASS_WITH_NOTES",
    suspended_shops_with_recent_activity: input.shops.filter(
      (shop) =>
        shop.shop_status === "suspended" && recentSyncShopIds.has(shop.shop_id),
    ).length,
    sync_history_mapping_status:
      input.syncEvents.length > 0 ? "PASS" : "PASS_WITH_NOTES",
  };
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function uniqueProfileRows(rows: readonly ProfileRowCandidate[]) {
  const seen = new Set<string>();
  const uniqueRows: ProfileRowCandidate[] = [];

  for (const row of rows) {
    if (seen.has(row.profile_id)) {
      continue;
    }

    seen.add(row.profile_id);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

async function loadProfileRows(
  supabase: SupabaseServerClient,
  searchQuery?: string,
  perfTrace?: AdminWebPerfTrace,
) {
  const selectColumns =
    "profile_id,display_name,profile_status,created_at,updated_at,disabled_at";
  const normalizedSearch = normalizePlatformUserSearchQuery(searchQuery);

  if (!normalizedSearch) {
    return tracedQuery(perfTrace, "platform.profiles.list", () =>
      supabase
        .from("profiles")
        .select(selectColumns)
        .order("created_at", { ascending: false })
        .limit(200),
    );
  }

  const displayNameResult = await tracedQuery(
    perfTrace,
    "platform.profiles.search_display_name",
    () =>
      supabase
        .from("profiles")
        .select(selectColumns)
        .ilike(
          "display_name",
          `%${escapePostgrestLikePattern(normalizedSearch)}%`,
        )
        .order("created_at", { ascending: false })
        .limit(200),
  );

  if (displayNameResult.error) {
    return displayNameResult;
  }

  if (!isUuidLike(normalizedSearch)) {
    return displayNameResult;
  }

  const idResult = await tracedQuery(
    perfTrace,
    "platform.profiles.search_profile_id",
    () =>
      supabase
        .from("profiles")
        .select(selectColumns)
        .eq("profile_id", normalizedSearch)
        .limit(1),
  );

  if (idResult.error) {
    return idResult;
  }

  return {
    ...displayNameResult,
    data: uniqueProfileRows([
      ...((idResult.data ?? []) as ProfileRowCandidate[]),
      ...((displayNameResult.data ?? []) as ProfileRowCandidate[]),
    ]),
  };
}

async function loadProfilesByIds(
  supabase: SupabaseServerClient,
  profileIds: readonly string[],
  perfTrace?: AdminWebPerfTrace,
) {
  const ids = Array.from(new Set(profileIds)).filter(isUuidLike);

  if (ids.length === 0) {
    return { data: [], error: null };
  }

  const rows: ProfileRowCandidate[] = [];

  for (let index = 0; index < ids.length; index += 200) {
    const batchIds = ids.slice(index, index + 200);
    const result = await tracedQuery(
      perfTrace,
      "platform.profiles.by_ids",
      () =>
        supabase
          .from("profiles")
          .select(
            "profile_id,display_name,profile_status,created_at,updated_at,disabled_at",
          )
          .in("profile_id", batchIds),
    );

    if (result.error) {
      return result;
    }

    rows.push(...((result.data ?? []) as ProfileRowCandidate[]));
  }

  return { data: rows, error: null };
}

function shopAccessStateForProfile(
  profileId: string,
  members: readonly ShopMember[],
  shops: readonly Shop[],
  platformAdmins: readonly PlatformAdminRecord[],
): PlatformShopAccessState {
  const hasMembership =
    operationalMembershipsForProfile(profileId, shops, members).length > 0;
  const isPlatformAdmin = platformAdmins.some(
    (admin) => admin.profile_id === profileId && admin.status === "active",
  );

  if (hasMembership && isPlatformAdmin) {
    return "member_and_platform_admin";
  }

  if (isPlatformAdmin) {
    return "platform_admin";
  }

  return hasMembership ? "member" : "none";
}

function buildUserAccounts(input: {
  authIdentities: readonly PlatformAuthIdentitySummary[];
  authIdentitiesAvailable: boolean;
  mobileInventoryDataByOwnerId: ReadonlyMap<
    string,
    PlatformMobileInventoryDataSummary
  >;
  platformAdmins: readonly PlatformAdminRecord[];
  profiles: readonly Profile[];
  shopMembers: readonly ShopMember[];
  shops: readonly Shop[];
}) {
  const profileById = new Map(
    input.profiles.map((profile) => [profile.profile_id, profile]),
  );
  const authById = new Map(
    input.authIdentities.map((identity) => [identity.authUserId, identity]),
  );
  const shopsById = shopById(input.shops);
  const userIds = new Set<string>([
    ...profileById.keys(),
    ...authById.keys(),
  ]);
  const accounts: PlatformUserAccountSummary[] = [];

  for (const profileId of userIds) {
    const profile = profileById.get(profileId);
    const authIdentity = authById.get(profileId);
    const profileMemberships = input.shopMembers.filter(
      (member) => member.profile_id === profileId,
    );
    const shopAdminMemberships = profileMemberships.filter(isShopAdminRole);
    const currentShopAdminMembershipCount = shopAdminMemberships.filter((member) =>
      isOperationalMembership(member, shopsById.get(member.shop_id)),
    ).length;
    const historicalShopAdminMembershipCount = shopAdminMemberships.filter(
      (member) =>
        isActiveMembershipStatus(member.membership_status) &&
        !isOperationalMembership(member, shopsById.get(member.shop_id)),
    ).length;
    const disabledShopAdminMembershipCount = shopAdminMemberships.filter(
      (member) => !isActiveMembershipStatus(member.membership_status),
    ).length;
    const membershipCount = operationalMembershipsForProfile(
      profileId,
      input.shops,
      input.shopMembers,
    ).length;
    const profileSyncState: PlatformProfileSyncState =
      profile && authIdentity
        ? "profile_ok"
        : authIdentity
          ? "auth_only"
          : input.authIdentitiesAvailable
            ? "profile_only"
            : "origin_unavailable";

    accounts.push({
      createdAt: profile?.created_at ?? authIdentity?.createdAt ?? "Not captured",
      currentShopAdminMembershipCount,
      disabledShopAdminMembershipCount,
      displayName:
        profile?.display_name ??
        authIdentity?.displayName ??
        `Profile ${profileId.slice(0, 8)}`,
      email: authIdentity?.email ?? "Auth identity unavailable",
      historicalShopAdminMembershipCount,
      membershipCount,
      mobileInventoryData:
        input.mobileInventoryDataByOwnerId.get(profileId) ??
        emptyMobileInventoryDataSummary(),
      nonOperationalMembershipCount: profileMemberships.length - membershipCount,
      profileId,
      profileStatus: profile?.profile_status ?? "not_configured",
      profileSyncState,
      provider: authIdentity?.provider ?? "Auth identity unavailable",
      providerType: authIdentity?.providerType ?? "unavailable",
      shopAdminMembershipCount: shopAdminMemberships.length,
      shopAccessState: shopAccessStateForProfile(
        profileId,
        input.shopMembers,
        input.shops,
        input.platformAdmins,
      ),
      totalMembershipCount: profileMemberships.length,
    });
  }

  return accounts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function loadPlatformShopRows(
  supabase: SupabaseServerClient,
  perfTrace?: AdminWebPerfTrace,
) {
  const fiscalSelect =
    "shop_id,shop_code,shop_name,shop_status,company_rut,business_giro,business_address,business_city,legal_representative_rut,fiscal_identity_locked_by_platform,created_at,updated_at,archived_at,suspended_at,status_changed_at,status_reason_redacted";
  const baseSelect =
    "shop_id,shop_code,shop_name,shop_status,created_at,updated_at,archived_at,suspended_at,status_changed_at,status_reason_redacted";
  const result = await tracedQuery(perfTrace, "platform.shops.list_fiscal", () =>
    supabase
      .from("shops")
      .select(fiscalSelect)
      .order("created_at", { ascending: false })
      .limit(200),
  );

  if (!result.error) {
    return result;
  }

  return tracedQuery(perfTrace, "platform.shops.list_basic_fallback", () =>
    supabase
      .from("shops")
      .select(baseSelect)
      .order("created_at", { ascending: false })
      .limit(200),
  );
}

async function loadRows(
  supabase: SupabaseServerClient,
  options: PlatformAdminReadModelOptions = {},
) {
  const normalizedUsersSearch = normalizePlatformUserSearchQuery(
    options.usersSearchQuery,
  );
  const perfTrace = options.perfTrace;
  const includeAuditLogs = options.includeAuditLogs ?? true;
  const auditLogLimit = Math.max(1, Math.min(options.auditLogLimit ?? 200, 200));
  const includeAuthIdentities = Boolean(options.includeAuthIdentities);
  const includeMobileInventoryCounts =
    options.includeMobileInventoryCounts ??
    Boolean(options.includeAuthIdentities || options.mobileInventoryShopIds?.length);
  const includePlatformAdmins = options.includePlatformAdmins ?? true;
  const includeProfiles = options.includeProfiles ?? true;
  const includeShopDevices = options.includeShopDevices ?? true;
  const includeShopMembers = options.includeShopMembers ?? true;
  const includeShopOwnerMappings = options.includeShopOwnerMappings ?? true;
  const includeShops = options.includeShops ?? true;
  const includeStaffSafeRows = options.includeStaffSafeRows ?? true;
  const includeSyncEvents = options.includeSyncEvents ?? true;
  const skippedRowsResult = { data: [], error: null };
  const authIdentitiesPromise = includeAuthIdentities
    ? loadPlatformAuthIdentitySummaries(normalizedUsersSearch, perfTrace)
    : Promise.resolve<PlatformAuthIdentityLoadResult>({
        identities: [],
        reason: "Auth identity summaries are loaded only for the Users section.",
        scannedCount: 0,
        status: "not_configured",
        truncated: false,
      });
  perfTrace?.mark("platform.readModel.loadRows.start", {
    hasUsersSearchQuery: Boolean(normalizedUsersSearch),
    auditLogLimit,
    includeAuditLogs,
    includeAuthIdentities,
    includeMobileInventoryCounts,
    includePlatformAdmins,
    includeProfiles,
    includeShopDevices,
    includeShopMembers,
    includeShopOwnerMappings,
    includeShops,
    includeStaffSafeRows,
    includeSyncEvents,
    mobileInventoryShopIdsCount: options.mobileInventoryShopIds?.length ?? 0,
    readModelName: options.readModelName ?? "getPlatformAdminReadModel",
  });
  const [
    profilesResult,
    shopsResult,
    membersResult,
    platformAdminsResult,
    mappingsResult,
    auditResult,
    devicesResult,
    syncResult,
    staffResult,
    authIdentitiesResult,
  ] = await Promise.all([
    includeProfiles
      ? loadProfileRows(supabase, normalizedUsersSearch, perfTrace)
      : Promise.resolve(skippedRowsResult),
    includeShops
      ? loadPlatformShopRows(supabase, perfTrace)
      : Promise.resolve(skippedRowsResult),
    includeShopMembers
      ? tracedQuery(perfTrace, "platform.shop_members.list", () =>
          supabase
            .from("shop_members")
            .select(
              "shop_member_id,profile_id,shop_id,role_key,membership_status,created_at,updated_at",
            )
            .order("created_at", { ascending: false })
            .limit(500),
        )
      : Promise.resolve(skippedRowsResult),
    includePlatformAdmins
      ? tracedQuery(perfTrace, "platform.platform_admins.list", () =>
          supabase
            .from("platform_admins")
            .select(
              "platform_admin_id,profile_id,status,granted_at,revoked_at,last_reviewed_at,reason_redacted",
            )
            .order("granted_at", { ascending: false })
            .limit(100),
        )
      : Promise.resolve(skippedRowsResult),
    includeShopOwnerMappings
      ? tracedQuery(perfTrace, "platform.shop_inventory_sources.list", () =>
          supabase
            .from("shop_inventory_sources")
            .select(
              "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,created_at,verified_at,disabled_at",
            )
            .order("created_at", { ascending: false })
            .limit(500),
        )
      : Promise.resolve(skippedRowsResult),
    includeAuditLogs
      ? tracedQuery(perfTrace, "platform.audit_logs.list", () =>
          supabase
            .from("audit_logs")
            .select(
              "audit_log_id,actor_profile_id,scope,shop_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(auditLogLimit),
        )
      : Promise.resolve(skippedRowsResult),
    includeShopDevices
      ? tracedQuery(perfTrace, "platform.shop_devices.list", () =>
          supabase
            .from("shop_devices")
            .select(
              "shop_device_id,shop_id,device_identifier,display_name,device_type,status,app_version,last_seen_at,updated_at",
            )
            .order("updated_at", { ascending: false })
            .limit(300),
        )
      : Promise.resolve(skippedRowsResult),
    includeSyncEvents
      ? tracedQuery(perfTrace, "platform.sync_events.list", () =>
          supabase
            .from("sync_events")
            .select(
              "id,owner_user_id,store_id,source,source_device_id,domain,event_type,changed_count,metadata,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(300),
        )
      : Promise.resolve(skippedRowsResult),
    includeStaffSafeRows
      ? tracedQuery(perfTrace, "platform.staff_accounts_safe.list", () =>
          supabase
            .from("staff_accounts_safe")
            .select("staff_id,shop_id,status,role_key,updated_at,last_login_at")
            .order("updated_at", { ascending: false })
            .limit(200),
        )
      : Promise.resolve(skippedRowsResult),
    authIdentitiesPromise,
  ]);

  const firstError = [
    profilesResult.error,
    shopsResult.error,
    membersResult.error,
    platformAdminsResult.error,
    mappingsResult.error,
    auditResult.error,
    devicesResult.error,
    syncResult.error,
  ].find(Boolean);

  if (firstError) {
    return { error: firstError };
  }

  const readIssues: PlatformReadIssue[] = [];
  const authIdentities =
    authIdentitiesResult.status === "ready" ? authIdentitiesResult.identities : [];

  let profileRows = (profilesResult.data ?? []) as ProfileRowCandidate[];

  const requestedMobileInventoryShopIds = new Set(
    (options.mobileInventoryShopIds ?? []).filter(isUuidLike),
  );
  const requestedMobileInventoryOwnerIds = includeMobileInventoryCounts
    ? ((mappingsResult.data ?? []) as ShopOwnerMappingRowCandidate[])
        .filter(
          (mapping) =>
            typeof mapping.shop_id === "string" &&
            Boolean(mapping.owner_user_id) &&
            requestedMobileInventoryShopIds.has(mapping.shop_id),
        )
        .map((mapping) => mapping.owner_user_id)
        .filter((ownerUserId): ownerUserId is string => Boolean(ownerUserId))
    : [];
  const relatedProfileIds = new Set<string>([
    ...authIdentities.map((identity) => identity.authUserId),
    ...((membersResult.data ?? []) as ShopMemberRowCandidate[]).map(
      (member) => member.profile_id,
    ),
    ...((platformAdminsResult.data ?? []) as Tables["platform_admins"]["Row"][]).map(
      (admin) => admin.profile_id,
    ),
    ...((auditResult.data ?? []) as AuditLogRowCandidate[])
      .map((audit) => audit.actor_profile_id)
      .filter((profileId): profileId is string => Boolean(profileId)),
    ...requestedMobileInventoryOwnerIds,
  ]);

  if (relatedProfileIds.size > 0) {
    const existingProfileIds = new Set(profileRows.map((row) => row.profile_id));
    const missingProfileIds = Array.from(relatedProfileIds).filter(
      (profileId) => !existingProfileIds.has(profileId),
    );
    const linkedProfilesResult = await loadProfilesByIds(
      supabase,
      missingProfileIds,
      perfTrace,
    );

    if (linkedProfilesResult.error) {
      return { error: linkedProfilesResult.error };
    }

    profileRows = uniqueProfileRows([
      ...profileRows,
      ...((linkedProfilesResult.data ?? []) as ProfileRowCandidate[]),
    ]);
  }

  if (staffResult.error) {
    readIssues.push({
      area: "staff_accounts_safe",
      code:
        typeof staffResult.error.code === "string"
          ? staffResult.error.code
          : "staff_accounts_safe_read_blocked",
      message:
        "Staff safe read model is unavailable through the current RLS/grant boundary.",
      severity: "warning",
    });
  }

  if (includeAuthIdentities && authIdentitiesResult.status !== "ready") {
    readIssues.push({
      area: "auth_identities",
      code: authIdentitiesResult.status,
      message: authIdentitiesResult.reason,
      severity: "warning",
    });
  }

  if (authIdentitiesResult.status === "ready" && authIdentitiesResult.truncated) {
    readIssues.push({
      area: "auth_identities",
      code: "auth_identity_scan_truncated",
      message:
        "Supabase Auth identity summaries were scanned through a bounded server-side page limit.",
      severity: "warning",
    });
  }

  const profiles = profileRows.map((row) => mapProfileRow(row));
  const shops = (shopsResult.data ?? []).map((row) =>
    mapShopRow(row as ShopRowCandidate),
  );
  const shopMembers = (membersResult.data ?? []).map((row) =>
    mapShopMemberRow(row as ShopMemberRowCandidate),
  );
  const platformAdmins = (platformAdminsResult.data ?? []).map((row) =>
    mapPlatformAdminRow(row as Tables["platform_admins"]["Row"]),
  );
  const shopOwnerMappings = (mappingsResult.data ?? []).map((row) =>
    mapShopOwnerMappingRow(row as ShopOwnerMappingRowCandidate),
  );
  const auditLogs = (auditResult.data ?? []).map((row) =>
    mapAuditRow(row as AuditLogRowCandidate),
  );
  const shopDevices = (devicesResult.data ?? []).map((row) =>
    mapDeviceRow(row as Tables["shop_devices"]["Row"]),
  );
  const syncEvents = (syncResult.data ?? []).map((row) =>
    mapSyncRow(row as Tables["sync_events"]["Row"]),
  );
  const visibleAccountIds = new Set([
    ...profiles.map((profile) => profile.profile_id),
    ...authIdentities.map((identity) => identity.authUserId),
  ]);
  const mappedVisibleAccountOwnerIds = includeMobileInventoryCounts && includeAuthIdentities
    ? shopOwnerMappings
        .map((mapping) => mapping.ownerUserId)
        .filter(
          (ownerUserId): ownerUserId is string =>
            typeof ownerUserId === "string" &&
            visibleAccountIds.has(ownerUserId),
        )
    : [];
  const mobileInventoryOwnerIds = Array.from(
    new Set([
      ...requestedMobileInventoryOwnerIds,
      ...mappedVisibleAccountOwnerIds,
    ]),
  );
  const mobileInventoryDataResult =
    mobileInventoryOwnerIds.length > 0
      ? await loadMobileInventoryDataSummaries(
          supabase,
          mobileInventoryOwnerIds,
          shopOwnerMappings,
          perfTrace,
        )
    : {
        summaries: new Map<string, PlatformMobileInventoryDataSummary>(),
        unavailableTables: [] as MobileInventoryCountTable[],
      };

  if (mobileInventoryDataResult.unavailableTables.length > 0) {
    readIssues.push({
      area: "mobile_inventory_data",
      code: "mobile_inventory_counts_unavailable",
      message: `Mobile inventory counts are unavailable for ${mobileInventoryDataResult.unavailableTables.join(", ")} through the current read boundary.`,
      severity: "warning",
    });
  }

  const staffSafeRows = staffResult.error
    ? []
    : ((staffResult.data ?? []) as StaffSafeSummary[]);
  const userAccounts = perfTrace
    ? await perfTrace.time("platform.buildUserAccounts", async () =>
        buildUserAccounts({
          authIdentities,
          authIdentitiesAvailable: authIdentitiesResult.status === "ready",
          mobileInventoryDataByOwnerId: mobileInventoryDataResult.summaries,
          platformAdmins,
          profiles,
          shopMembers,
          shops,
        }),
      )
    : buildUserAccounts({
        authIdentities,
        authIdentitiesAvailable: authIdentitiesResult.status === "ready",
        mobileInventoryDataByOwnerId: mobileInventoryDataResult.summaries,
        platformAdmins,
        profiles,
        shopMembers,
        shops,
      });
  const dataHealth = perfTrace
    ? await perfTrace.time("platform.buildDataHealth", async () =>
        buildDataHealth({
          auditLogs,
          platformAdmins,
          profiles,
          shopDevices,
          shopMembers,
          shopOwnerMappings,
          shops,
          staffSafeRows,
          syncEvents,
          readIssues,
        }),
      )
    : buildDataHealth({
        auditLogs,
        platformAdmins,
        profiles,
        shopDevices,
        shopMembers,
        shopOwnerMappings,
        shops,
        staffSafeRows,
        syncEvents,
        readIssues,
      });

  return {
    data: {
      auditLogs,
      authIdentities,
      authIdentityStatus: {
        reason:
          authIdentitiesResult.status === "ready"
            ? undefined
            : authIdentitiesResult.reason,
        scannedCount: authIdentitiesResult.scannedCount,
        status: authIdentitiesResult.status,
        truncated: authIdentitiesResult.truncated,
      },
      dataHealth,
      platformAdminProfileIds: platformAdmins
        .filter((admin) => admin.status === "active")
        .map((admin) => admin.profile_id),
      platformAdmins,
      profiles,
      readIssues,
      runtimeTarget: getSupabaseRuntimeTargetDiagnostic(),
      shopDevices,
      shopMembers,
      shopOwnerMappings,
      shops,
      staffSafeRows,
      syncEvents,
      userAccounts,
      usersSearchQuery: normalizedUsersSearch,
    },
  };
}

export function getPlatformAdminReadModelFoundation(): PlatformAdminReadModelFoundation {
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return foundation(
      "not_configured",
      "Supabase runtime is not configured for the server Platform Admin boundary.",
    );
  }

  return foundation(
    "ready",
    "Server-side Platform Admin read model uses RLS and explicit column selection.",
  );
}

function readModelPerfMeta(
  model: PlatformAdminLiveReadModel,
  options: PlatformAdminReadModelOptions,
) {
  return {
    auditLogsCount: model.auditLogs.length,
    authIdentitiesCount: model.authIdentities.length,
    authIdentitiesScannedCount: model.authIdentityStatus.scannedCount,
    hasUsersSearchQuery: Boolean(
      normalizePlatformUserSearchQuery(options.usersSearchQuery),
    ),
    includeAuthIdentities: Boolean(options.includeAuthIdentities),
    mobileInventoryShopIdsCount: options.mobileInventoryShopIds?.length ?? 0,
    platformAdminsCount: model.platformAdmins.length,
    profilesCount: model.profiles.length,
    readIssuesCount: model.readIssues.length,
    readModel: options.readModelName ?? "getPlatformAdminReadModel",
    shopDevicesCount: model.shopDevices.length,
    shopMembersCount: model.shopMembers.length,
    shopOwnerMappingsCount: model.shopOwnerMappings.length,
    shopsCount: model.shops.length,
    staffSafeRowsCount: model.staffSafeRows.length,
    status: model.status,
    syncEventsCount: model.syncEvents.length,
    userAccountsCount: model.userAccounts.length,
  };
}

export async function getPlatformAdminReadModel(
  options: PlatformAdminReadModelOptions = {},
): Promise<PlatformAdminLiveReadModel> {
  const ownsTrace = !options.perfTrace;
  const perfTrace =
    options.perfTrace ??
    createAdminWebPerfTrace("platform.getPlatformAdminReadModel", {
      hasUsersSearchQuery: Boolean(
        normalizePlatformUserSearchQuery(options.usersSearchQuery),
      ),
      includeAuthIdentities: Boolean(options.includeAuthIdentities),
      mobileInventoryShopIdsCount: options.mobileInventoryShopIds?.length ?? 0,
      readModel: options.readModelName ?? "getPlatformAdminReadModel",
    });
  const complete = (model: PlatformAdminLiveReadModel) => {
    if (ownsTrace) {
      perfTrace.flush(readModelPerfMeta(model, options));
    }

    return model;
  };
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return complete(emptyModel(
      "not_configured",
      "Supabase runtime is not configured for the server Platform Admin boundary.",
    ));
  }

  const supabase = await perfTrace.time("platform.createSupabaseServerClient", () =>
    createSupabaseServerClient(config),
  );

  if (!supabase) {
    return complete(emptyModel(
      "not_configured",
      "Supabase server client is unavailable for this request.",
    ));
  }

  const authz = await perfTrace.time("platform.authorizeCurrentPlatformAdmin", () =>
    authorizeCurrentPlatformAdmin(supabase, perfTrace),
  );

  if (authz.status !== "authorized") {
    return complete(emptyModel(authz.status, authz.reason));
  }

  const loaded = await perfTrace.time("platform.loadRows", () =>
    loadRows(supabase, {
      ...options,
      perfTrace,
    }),
  );

  if ("error" in loaded) {
    return complete(emptyModel(
      "error",
      "The Platform Admin read model could not be loaded through RLS.",
    ));
  }

  return complete({
    ...foundation(
      "ready",
      "Server-side Platform Admin read model loaded through RLS.",
    ),
    currentProfileId: authz.userId,
    ...loaded.data,
  });
}

export function getPlatformOverviewReadModel(
  options: PlatformAdminReadModelOptions = {},
) {
  return getPlatformAdminReadModel({
    ...options,
    includeAuditLogs: true,
    includeAuthIdentities: false,
    includeMobileInventoryCounts: false,
    includePlatformAdmins: true,
    includeProfiles: true,
    includeShopDevices: true,
    includeShopMembers: true,
    includeShopOwnerMappings: false,
    includeShops: true,
    includeStaffSafeRows: false,
    includeSyncEvents: true,
    auditLogLimit: 25,
    readModelName: "getPlatformOverviewReadModel",
  });
}

export function getPlatformUsersReadModel(
  options: PlatformAdminReadModelOptions = {},
) {
  return getPlatformAdminReadModel({
    ...options,
    includeAuditLogs: false,
    includeAuthIdentities: true,
    includeMobileInventoryCounts: false,
    includePlatformAdmins: true,
    includeProfiles: true,
    includeShopDevices: false,
    includeShopMembers: true,
    includeShopOwnerMappings: false,
    includeShops: true,
    includeStaffSafeRows: false,
    includeSyncEvents: false,
    readModelName: "getPlatformUsersReadModel",
  });
}

export function getPlatformShopAdminsReadModel(
  options: PlatformAdminReadModelOptions = {},
) {
  return getPlatformAdminReadModel({
    ...options,
    includeAuditLogs: false,
    includeAuthIdentities: false,
    includeMobileInventoryCounts: false,
    includePlatformAdmins: true,
    includeProfiles: true,
    includeShopDevices: false,
    includeShopMembers: true,
    includeShopOwnerMappings: false,
    includeShops: true,
    includeStaffSafeRows: false,
    includeSyncEvents: false,
    readModelName: "getPlatformShopAdminsReadModel",
  });
}

export function getPlatformAdminsReadModel(
  options: PlatformAdminReadModelOptions = {},
) {
  return getPlatformAdminReadModel({
    ...options,
    includeAuditLogs: false,
    includeAuthIdentities: false,
    includeMobileInventoryCounts: false,
    includePlatformAdmins: true,
    includeProfiles: true,
    includeShopDevices: false,
    includeShopMembers: true,
    includeShopOwnerMappings: false,
    includeShops: true,
    includeStaffSafeRows: false,
    includeSyncEvents: false,
    readModelName: "getPlatformAdminsReadModel",
  });
}

export function getPlatformShopsReadModel(
  options: PlatformAdminReadModelOptions = {},
) {
  return getPlatformAdminReadModel({
    ...options,
    includeAuditLogs: false,
    includeAuthIdentities: false,
    includeMobileInventoryCounts: false,
    includePlatformAdmins: false,
    includeProfiles: true,
    includeShopDevices: false,
    includeShopMembers: true,
    includeShopOwnerMappings: false,
    includeShops: true,
    includeStaffSafeRows: false,
    includeSyncEvents: false,
    readModelName: "getPlatformShopsReadModel",
  });
}

export function getPlatformAuditReadModel(
  options: PlatformAdminReadModelOptions = {},
) {
  return getPlatformAdminReadModel({
    ...options,
    includeAuditLogs: true,
    includeAuthIdentities: false,
    includeMobileInventoryCounts: false,
    includePlatformAdmins: false,
    includeProfiles: false,
    includeShopDevices: false,
    includeShopMembers: false,
    includeShopOwnerMappings: false,
    includeShops: true,
    includeStaffSafeRows: false,
    includeSyncEvents: false,
    auditLogLimit: 80,
    readModelName: "getPlatformAuditReadModel",
  });
}

export function getPlatformSystemReadModel(
  options: PlatformAdminReadModelOptions = {},
) {
  return getPlatformAdminReadModel({
    ...options,
    includeAuditLogs: false,
    includeAuthIdentities: false,
    includeMobileInventoryCounts: false,
    includePlatformAdmins: false,
    includeProfiles: false,
    includeShopDevices: false,
    includeShopMembers: false,
    includeShopOwnerMappings: false,
    includeShops: true,
    includeStaffSafeRows: false,
    includeSyncEvents: false,
    readModelName: "getPlatformSystemReadModel",
  });
}
