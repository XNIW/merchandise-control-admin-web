import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import { canShopAdmin } from "./permissions";
import { canStaffWebPerformShopAdminAction } from "./staff-web-permissions";
import { callStaffWebDeliveryTrackingRead } from "./staff-web-lease-bound-rpc";

type JsonObject = { [key: string]: Json | undefined };

export type DeliveryTrackingRow = {
  assignedCourierCode: string | null;
  assignedCourierStaffId: string | null;
  courierPublicLabel: string | null;
  destinationSummary: {
    addressLine1: string | null;
    addressLine2: string | null;
    commune: string | null;
    region: string | null;
  } | null;
  etaEndsAt: string | null;
  etaStartsAt: string | null;
  fulfillmentMode: string;
  lastObservedAt: string | null;
  locationFreshness: "fresh" | "stale" | "unavailable";
  orderCode: string;
  orderId: string;
  orderStatus: string;
  orderStatusVersion: number;
  placedAt: string;
  trackingMode: "externalCarrier" | "liveCourier" | "statusOnly" | null;
  trackingSessionId: string | null;
  trackingState: string | null;
};

export type DeliveryCourierOption = {
  displayLabel: string;
  staffCode: string;
  staffId: string;
};

export type DeliveryTrackingReadModel = {
  canManage: boolean;
  couriers: DeliveryCourierOption[];
  isCourier: boolean;
  reason: string | null;
  rows: DeliveryTrackingRow[];
  selectedShopId: string | null;
  status: "error" | "ready" | "unauthorized";
  trackingEnabled: boolean;
};

function objectValue(value: Json | undefined): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringValue(value: Json | undefined) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: Json | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function destinationValue(value: Json | undefined) {
  const object = objectValue(value);
  if (!object) return null;

  return {
    addressLine1: stringValue(object.addressLine1),
    addressLine2: stringValue(object.addressLine2),
    commune: stringValue(object.commune),
    region: stringValue(object.region),
  };
}

function mapRow(value: Json): DeliveryTrackingRow | null {
  const row = objectValue(value);
  const orderId = stringValue(row?.orderId);
  const orderCode = stringValue(row?.orderCode);
  const orderStatus = stringValue(row?.orderStatus);
  const fulfillmentMode = stringValue(row?.fulfillmentMode);
  const placedAt = stringValue(row?.placedAt);
  const orderStatusVersion = numberValue(row?.orderStatusVersion);
  if (
    !row ||
    !orderId ||
    !orderCode ||
    !orderStatus ||
    !fulfillmentMode ||
    !placedAt ||
    orderStatusVersion === null
  ) {
    return null;
  }

  const trackingMode = stringValue(row.trackingMode);
  const locationFreshness = stringValue(row.locationFreshness);
  return {
    assignedCourierCode: stringValue(row.assignedCourierCode),
    assignedCourierStaffId: stringValue(row.assignedCourierStaffId),
    courierPublicLabel: stringValue(row.courierPublicLabel),
    destinationSummary: destinationValue(row.destinationSummary),
    etaEndsAt: stringValue(row.etaEndsAt),
    etaStartsAt: stringValue(row.etaStartsAt),
    fulfillmentMode,
    lastObservedAt: stringValue(row.lastObservedAt),
    locationFreshness:
      locationFreshness === "fresh" || locationFreshness === "stale"
        ? locationFreshness
        : "unavailable",
    orderCode,
    orderId,
    orderStatus,
    orderStatusVersion,
    placedAt,
    trackingMode:
      trackingMode === "liveCourier" ||
      trackingMode === "externalCarrier" ||
      trackingMode === "statusOnly"
        ? trackingMode
        : null,
    trackingSessionId: stringValue(row.trackingSessionId),
    trackingState: stringValue(row.trackingState),
  };
}

function mapCourier(value: Json): DeliveryCourierOption | null {
  const courier = objectValue(value);
  const staffId = stringValue(courier?.staffId);
  const staffCode = stringValue(courier?.staffCode);
  const displayLabel = stringValue(courier?.displayLabel);
  return staffId && staffCode && displayLabel
    ? { displayLabel, staffCode, staffId }
    : null;
}

function unavailable(
  status: DeliveryTrackingReadModel["status"],
  reason: string,
): DeliveryTrackingReadModel {
  return {
    canManage: false,
    couriers: [],
    isCourier: false,
    reason,
    rows: [],
    selectedShopId: null,
    status,
    trackingEnabled: false,
  };
}

export async function getDeliveryTrackingReadModel(
  requestedShopId?: string,
): Promise<DeliveryTrackingReadModel> {
  const access = await resolveShopAdminDataAccess({
    requestedShopId,
    strictRequestedShop: true,
  });
  if (access.status !== "ready") {
    return unavailable("unauthorized", access.reason);
  }

  const isCourier =
    access.principalKind === "pos_staff_manager" &&
    access.principal.roleKey === "courier";
  const canView =
    access.principalKind === "personal_account"
      ? canShopAdmin(access.selectedShop.role, "orders.delivery.view")
      : canStaffWebPerformShopAdminAction(
          access.principal.permissions,
          "orders.delivery.view",
        );
  const canTrack =
    access.principalKind === "pos_staff_manager" &&
    canStaffWebPerformShopAdminAction(
      access.principal.permissions,
      "orders.delivery.track",
    );
  if (!canView && !canTrack) {
    return unavailable(
      "unauthorized",
      "Delivery tracking view or assigned-courier permission is required.",
    );
  }

  const rpc =
    access.principalKind === "personal_account"
      ? await access.supabase.rpc("admin_delivery_tracking_read_v1", {
          p_operation: "queue",
          p_request: {},
          p_shop_id: access.selectedShop.shopId,
        })
      : await callStaffWebDeliveryTrackingRead(
          {
            actorStaffId: access.principal.staff.staffId,
            selectedShop: access.selectedShop,
            staffWebSession: access.principal.staffWebSession!,
          },
          "queue",
          {},
        );
  const payload = objectValue(rpc.data);
  if (rpc.error || !payload || payload.ok !== true) {
    return {
      ...unavailable("error", "Delivery tracking data could not be loaded."),
      isCourier,
      selectedShopId: access.selectedShop.shopId,
    };
  }

  const rows = Array.isArray(payload.rows)
    ? payload.rows.map(mapRow).filter((row): row is DeliveryTrackingRow => Boolean(row))
    : [];
  const couriers = Array.isArray(payload.couriers)
    ? payload.couriers
        .map(mapCourier)
        .filter((courier): courier is DeliveryCourierOption => Boolean(courier))
    : [];
  return {
    canManage:
      access.principalKind === "personal_account"
        ? canShopAdmin(access.selectedShop.role, "orders.delivery.manage")
        : canStaffWebPerformShopAdminAction(
            access.principal.permissions,
            "orders.delivery.manage",
          ),
    couriers,
    isCourier,
    reason: null,
    rows,
    selectedShopId: access.selectedShop.shopId,
    status: "ready",
    trackingEnabled: payload.trackingEnabled === true,
  };
}
