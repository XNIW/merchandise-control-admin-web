import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import {
  callStaffWebStorefrontPromotionsRead,
  callStaffWebStorefrontRead,
} from "./staff-web-lease-bound-rpc";

export type StorefrontPublicationStatus =
  | "unpublished"
  | "draft"
  | "scheduled"
  | "published"
  | "paused"
  | "ended";

export type StorefrontPublicationRow = {
  availabilityMode: string | null;
  barcode: string;
  compareAtPriceClp: number | null;
  deliveryEnabled: boolean;
  featured: boolean;
  operationalName: string | null;
  operationalPrice: number | null;
  pickupEnabled: boolean;
  priceSourceMode: string | null;
  promotionEndsAt: string | null;
  promotionStartsAt: string | null;
  publicBrand: string | null;
  publicCategoryId: string | null;
  publicCategoryName: string | null;
  publicDescription: string | null;
  publicName: string | null;
  publicationId: string | null;
  publicationStatus: StorefrontPublicationStatus;
  publishedAt: string | null;
  publishedImageUrl: string | null;
  publishedImageVersionId: string | null;
  reservationEnabled: boolean;
  retailPriceClp: number | null;
  sortRank: number;
  sourceProductId: string;
  updatedAt: string | null;
};

export type StorefrontCategoryOption = {
  id: string;
  name: string;
  status: string;
};

export type StorefrontImageOption = {
  id: string;
  sourceProductId: string;
  status: string;
  url: string | null;
};

export type StorefrontPromotionRow = {
  conflictProductCount: number;
  discountType: "fixed_price_clp" | "percentage_bps";
  discountValue: number;
  effectiveStatus: string;
  endsAt: string;
  excludedCount: number;
  excludedPublicationIds: readonly string[];
  id: string;
  priority: number;
  productCount: number;
  publicDescription: string | null;
  publicName: string;
  publicationIds: readonly string[];
  publicationStatus: string;
  startsAt: string;
  updatedAt: string;
};

export type StorefrontPromotionPublicationOption = {
  id: string;
  name: string;
  retailPriceClp: number;
  status: string;
};

export type StorefrontPublicationsReadModel = {
  audit: readonly StorefrontAuditRow[];
  categories: readonly StorefrontCategoryOption[];
  images: readonly StorefrontImageOption[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  permissions: {
    canBulkPublish: boolean;
    canEdit: boolean;
    canManagePromotions: boolean;
    canPublish: boolean;
    canViewAudit: boolean;
  };
  promotionConflictRule: string;
  promotionPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  promotionPublications: readonly StorefrontPromotionPublicationOption[];
  promotions: readonly StorefrontPromotionRow[];
  preview: Json;
  reason: string;
  rows: readonly StorefrontPublicationRow[];
  selectedShopId: string | null;
  status: "error" | "not_configured" | "ready" | "unauthorized";
};

export type StorefrontAuditRow = {
  actorKind: string;
  after: Json;
  before: Json;
  createdAt: string;
  eventKey: string;
  id: string;
  result: string;
  targetId: string | null;
  updatedCount: number | null;
};

export type StorefrontPublicationFilters = {
  availability?: string | null;
  categoryId?: string | null;
  discounted?: boolean | null;
  missingImage?: boolean | null;
  page?: number;
  pageSize?: number;
  promotionPage?: number;
  promotionPageSize?: number;
  promotionQuery?: string | null;
  promotionStatus?: string | null;
  query?: string | null;
  requestedShopId?: string | null;
  sort?: string | null;
  status?: string | null;
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
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: Json | undefined) {
  return value === true;
}

function mapRow(value: Json): StorefrontPublicationRow | null {
  const row = objectValue(value);
  if (!row) return null;
  const sourceProductId = textValue(row.source_product_id);
  const barcode = textValue(row.barcode);
  if (!sourceProductId || !barcode) return null;
  const rawStatus = textValue(row.publication_status);
  const publicationStatus: StorefrontPublicationStatus =
    rawStatus === "draft" ||
    rawStatus === "scheduled" ||
    rawStatus === "published" ||
    rawStatus === "paused" ||
    rawStatus === "ended"
      ? rawStatus
      : "unpublished";

  return {
    availabilityMode: textValue(row.availability_mode),
    barcode,
    compareAtPriceClp: numberValue(row.compare_at_price_clp),
    deliveryEnabled: booleanValue(row.delivery_enabled),
    featured: booleanValue(row.featured),
    operationalName: textValue(row.operational_name),
    operationalPrice: numberValue(row.operational_price),
    pickupEnabled: booleanValue(row.pickup_enabled),
    priceSourceMode: textValue(row.price_source_mode),
    promotionEndsAt: textValue(row.promotion_ends_at),
    promotionStartsAt: textValue(row.promotion_starts_at),
    publicBrand: textValue(row.public_brand),
    publicCategoryId: textValue(row.public_category_id),
    publicCategoryName: textValue(row.public_category_name),
    publicDescription: textValue(row.public_description),
    publicName: textValue(row.public_name),
    publicationId: textValue(row.publication_id),
    publicationStatus,
    publishedAt: textValue(row.published_at),
    publishedImageUrl: textValue(row.published_image_url),
    publishedImageVersionId: textValue(row.published_image_version_id),
    reservationEnabled: booleanValue(row.reservation_enabled),
    retailPriceClp: numberValue(row.retail_price_clp),
    sortRank: numberValue(row.sort_rank) ?? 0,
    sourceProductId,
    updatedAt: textValue(row.updated_at),
  };
}

function mapCategory(value: Json): StorefrontCategoryOption | null {
  const category = objectValue(value);
  const id = category ? textValue(category.id) : null;
  const name = category ? textValue(category.name) : null;
  const status = category ? textValue(category.status) : null;
  return id && name && status ? { id, name, status } : null;
}

function mapImage(value: Json): StorefrontImageOption | null {
  const image = objectValue(value);
  const id = image ? textValue(image.id) : null;
  const sourceProductId = image ? textValue(image.sourceProductId) : null;
  const status = image ? textValue(image.status) : null;
  return id && sourceProductId && status
    ? { id, sourceProductId, status, url: textValue(image?.url) }
    : null;
}

function mapAudit(value: Json): StorefrontAuditRow | null {
  const audit = objectValue(value);
  const id = audit ? textValue(audit.id) : null;
  const eventKey = audit ? textValue(audit.eventKey) : null;
  const result = audit ? textValue(audit.result) : null;
  const actorKind = audit ? textValue(audit.actorKind) : null;
  const createdAt = audit ? textValue(audit.createdAt) : null;
  return id && eventKey && result && actorKind && createdAt
    ? {
        actorKind,
        after: audit?.after ?? null,
        before: audit?.before ?? null,
        createdAt,
        eventKey,
        id,
        result,
        targetId: textValue(audit?.targetId),
        updatedCount: numberValue(audit?.updatedCount),
      }
    : null;
}

function stringArray(value: Json | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapPromotion(value: Json): StorefrontPromotionRow | null {
  const promotion = objectValue(value);
  const id = promotion ? textValue(promotion.id) : null;
  const publicName = promotion ? textValue(promotion.publicName) : null;
  const discountType = promotion ? textValue(promotion.discountType) : null;
  const startsAt = promotion ? textValue(promotion.startsAt) : null;
  const endsAt = promotion ? textValue(promotion.endsAt) : null;
  const updatedAt = promotion ? textValue(promotion.updatedAt) : null;
  const publicationStatus = promotion
    ? textValue(promotion.publicationStatus)
    : null;
  const effectiveStatus = promotion ? textValue(promotion.effectiveStatus) : null;
  const discountValue = promotion ? numberValue(promotion.discountValue) : null;
  if (
    !id ||
    !publicName ||
    !startsAt ||
    !endsAt ||
    !updatedAt ||
    !publicationStatus ||
    !effectiveStatus ||
    discountValue === null ||
    (discountType !== "fixed_price_clp" && discountType !== "percentage_bps")
  ) return null;
  return {
    conflictProductCount: numberValue(promotion?.conflictProductCount) ?? 0,
    discountType,
    discountValue,
    effectiveStatus,
    endsAt,
    excludedCount: numberValue(promotion?.excludedCount) ?? 0,
    excludedPublicationIds: stringArray(promotion?.excludedPublicationIds),
    id,
    priority: numberValue(promotion?.priority) ?? 0,
    productCount: numberValue(promotion?.productCount) ?? 0,
    publicDescription: textValue(promotion?.publicDescription),
    publicName,
    publicationIds: stringArray(promotion?.publicationIds),
    publicationStatus,
    startsAt,
    updatedAt,
  };
}

function mapPromotionPublication(
  value: Json,
): StorefrontPromotionPublicationOption | null {
  const publication = objectValue(value);
  const id = publication ? textValue(publication.id) : null;
  const name = publication ? textValue(publication.name) : null;
  const status = publication ? textValue(publication.status) : null;
  const retailPriceClp = publication
    ? numberValue(publication.retailPriceClp)
    : null;
  return id && name && status && retailPriceClp !== null
    ? { id, name, retailPriceClp, status }
    : null;
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  return Number.isInteger(value) && value && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

export async function getStorefrontPublicationsReadModel(
  filters: StorefrontPublicationFilters = {},
): Promise<StorefrontPublicationsReadModel> {
  const access = await resolveShopAdminDataAccess({
    requestedShopId: filters.requestedShopId,
    requiredPermission: "storefront.view",
    strictRequestedShop: true,
  });

  if (access.status !== "ready") {
    return {
      audit: [],
      categories: [],
      images: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      permissions: { canBulkPublish: false, canEdit: false, canManagePromotions: false, canPublish: false, canViewAudit: false },
      promotionConflictRule: "unavailable",
      promotionPagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      promotionPublications: [],
      promotions: [],
      preview: { status: "unavailable" },
      reason: access.reason,
      rows: [],
      selectedShopId: null,
      status: access.status === "not_configured" ? "not_configured" : "unauthorized",
    };
  }

  const request = {
    availability: filters.availability,
    categoryId: filters.categoryId,
    discounted: filters.discounted,
    missingImage: filters.missingImage,
    page: boundedInteger(filters.page, 1, 10_000),
    pageSize: boundedInteger(filters.pageSize, 25, 100),
    query: filters.query,
    sort: filters.sort ?? "updated_desc",
    status: filters.status,
  };
  const promotionRequest = {
    page: boundedInteger(filters.promotionPage, 1, 10_000),
    pageSize: boundedInteger(filters.promotionPageSize, 25, 100),
    query: filters.promotionQuery,
    status: filters.promotionStatus,
  };
  const rpc =
    access.principalKind === "personal_account"
      ? await access.supabase.rpc("admin_storefront_publications_read_v1", {
          p_availability: request.availability,
          p_category_id: request.categoryId,
          p_discounted: request.discounted,
          p_missing_image: request.missingImage,
          p_page: request.page,
          p_page_size: request.pageSize,
          p_query: request.query,
          p_shop_id: access.selectedShop.shopId,
          p_sort: request.sort,
          p_status: request.status,
        })
      : await callStaffWebStorefrontRead(
          {
            actorStaffId: access.principal.staff.staffId,
            selectedShop: access.selectedShop,
            staffWebSession: access.principal.staffWebSession!,
          },
          request,
        );
  const payload = objectValue(rpc.data);
  const promotionsRpc =
    access.principalKind === "personal_account"
      ? await access.supabase.rpc("admin_storefront_promotions_read_v1", {
          p_page: promotionRequest.page,
          p_page_size: promotionRequest.pageSize,
          p_query: promotionRequest.query,
          p_shop_id: access.selectedShop.shopId,
          p_status: promotionRequest.status,
        })
      : await callStaffWebStorefrontPromotionsRead(
          {
            actorStaffId: access.principal.staff.staffId,
            selectedShop: access.selectedShop,
            staffWebSession: access.principal.staffWebSession!,
          },
          promotionRequest,
        );
  const promotionsPayload = objectValue(promotionsRpc.data);
  if (
    rpc.error ||
    !payload ||
    payload.ok !== true ||
    promotionsRpc.error ||
    !promotionsPayload ||
    promotionsPayload.ok !== true
  ) {
    return {
      audit: [],
      categories: [],
      images: [],
      pagination: { page: request.page, pageSize: request.pageSize, total: 0, totalPages: 1 },
      permissions: { canBulkPublish: false, canEdit: false, canManagePromotions: false, canPublish: false, canViewAudit: false },
      promotionConflictRule: "unavailable",
      promotionPagination: { page: promotionRequest.page, pageSize: promotionRequest.pageSize, total: 0, totalPages: 1 },
      promotionPublications: [],
      promotions: [],
      preview: { status: "unavailable" },
      reason: "Storefront publication data could not be loaded.",
      rows: [],
      selectedShopId: access.selectedShop.shopId,
      status: "error",
    };
  }

  const rows = Array.isArray(payload.rows)
    ? payload.rows.map(mapRow).filter((row): row is StorefrontPublicationRow => row !== null)
    : [];
  const categories = Array.isArray(payload.categories)
    ? payload.categories.map(mapCategory).filter((row): row is StorefrontCategoryOption => row !== null)
    : [];
  const images = Array.isArray(payload.images)
    ? payload.images.map(mapImage).filter((row): row is StorefrontImageOption => row !== null)
    : [];
  const audit = Array.isArray(payload.audit)
    ? payload.audit.map(mapAudit).filter((row): row is StorefrontAuditRow => row !== null)
    : [];
  const promotions = Array.isArray(promotionsPayload.rows)
    ? promotionsPayload.rows
        .map(mapPromotion)
        .filter((row): row is StorefrontPromotionRow => row !== null)
    : [];
  const promotionPublications = Array.isArray(promotionsPayload.publications)
    ? promotionsPayload.publications
        .map(mapPromotionPublication)
        .filter(
          (row): row is StorefrontPromotionPublicationOption => row !== null,
        )
    : [];
  const pagination = objectValue(payload.pagination);
  const promotionPagination = objectValue(promotionsPayload.pagination);
  const permissions = access.principalKind === "personal_account"
    ? {
        canBulkPublish: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canEdit: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canManagePromotions: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canPublish: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canViewAudit: true,
      }
    : {
        canBulkPublish: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.bulk_publish"),
        canEdit: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.edit"),
        canManagePromotions: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.promotions.manage"),
        canPublish: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.publish"),
        canViewAudit: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.audit.view"),
      };

  return {
    audit,
    categories,
    images,
    pagination: {
      page: numberValue(pagination?.page) ?? request.page,
      pageSize: numberValue(pagination?.pageSize) ?? request.pageSize,
      total: numberValue(pagination?.total) ?? rows.length,
      totalPages: numberValue(pagination?.totalPages) ?? 1,
    },
    permissions,
    promotionConflictRule:
      textValue(promotionsPayload.conflictRule) ?? "unavailable",
    promotionPagination: {
      page: numberValue(promotionPagination?.page) ?? promotionRequest.page,
      pageSize:
        numberValue(promotionPagination?.pageSize) ?? promotionRequest.pageSize,
      total: numberValue(promotionPagination?.total) ?? promotions.length,
      totalPages: numberValue(promotionPagination?.totalPages) ?? 1,
    },
    promotionPublications,
    promotions,
    preview: payload.preview ?? { status: "unavailable" },
    reason: "Storefront authoring rows loaded through the shop-scoped RPC boundary.",
    rows,
    selectedShopId: access.selectedShop.shopId,
    status: "ready",
  };
}
