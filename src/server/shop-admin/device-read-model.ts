import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import type { ShopAdminShellShop } from "./shop-access";
import type {
  ShopAdminReadModelError,
  ShopAdminReadModelStatus,
} from "./read-model";

type ShopDeviceRow = Pick<
  Tables<"shop_devices">,
  | "shop_device_id"
  | "shop_id"
  | "device_identifier"
  | "device_type"
  | "display_name"
  | "app_version"
  | "status"
  | "last_seen_at"
  | "last_seen_principal_kind"
  | "last_seen_profile_id"
  | "last_seen_staff_id"
  | "metadata_redacted"
  | "reactivated_at"
  | "revoked_at"
  | "created_at"
  | "updated_at"
>;
type DeviceActivityRow = Pick<
  Tables<"sync_events">,
  | "id"
  | "domain"
  | "event_type"
  | "source"
  | "source_device_id"
  | "changed_count"
  | "created_at"
>;
type InventorySourceRow = Pick<
  Tables<"shop_inventory_sources">,
  "shop_inventory_source_id" | "owner_user_id" | "mapping_state" | "source_kind"
>;
type ProfileDisplayRow = Pick<
  Tables<"profiles">,
  "profile_id" | "display_name"
>;
type StaffDisplayRow = Pick<
  Tables<"staff_accounts_safe">,
  "display_name" | "staff_code" | "staff_id"
>;

export type ShopDeviceMapping = {
  mappingId: string;
  ownerUserId: string;
  sourceKind: string;
};

export type ShopDeviceActivity = {
  changedCount: number;
  eventCount: number;
  latestDomain: string;
  latestEventAt: string;
  latestEventId: string;
  latestEventType: string;
  source: string | null;
  sourceDeviceId: string;
};

export type ShopDeviceRegistryRow = {
  appVersion: string | null;
  createdAt: string;
  deviceDetailHref: string;
  deviceId: string;
  deviceIdentifier: string;
  deviceType: string;
  displayName: string;
  lastSeenAt: string | null;
  lastSeenAccount: string | null;
  lastSeenPrincipalKind: string;
  lastSeenStaff: string | null;
  metadataRedacted: ShopDeviceRow["metadata_redacted"];
  reactivatedAt: string | null;
  revokedAt: string | null;
  status: string;
  syncActivity: ShopDeviceActivity | null;
  updatedAt: string;
};

export type ShopDetectedSyncClient = ShopDeviceActivity & {
  authorizationStatus: "activity_hint_only";
  historyHref: string;
};

export type ShopDeviceReadModel = {
  status: ShopAdminReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  mapping: ShopDeviceMapping | null;
  devices: readonly ShopDeviceRegistryRow[];
  detectedSyncClients: readonly ShopDetectedSyncClient[];
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

type GetShopDeviceReadModelOptions = {
  client?: SupabaseServerClient | null;
  requestedShopId?: string | null;
};

const emptyRows = {
  selectedShop: null,
  mapping: null,
  devices: [],
  detectedSyncClients: [],
} as const;

const shortId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 8)}...` : null;

function redactDeviceReadModelError(error: unknown): ShopAdminReadModelError {
  const code =
    error instanceof Error && error.name ? error.name : "device_read_error";

  return {
    code,
    message: "Shop device registry read model could not be loaded.",
  };
}

function mapMapping(row: InventorySourceRow): ShopDeviceMapping | null {
  if (!row.owner_user_id) {
    return null;
  }

  return {
    mappingId: row.shop_inventory_source_id,
    ownerUserId: row.owner_user_id,
    sourceKind: row.source_kind,
  };
}

function mapDeviceActivities(rows: readonly DeviceActivityRow[]) {
  const byDeviceId = new Map<string, ShopDeviceActivity>();

  for (const row of rows) {
    const deviceId = row.source_device_id;

    if (!deviceId) {
      continue;
    }

    const existing = byDeviceId.get(deviceId);

    if (!existing) {
      byDeviceId.set(deviceId, {
        changedCount: row.changed_count,
        eventCount: 1,
        latestDomain: row.domain,
        latestEventAt: row.created_at,
        latestEventId: String(row.id),
        latestEventType: row.event_type,
        source: row.source,
        sourceDeviceId: deviceId,
      });
      continue;
    }

    byDeviceId.set(deviceId, {
      ...existing,
      changedCount: existing.changedCount + row.changed_count,
      eventCount: existing.eventCount + 1,
    });
  }

  return byDeviceId;
}

function mapDeviceRow(
  row: ShopDeviceRow,
  activityByIdentifier: Map<string, ShopDeviceActivity>,
  profilesById: Map<string, ProfileDisplayRow>,
  staffById: Map<string, StaffDisplayRow>,
): ShopDeviceRegistryRow {
  const syncActivity = activityByIdentifier.get(row.device_identifier) ?? null;
  const profile = row.last_seen_profile_id
    ? profilesById.get(row.last_seen_profile_id)
    : null;
  const staff = row.last_seen_staff_id
    ? staffById.get(row.last_seen_staff_id)
    : null;

  return {
    appVersion: row.app_version,
    createdAt: row.created_at,
    deviceDetailHref: syncActivity
      ? `/shop/history/sync:${encodeURIComponent(syncActivity.latestEventId)}`
      : "No sync event",
    deviceId: row.shop_device_id,
    deviceIdentifier: row.device_identifier,
    deviceType: row.device_type,
    displayName: row.display_name,
    lastSeenAt: row.last_seen_at ?? syncActivity?.latestEventAt ?? null,
    lastSeenAccount: row.last_seen_profile_id
      ? (profile?.display_name ?? shortId(row.last_seen_profile_id))
      : null,
    lastSeenPrincipalKind: row.last_seen_principal_kind,
    lastSeenStaff: row.last_seen_staff_id
      ? (staff?.display_name ??
        staff?.staff_code ??
        shortId(row.last_seen_staff_id))
      : null,
    metadataRedacted: row.metadata_redacted,
    reactivatedAt: row.reactivated_at,
    revokedAt: row.revoked_at,
    status: row.status,
    syncActivity,
    updatedAt: row.updated_at,
  };
}

function mapDetectedSyncClients(
  activityByIdentifier: Map<string, ShopDeviceActivity>,
  registeredIdentifiers: Set<string>,
): ShopDetectedSyncClient[] {
  return Array.from(activityByIdentifier.entries())
    .filter(([sourceDeviceId]) => !registeredIdentifiers.has(sourceDeviceId))
    .map(([, activity]) => ({
      ...activity,
      authorizationStatus: "activity_hint_only" as const,
      historyHref: `/shop/history/sync:${encodeURIComponent(activity.latestEventId)}`,
    }));
}

export async function getShopDeviceReadModel(
  options: GetShopDeviceReadModelOptions = {},
): Promise<ShopDeviceReadModel> {
  const access = await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;

  const devicesResult = await supabase
    .from("shop_devices")
    .select(
      "shop_device_id,shop_id,device_identifier,device_type,display_name,app_version,status,last_seen_at,last_seen_principal_kind,last_seen_profile_id,last_seen_staff_id,metadata_redacted,reactivated_at,revoked_at,created_at,updated_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (devicesResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping: null,
      devices: [],
      detectedSyncClients: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Device registry rows could not be loaded through RLS.",
      error: redactDeviceReadModelError(devicesResult.error),
    };
  }

  const deviceRows = devicesResult.data ?? [];
  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select("shop_inventory_source_id,owner_user_id,mapping_state,source_kind")
    .eq("shop_id", selectedShop.shopId)
    .eq("mapping_state", "mapped")
    .is("disabled_at", null)
    .maybeSingle();

  const mapping =
    !mappingResult.error && mappingResult.data
      ? mapMapping(mappingResult.data)
      : null;
  let activityByIdentifier = new Map<string, ShopDeviceActivity>();

  if (mapping) {
    const activityResult = await supabase
      .from("sync_events")
      .select(
        "id,domain,event_type,source,source_device_id,changed_count,created_at",
      )
      .eq("owner_user_id", mapping.ownerUserId)
      .not("source_device_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!activityResult.error) {
      activityByIdentifier = mapDeviceActivities(activityResult.data ?? []);
    }
  }

  const profileIds = Array.from(
    new Set(
      deviceRows
        .map((row) => row.last_seen_profile_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const staffIds = Array.from(
    new Set(
      deviceRows
        .map((row) => row.last_seen_staff_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const profilesById = new Map<string, ProfileDisplayRow>();
  const staffById = new Map<string, StaffDisplayRow>();

  if (profileIds.length > 0) {
    const profilesResult = await supabase
      .from("profiles")
      .select("profile_id,display_name")
      .in("profile_id", profileIds);

    for (const row of profilesResult.data ?? []) {
      profilesById.set(row.profile_id, row);
    }
  }

  if (staffIds.length > 0) {
    const staffResult = await supabase
      .from("staff_accounts_safe")
      .select("staff_id,staff_code,display_name")
      .eq("shop_id", selectedShop.shopId)
      .in("staff_id", staffIds);

    for (const row of staffResult.data ?? []) {
      if (row.staff_id) {
        staffById.set(row.staff_id, row);
      }
    }
  }

  const registeredIdentifiers = new Set(
    deviceRows.map((row) => row.device_identifier),
  );

  return {
    status: "ready",
    selectedShop,
    mapping,
    devices: deviceRows.map((row) =>
      mapDeviceRow(row, activityByIdentifier, profilesById, staffById),
    ),
    detectedSyncClients: mapDetectedSyncClients(
      activityByIdentifier,
      registeredIdentifiers,
    ),
    readOnly: true,
    source: "supabase_server",
    reason:
      "Server registry devices loaded for the verified selected shop, with read-only links to sync activity when available.",
  };
}
