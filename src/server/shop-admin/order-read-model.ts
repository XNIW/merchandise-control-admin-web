import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import { canShopAdmin } from "./permissions";
import {
  callStaffWebCustomerOrdersRead,
} from "./staff-web-lease-bound-rpc";
import { canStaffWebPerformShopAdminAction } from "./staff-web-permissions";

export const adminOrderStatuses = [
  "confirmed",
  "accepted",
  "rejected",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;

export type AdminOrderStatus = (typeof adminOrderStatuses)[number];
export type AdminOrderFulfillmentMode = "delivery" | "pickup" | "reservation";

export type AdminOrderQueueRow = {
  currencyCode: "CLP";
  fulfillmentMode: AdminOrderFulfillmentMode;
  itemCount: number;
  itemSummary: string;
  orderCode: string;
  orderId: string;
  orderStatus: AdminOrderStatus;
  orderVersion: number;
  placedAt: string;
  totalClp: number;
  updatedAt: string;
};

export type AdminOrderItem = {
  compareAtPriceClp: number | null;
  linePosition: number;
  lineTotalClp: number;
  promotionEndsAt: string | null;
  promotionName: string | null;
  publicName: string;
  quantity: number;
  unitPriceClp: number;
};

export type AdminOrderTimelineEvent = {
  actorKind: string;
  createdAt: string;
  eventVersion: number;
  reasonCode: string | null;
  source: string | null;
  status: AdminOrderStatus;
};

export type AdminOrderAuditEvent = {
  actorKind: string;
  auditId: string;
  correlationId: string | null;
  createdAt: string;
  eventKey: string;
  fromStatus: string | null;
  reasonCode: string | null;
  result: string;
  toStatus: string | null;
};

export type AdminOrderDetail = {
  audit: readonly AdminOrderAuditEvent[];
  delivery: {
    pos: {
      attemptCount: number;
      deliveredAt: string | null;
      lastErrorCode: string | null;
      status: string;
      updatedAt: string | null;
    };
    push: { status: string };
  };
  items: readonly AdminOrderItem[];
  order: {
    currencyCode: "CLP";
    deliveryFeeClp: number;
    fulfillment: Json;
    fulfillmentMode: AdminOrderFulfillmentMode;
    orderCode: string;
    orderId: string;
    orderStatus: AdminOrderStatus;
    orderVersion: number;
    placedAt: string;
    subtotalClp: number;
    totalClp: number;
    updatedAt: string;
  };
  timeline: readonly AdminOrderTimelineEvent[];
};

export type AdminOrderQueueFilters = {
  afterId?: string | null;
  afterPlacedAt?: string | null;
  fulfillmentMode?: string | null;
  limit?: number;
  orderId?: string | null;
  placedFrom?: string | null;
  placedTo?: string | null;
  query?: string | null;
  requestedShopId?: string | null;
  status?: string | null;
};

export type AdminOrdersReadModel = {
  detail: AdminOrderDetail | null;
  pagination: {
    hasMore: boolean;
    limit: number;
    nextId: string | null;
    nextPlacedAt: string | null;
    totalMatching: number;
  };
  permissions: { canManage: boolean };
  reason: string;
  rows: readonly AdminOrderQueueRow[];
  selectedShopId: string | null;
  status: "error" | "not_configured" | "ready" | "unauthorized";
  statusCounts: Readonly<Record<string, number>>;
};

type RpcObject = Record<string, Json | undefined>;

function objectValue(value: unknown): RpcObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RpcObject)
    : null;
}

function textValue(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: Json | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function booleanValue(value: Json | undefined) {
  return value === true;
}

function statusValue(value: Json | undefined): AdminOrderStatus | null {
  const text = textValue(value);
  return adminOrderStatuses.includes(text as AdminOrderStatus)
    ? (text as AdminOrderStatus)
    : null;
}

function modeValue(value: Json | undefined): AdminOrderFulfillmentMode | null {
  const text = textValue(value);
  return text === "delivery" || text === "pickup" || text === "reservation"
    ? text
    : null;
}

function arrayValue(value: Json | undefined) {
  return Array.isArray(value) ? value : [];
}

function mapQueueRow(value: Json): AdminOrderQueueRow | null {
  const row = objectValue(value);
  if (!row) return null;
  const orderId = textValue(row.orderId);
  const orderCode = textValue(row.orderCode);
  const orderStatus = statusValue(row.orderStatus);
  const orderVersion = numberValue(row.orderVersion);
  const fulfillmentMode = modeValue(row.fulfillmentMode);
  const totalClp = numberValue(row.totalClp);
  const itemCount = numberValue(row.itemCount);
  const placedAt = textValue(row.placedAt);
  const updatedAt = textValue(row.updatedAt);
  if (
    !orderId ||
    !orderCode ||
    !orderStatus ||
    orderVersion === null ||
    !fulfillmentMode ||
    totalClp === null ||
    itemCount === null ||
    !placedAt ||
    !updatedAt ||
    row.currencyCode !== "CLP"
  ) {
    return null;
  }
  return {
    currencyCode: "CLP",
    fulfillmentMode,
    itemCount,
    itemSummary: textValue(row.itemSummary) ?? "",
    orderCode,
    orderId,
    orderStatus,
    orderVersion,
    placedAt,
    totalClp,
    updatedAt,
  };
}

function mapItem(value: Json): AdminOrderItem | null {
  const item = objectValue(value);
  if (!item) return null;
  const linePosition = numberValue(item.linePosition);
  const publicName = textValue(item.publicName);
  const quantity = numberValue(item.quantity);
  const unitPriceClp = numberValue(item.unitPriceClp);
  const lineTotalClp = numberValue(item.lineTotalClp);
  if (
    linePosition === null ||
    !publicName ||
    quantity === null ||
    unitPriceClp === null ||
    lineTotalClp === null
  ) {
    return null;
  }
  return {
    compareAtPriceClp: numberValue(item.compareAtPriceClp),
    linePosition,
    lineTotalClp,
    promotionEndsAt: textValue(item.promotionEndsAt),
    promotionName: textValue(item.promotionName),
    publicName,
    quantity,
    unitPriceClp,
  };
}

function mapTimeline(value: Json): AdminOrderTimelineEvent | null {
  const event = objectValue(value);
  if (!event) return null;
  const eventVersion = numberValue(event.eventVersion);
  const status = statusValue(event.status);
  const actorKind = textValue(event.actorKind);
  const createdAt = textValue(event.createdAt);
  return eventVersion !== null && status && actorKind && createdAt
    ? {
        actorKind,
        createdAt,
        eventVersion,
        reasonCode: textValue(event.reasonCode),
        source: textValue(event.source),
        status,
      }
    : null;
}

function mapAudit(value: Json): AdminOrderAuditEvent | null {
  const event = objectValue(value);
  if (!event) return null;
  const auditId = textValue(event.auditId);
  const eventKey = textValue(event.eventKey);
  const actorKind = textValue(event.actorKind);
  const result = textValue(event.result);
  const createdAt = textValue(event.createdAt);
  return auditId && eventKey && actorKind && result && createdAt
    ? {
        actorKind,
        auditId,
        correlationId: textValue(event.correlationId),
        createdAt,
        eventKey,
        fromStatus: textValue(event.fromStatus),
        reasonCode: textValue(event.reasonCode),
        result,
        toStatus: textValue(event.toStatus),
      }
    : null;
}

function mapDetail(payload: RpcObject | null): AdminOrderDetail | null {
  const order = objectValue(payload?.order);
  const delivery = objectValue(payload?.delivery);
  const pos = objectValue(delivery?.pos);
  const push = objectValue(delivery?.push);
  if (!order || !delivery || !pos || !push) return null;
  const orderId = textValue(order.orderId);
  const orderCode = textValue(order.orderCode);
  const orderStatus = statusValue(order.orderStatus);
  const orderVersion = numberValue(order.orderVersion);
  const fulfillmentMode = modeValue(order.fulfillmentMode);
  const subtotalClp = numberValue(order.subtotalClp);
  const deliveryFeeClp = numberValue(order.deliveryFeeClp);
  const totalClp = numberValue(order.totalClp);
  const placedAt = textValue(order.placedAt);
  const updatedAt = textValue(order.updatedAt);
  const posStatus = textValue(pos.status);
  const pushStatus = textValue(push.status);
  if (
    !orderId ||
    !orderCode ||
    !orderStatus ||
    orderVersion === null ||
    !fulfillmentMode ||
    subtotalClp === null ||
    deliveryFeeClp === null ||
    totalClp === null ||
    !placedAt ||
    !updatedAt ||
    order.currencyCode !== "CLP" ||
    !posStatus ||
    !pushStatus
  ) {
    return null;
  }
  return {
    audit: arrayValue(payload?.audit)
      .map(mapAudit)
      .filter((event): event is AdminOrderAuditEvent => event !== null),
    delivery: {
      pos: {
        attemptCount: numberValue(pos.attemptCount) ?? 0,
        deliveredAt: textValue(pos.deliveredAt),
        lastErrorCode: textValue(pos.lastErrorCode),
        status: posStatus,
        updatedAt: textValue(pos.updatedAt),
      },
      push: { status: pushStatus },
    },
    items: arrayValue(payload?.items)
      .map(mapItem)
      .filter((item): item is AdminOrderItem => item !== null),
    order: {
      currencyCode: "CLP",
      deliveryFeeClp,
      fulfillment: order.fulfillment ?? {},
      fulfillmentMode,
      orderCode,
      orderId,
      orderStatus,
      orderVersion,
      placedAt,
      subtotalClp,
      totalClp,
      updatedAt,
    },
    timeline: arrayValue(payload?.timeline)
      .map(mapTimeline)
      .filter((event): event is AdminOrderTimelineEvent => event !== null),
  };
}

function statusCounts(value: Json | undefined) {
  const object = objectValue(value);
  if (!object) return {};
  return Object.fromEntries(
    Object.entries(object).flatMap(([key, raw]) => {
      const count = numberValue(raw);
      return count === null ? [] : [[key, count]];
    }),
  );
}

function boundedLimit(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0
    ? Math.min(value, 50)
    : 25;
}

function unavailable(
  status: AdminOrdersReadModel["status"],
  reason: string,
): AdminOrdersReadModel {
  return {
    detail: null,
    pagination: {
      hasMore: false,
      limit: 25,
      nextId: null,
      nextPlacedAt: null,
      totalMatching: 0,
    },
    permissions: { canManage: false },
    reason,
    rows: [],
    selectedShopId: null,
    status,
    statusCounts: {},
  };
}

export async function getAdminOrdersReadModel(
  filters: AdminOrderQueueFilters = {},
): Promise<AdminOrdersReadModel> {
  const access = await resolveShopAdminDataAccess({
    requestedShopId: filters.requestedShopId,
    requiredPermission: "orders.view",
    strictRequestedShop: true,
  });
  if (access.status !== "ready") {
    return unavailable(
      access.status === "not_configured" ? "not_configured" : "unauthorized",
      access.reason,
    );
  }

  const limit = boundedLimit(filters.limit);
  const queueRequest = {
    afterId: filters.afterId ?? undefined,
    afterPlacedAt: filters.afterPlacedAt ?? undefined,
    fulfillmentMode: filters.fulfillmentMode ?? undefined,
    limit,
    placedFrom: filters.placedFrom ?? undefined,
    placedTo: filters.placedTo ?? undefined,
    query: filters.query ?? undefined,
    status: filters.status ?? undefined,
  } satisfies Record<string, Json | undefined>;
  const detailRequest = filters.orderId
    ? ({ orderId: filters.orderId } satisfies Record<string, Json | undefined>)
    : null;
  const staffContext =
    access.principalKind === "pos_staff_manager"
      ? {
          actorStaffId: access.principal.staff.staffId,
          selectedShop: access.selectedShop,
          staffWebSession: access.principal.staffWebSession!,
        }
      : null;

  const queuePromise =
    access.principalKind === "personal_account"
      ? access.supabase.rpc("admin_customer_orders_read_v1", {
          p_operation: "queue",
          p_request: queueRequest,
          p_shop_id: access.selectedShop.shopId,
        })
      : callStaffWebCustomerOrdersRead(staffContext!, "queue", queueRequest);
  const detailPromise = !detailRequest
    ? Promise.resolve({ data: null, error: null })
    : access.principalKind === "personal_account"
      ? access.supabase.rpc("admin_customer_orders_read_v1", {
          p_operation: "detail",
          p_request: detailRequest,
          p_shop_id: access.selectedShop.shopId,
        })
      : callStaffWebCustomerOrdersRead(staffContext!, "detail", detailRequest);
  const [queueRpc, detailRpc] = await Promise.all([queuePromise, detailPromise]);
  const queuePayload = objectValue(queueRpc.data);
  const detailPayload = objectValue(detailRpc.data);
  if (
    queueRpc.error ||
    !queuePayload ||
    queuePayload.ok !== true ||
    (detailRequest &&
      (detailRpc.error || !detailPayload || detailPayload.ok !== true))
  ) {
    return {
      ...unavailable("error", "The order queue could not be loaded."),
      permissions: {
        canManage:
          access.principalKind === "personal_account"
            ? canShopAdmin(access.selectedShop.role, "orders.manage")
            : canStaffWebPerformShopAdminAction(
                access.principal.permissions,
                "orders.manage",
              ),
      },
      selectedShopId: access.selectedShop.shopId,
    };
  }

  const pagination = objectValue(queuePayload.pagination);
  return {
    detail: detailRequest ? mapDetail(detailPayload) : null,
    pagination: {
      hasMore: booleanValue(pagination?.hasMore),
      limit: numberValue(pagination?.limit) ?? limit,
      nextId: textValue(pagination?.nextId),
      nextPlacedAt: textValue(pagination?.nextPlacedAt),
      totalMatching: numberValue(pagination?.totalMatching) ?? 0,
    },
    permissions: {
      canManage:
        access.principalKind === "personal_account"
          ? canShopAdmin(access.selectedShop.role, "orders.manage")
          : canStaffWebPerformShopAdminAction(
              access.principal.permissions,
              "orders.manage",
            ),
    },
    reason: "Order queue ready.",
    rows: arrayValue(queuePayload.rows)
      .map(mapQueueRow)
      .filter((row): row is AdminOrderQueueRow => row !== null),
    selectedShopId: access.selectedShop.shopId,
    status: "ready",
    statusCounts: statusCounts(queuePayload.statusCounts),
  };
}
