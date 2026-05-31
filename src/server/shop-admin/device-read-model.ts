import "server-only";

import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
} from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { resolveCurrentShopAdminShellAccess } from "./shop-access";
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
  revokedAt: string | null;
  status: string;
  syncActivity: ShopDeviceActivity | null;
  updatedAt: string;
};

export type ShopDeviceReadModel = {
  status: ShopAdminReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  mapping: ShopDeviceMapping | null;
  devices: readonly ShopDeviceRegistryRow[];
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
} as const;

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
): ShopDeviceRegistryRow {
  const syncActivity = activityByIdentifier.get(row.device_identifier) ?? null;

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
    revokedAt: row.revoked_at,
    status: row.status,
    syncActivity,
    updatedAt: row.updated_at,
  };
}

export async function getShopDeviceReadModel(
  options: GetShopDeviceReadModelOptions = {},
): Promise<ShopDeviceReadModel> {
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return {
      status: "not_configured",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: "Supabase runtime env is not configured for device registry reads.",
    };
  }

  const supabase = options.client ?? (await createSupabaseServerClient(config));

  if (!supabase) {
    return {
      status: "not_configured",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: "Supabase server client is unavailable for device registry reads.",
    };
  }

  const access = await resolveCurrentShopAdminShellAccess(supabase);

  if (access.status !== "shop_admin") {
    if (access.status === "not_configured" || access.status === "error") {
      return {
        status: access.status,
        ...emptyRows,
        readOnly: true,
        source: "supabase_server",
        reason: access.reason,
      };
    }

    return {
      status: "unauthorized",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const selectedShop =
    access.availableShops.find(
      (shop) => shop.shopId === options.requestedShopId,
    ) ?? access.selectedShop;

  const devicesResult = await supabase
    .from("shop_devices")
    .select(
      "shop_device_id,shop_id,device_identifier,device_type,display_name,app_version,status,last_seen_at,revoked_at,created_at,updated_at",
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
      readOnly: true,
      source: "supabase_server",
      reason: "Device registry rows could not be loaded through RLS.",
      error: redactDeviceReadModelError(devicesResult.error),
    };
  }

  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select("shop_inventory_source_id,owner_user_id,mapping_state,source_kind")
    .eq("shop_id", selectedShop.shopId)
    .eq("mapping_state", "mapped")
    .is("disabled_at", null)
    .maybeSingle();

  if (mappingResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping: null,
      devices: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Device sync mapping could not be loaded.",
      error: redactDeviceReadModelError(mappingResult.error),
    };
  }

  const mapping = mappingResult.data ? mapMapping(mappingResult.data) : null;
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

    if (activityResult.error) {
      return {
        status: "error",
        selectedShop,
        mapping,
        devices: [],
        readOnly: true,
        source: "supabase_server",
        reason: "Mapped device activity could not be loaded through RLS.",
        error: redactDeviceReadModelError(activityResult.error),
      };
    }

    activityByIdentifier = mapDeviceActivities(activityResult.data ?? []);
  }

  return {
    status: "ready",
    selectedShop,
    mapping,
    devices: (devicesResult.data ?? []).map((row) =>
      mapDeviceRow(row, activityByIdentifier),
    ),
    readOnly: true,
    source: "supabase_server",
    reason:
      "Server registry devices loaded for the verified selected shop, with read-only links to sync activity when available.",
  };
}
