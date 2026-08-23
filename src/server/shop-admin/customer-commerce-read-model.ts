import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import {
  resolveShopAdminDataAccess,
  revalidateShopAdminDataAccessForPublish,
} from "./data-access";
import { canShopAdmin } from "./permissions";
import {
  callStaffWebAfterSalesRead,
  callStaffWebCustomerReviewsRead,
} from "./staff-web-lease-bound-rpc";
import { canStaffWebPerformShopAdminAction } from "./staff-web-permissions";

export const afterSalesStatuses = [
  "submitted",
  "reviewing",
  "approved",
  "rejected",
  "returnRequired",
  "received",
  "refundPending",
  "refunded",
  "closed",
] as const;
export type AfterSalesStatus = (typeof afterSalesStatuses)[number];

export const reviewStatuses = [
  "pending",
  "published",
  "rejected",
  "withdrawn",
] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

export type AfterSalesRow = {
  caseCode: string;
  caseId: string;
  customerDisplay: string;
  evidence: readonly { id: string; mimeType: string | null; status: string }[];
  lines: readonly { name: string; quantity: number }[];
  note: string | null;
  orderCode: string;
  paymentMethod: string | null;
  paymentStatus: string | null;
  reason: string;
  status: AfterSalesStatus;
  submittedAt: string;
  timeline: readonly { actorKind: string; createdAt: string; status: string }[];
  type: "orderProblem" | "refundRequest" | "returnRequest";
  version: number;
};

export type ReviewQueueRow = {
  comment: string | null;
  orderId: string;
  productName: string;
  publicationId: string;
  rating: number;
  reason: string | null;
  reviewId: string;
  status: ReviewStatus;
  submittedAt: string;
  version: number;
};

export type CustomerCommerceReadModel<T> = {
  canManage: boolean;
  page: number;
  pageSize: number;
  reason: string;
  rows: readonly T[];
  selectedShopId: string | null;
  status: "error" | "not_configured" | "ready" | "unauthorized";
  total: number;
};

type JsonObject = Record<string, Json | undefined>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function array(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function text(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}

function integer(value: Json | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function pageValue(value: number | undefined) {
  return Number.isSafeInteger(value) && value && value > 0 ? value : 1;
}

function pageSizeValue(value: number | undefined) {
  return Number.isSafeInteger(value) && value && value > 0
    ? Math.min(value, 50)
    : 25;
}

function unavailable<T>(
  status: CustomerCommerceReadModel<T>["status"],
  reason: string,
): CustomerCommerceReadModel<T> {
  return {
    canManage: false,
    page: 1,
    pageSize: 25,
    reason,
    rows: [],
    selectedShopId: null,
    status,
    total: 0,
  };
}

function mapAfterSalesRow(value: Json): AfterSalesRow | null {
  const row = object(value);
  const customerCase = object(row?.case);
  const customer = object(row?.customer);
  const caseId = text(customerCase?.id);
  const caseCode = text(customerCase?.caseCode);
  const orderCode = text(row?.orderCode);
  const reason = text(customerCase?.reason);
  const rawStatus = text(customerCase?.status);
  const submittedAt = text(customerCase?.submittedAt);
  const rawType = text(customerCase?.type);
  const version = integer(customerCase?.version);
  if (
    !caseId ||
    !caseCode ||
    !orderCode ||
    !reason ||
    !afterSalesStatuses.includes(rawStatus as AfterSalesStatus) ||
    !submittedAt ||
    (rawType !== "orderProblem" && rawType !== "returnRequest" && rawType !== "refundRequest") ||
    version === null
  ) {
    return null;
  }
  return {
    caseCode,
    caseId,
    customerDisplay:
      text(customer?.displayName) ?? `Cliente · ${text(customer?.reference) ?? "—"}`,
    evidence: array(customerCase?.evidence).flatMap((raw) => {
      const evidence = object(raw);
      const id = text(evidence?.id);
      const status = text(evidence?.status);
      return id && status
        ? [{ id, mimeType: text(evidence?.mimeType), status }]
        : [];
    }),
    lines: array(customerCase?.lines).flatMap((raw) => {
      const line = object(raw);
      const name = text(line?.name);
      const quantity = integer(line?.quantity);
      return name && quantity !== null ? [{ name, quantity }] : [];
    }),
    note: text(customerCase?.note),
    orderCode,
    paymentMethod: text(row?.paymentMethod),
    paymentStatus: text(row?.paymentStatus),
    reason,
    status: rawStatus as AfterSalesStatus,
    submittedAt,
    timeline: array(customerCase?.timeline).flatMap((raw) => {
      const event = object(raw);
      const actorKind = text(event?.actorKind);
      const createdAt = text(event?.createdAt);
      const status = text(event?.status);
      return actorKind && createdAt && status ? [{ actorKind, createdAt, status }] : [];
    }),
    type: rawType,
    version,
  };
}

function mapReviewRow(value: Json): ReviewQueueRow | null {
  const row = object(value);
  const reviewId = text(row?.id);
  const orderId = text(row?.orderId);
  const publicationId = text(row?.publicationId);
  const productName = text(row?.productName);
  const rating = integer(row?.rating);
  const status = text(row?.status);
  const submittedAt = text(row?.submittedAt);
  const version = integer(row?.version);
  return reviewId && orderId && publicationId && productName && rating !== null &&
    reviewStatuses.includes(status as ReviewStatus) && submittedAt && version !== null
    ? {
        comment: text(row?.comment),
        orderId,
        productName,
        publicationId,
        rating,
        reason: text(row?.reason),
        reviewId,
        status: status as ReviewStatus,
        submittedAt,
        version,
      }
    : null;
}

export async function getAfterSalesReadModel(input: {
  page?: number;
  pageSize?: number;
  requestedShopId?: string | null;
  status?: string | null;
} = {}): Promise<CustomerCommerceReadModel<AfterSalesRow>> {
  const access = await resolveShopAdminDataAccess({
    requestedShopId: input.requestedShopId,
    requiredPermission: "orders.view",
    strictRequestedShop: true,
  });
  if (access.status !== "ready") {
    return unavailable(
      access.status === "not_configured" ? "not_configured" : "unauthorized",
      access.reason,
    );
  }
  const page = pageValue(input.page);
  const pageSize = pageSizeValue(input.pageSize);
  const status = afterSalesStatuses.includes(input.status as AfterSalesStatus)
    ? (input.status as AfterSalesStatus)
    : null;
  const staffContext = access.principalKind === "pos_staff_manager"
    ? {
        actorStaffId: access.principal.staff.staffId,
        selectedShop: access.selectedShop,
        staffWebSession: access.principal.staffWebSession!,
      }
    : null;
  const rpc = access.principalKind === "personal_account"
    ? await access.supabase.rpc("admin_customer_after_sales_read_v1", {
        p_page: page,
        p_page_size: pageSize,
        p_shop_id: access.selectedShop.shopId,
        p_status: status,
      })
    : await callStaffWebAfterSalesRead(staffContext!, { page, pageSize, status });
  const payload = object(rpc.data);
  if (rpc.error || payload?.ok !== true) {
    return {
      ...unavailable<AfterSalesRow>("error", "La coda assistenza non è disponibile."),
      selectedShopId: access.selectedShop.shopId,
    };
  }
  if (!(await revalidateShopAdminDataAccessForPublish(access, "orders.view"))) {
    return {
      ...unavailable<AfterSalesRow>("unauthorized", "L’accesso allo shop è cambiato."),
      selectedShopId: access.selectedShop.shopId,
    };
  }
  return {
    canManage: access.principalKind === "personal_account"
      ? canShopAdmin(access.selectedShop.role, "orders.manage")
      : canStaffWebPerformShopAdminAction(access.principal.permissions, "orders.manage"),
    page,
    pageSize,
    reason: "Coda assistenza pronta.",
    rows: array(payload.items).map(mapAfterSalesRow).filter((row): row is AfterSalesRow => row !== null),
    selectedShopId: access.selectedShop.shopId,
    status: "ready",
    total: integer(payload.total) ?? 0,
  };
}

export async function getReviewQueueReadModel(input: {
  page?: number;
  pageSize?: number;
  requestedShopId?: string | null;
  status?: string | null;
} = {}): Promise<CustomerCommerceReadModel<ReviewQueueRow>> {
  const access = await resolveShopAdminDataAccess({
    requestedShopId: input.requestedShopId,
    requiredPermission: "storefront.view",
    strictRequestedShop: true,
  });
  if (access.status !== "ready") {
    return unavailable(
      access.status === "not_configured" ? "not_configured" : "unauthorized",
      access.reason,
    );
  }
  const page = pageValue(input.page);
  const pageSize = pageSizeValue(input.pageSize);
  const status = reviewStatuses.includes(input.status as ReviewStatus)
    ? (input.status as ReviewStatus)
    : "pending";
  const staffContext = access.principalKind === "pos_staff_manager"
    ? {
        actorStaffId: access.principal.staff.staffId,
        selectedShop: access.selectedShop,
        staffWebSession: access.principal.staffWebSession!,
      }
    : null;
  const rpc = access.principalKind === "personal_account"
    ? await access.supabase.rpc("admin_customer_reviews_read_v1", {
        p_page: page,
        p_page_size: pageSize,
        p_shop_id: access.selectedShop.shopId,
        p_status: status,
      })
    : await callStaffWebCustomerReviewsRead(staffContext!, { page, pageSize, status });
  const payload = object(rpc.data);
  if (rpc.error || payload?.ok !== true) {
    return {
      ...unavailable<ReviewQueueRow>("error", "La coda recensioni non è disponibile."),
      selectedShopId: access.selectedShop.shopId,
    };
  }
  if (!(await revalidateShopAdminDataAccessForPublish(access, "storefront.view"))) {
    return {
      ...unavailable<ReviewQueueRow>("unauthorized", "L’accesso allo shop è cambiato."),
      selectedShopId: access.selectedShop.shopId,
    };
  }
  return {
    canManage: access.principalKind === "personal_account"
      ? canShopAdmin(access.selectedShop.role, "storefront.publish")
      : canStaffWebPerformShopAdminAction(access.principal.permissions, "storefront.publish"),
    page,
    pageSize,
    reason: "Coda recensioni pronta.",
    rows: array(payload.items).map(mapReviewRow).filter((row): row is ReviewQueueRow => row !== null),
    selectedShopId: access.selectedShop.shopId,
    status: "ready",
    total: integer(payload.total) ?? 0,
  };
}
