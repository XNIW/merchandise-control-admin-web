import "server-only";

import type {
  StorefrontImageCandidate,
  StorefrontImageOption,
} from "@/lib/storefront/admin-image-view";
import type { Json } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import {
  callStaffWebStorefrontAuthoringRead,
  callStaffWebStorefrontFulfillmentRead,
  callStaffWebStorefrontImagesRead,
  callStaffWebStorefrontPaymentRead,
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
  catalogVersion: number;
  changedFields: readonly string[];
  compareAtPriceClp: number | null;
  deliveryEnabled: boolean;
  featured: boolean;
  mutationSource: "admin" | "android" | "ios" | "system";
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

export type StorefrontFulfillmentSettings = {
  currencyCode: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  reservationEnabled: boolean;
  storefrontEnabled: boolean;
  timeZone: string;
  updatedAt: string;
};

export type StorefrontPickupPoint = {
  addressLine1: string;
  addressLine2: string | null;
  commune: string;
  enabled: boolean;
  id: string;
  publicInstructions: string | null;
  publicName: string;
  region: string;
  sortRank: number;
  updatedAt: string;
};

export type StorefrontDeliveryZone = {
  communes: readonly string[];
  enabled: boolean;
  feeClp: number;
  id: string;
  publicName: string;
  region: string;
  sortRank: number;
  updatedAt: string;
};

export type StorefrontFulfillmentSlot = {
  activeQuoteCount: number;
  capacity: number;
  deliveryZoneId: string | null;
  enabled: boolean;
  endsAt: string;
  id: string;
  mode: "delivery" | "pickup" | "reservation";
  pickupPointId: string | null;
  publicLabel: string;
  startsAt: string;
  updatedAt: string;
};

export type StorefrontFulfillmentReadModel = {
  deliveryZones: readonly StorefrontDeliveryZone[];
  pickupPoints: readonly StorefrontPickupPoint[];
  settings: StorefrontFulfillmentSettings | null;
  slots: readonly StorefrontFulfillmentSlot[];
};

export type StorefrontPaymentSettings = {
  cashOnDeliveryEnabled: boolean;
  configured: boolean;
  onlinePaymentEnabled: false;
  onlineProvider: "none";
  payAtPickupEnabled: boolean;
  revision: number;
  updatedAt: string | null;
};

export type StorefrontPublicationsReadModel = {
  audit: readonly StorefrontAuditRow[];
  categories: readonly StorefrontCategoryOption[];
  fulfillment: StorefrontFulfillmentReadModel;
  images: readonly StorefrontImageOption[];
  imageCandidates: readonly StorefrontImageCandidate[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  permissions: {
    canBulkPublish: boolean;
    canEdit: boolean;
    canManageFulfillment: boolean;
    canManagePayments: boolean;
    canManagePricing: boolean;
    canManageImages: boolean;
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
  payment: StorefrontPaymentSettings;
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
  source: "Admin" | "Android" | "iOS" | "System";
  targetId: string | null;
  updatedCount: number | null;
};

export type StorefrontPublicationFilters = {
  availability?: string | null;
  categoryId?: string | null;
  discounted?: boolean | null;
  expectedFulfillmentTargetId?: string | null;
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
    catalogVersion: 0,
    changedFields: [],
    compareAtPriceClp: numberValue(row.compare_at_price_clp),
    deliveryEnabled: booleanValue(row.delivery_enabled),
    featured: booleanValue(row.featured),
    mutationSource: "admin",
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

type AuthoringSnapshot = {
  changedFields: readonly string[];
  mutationSource: "admin" | "android" | "ios" | "system";
  sourceProductId: string;
  version: number;
};

function mapAuthoringSnapshot(value: Json): AuthoringSnapshot | null {
  const row = objectValue(value);
  const sourceProductId = row ? textValue(row.sourceProductId) : null;
  const version = row ? numberValue(row.version) : null;
  const source = row ? textValue(row.mutationSource) : null;
  if (
    !sourceProductId ||
    version === null ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    (source !== "admin" && source !== "android" && source !== "ios" && source !== "system")
  ) return null;
  return {
    changedFields: stringArray(row?.changedFields),
    mutationSource: source,
    sourceProductId,
    version,
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
    ? {
        cardUrl: textValue(image?.cardUrl) ?? textValue(image?.url),
        current: booleanValue(image?.current),
        detailUrl: textValue(image?.detailUrl),
        id,
        publishedAt: textValue(image?.publishedAt),
        sourceImageVersionId: textValue(image?.sourceImageVersionId),
        sourceProductId,
        status,
        thumbUrl: textValue(image?.thumbUrl),
        updatedAt: textValue(image?.updatedAt),
        url: textValue(image?.cardUrl) ?? textValue(image?.url),
      }
    : null;
}

function mapImageCandidate(value: Json): StorefrontImageCandidate | null {
  const item = objectValue(value);
  const publicationId = item ? textValue(item.publicationId) : null;
  const sourceProductId = item ? textValue(item.sourceProductId) : null;
  const sourceImageVersionId = item ? textValue(item.sourceImageVersionId) : null;
  const name = item ? textValue(item.name) : null;
  return publicationId && sourceProductId && sourceImageVersionId && name
    ? {
        currentPublicImageId: textValue(item?.currentPublicImageId),
        name,
        publicationId,
        sourceImageVersionId,
        sourceProductId,
        sourceReady: booleanValue(item?.sourceReady),
      }
    : null;
}

function mapAudit(value: Json): StorefrontAuditRow | null {
  const audit = objectValue(value);
  const id = audit ? textValue(audit.id) : null;
  const eventKey = audit ? textValue(audit.eventKey) : null;
  const result = audit ? textValue(audit.result) : null;
  const actorKind = audit ? textValue(audit.actorKind) : null;
  const createdAt = audit ? textValue(audit.createdAt) : null;
  const sourceValue = audit ? textValue(audit.source) : null;
  const source =
    sourceValue === "android"
      ? "Android"
      : sourceValue === "ios"
        ? "iOS"
        : sourceValue === "system"
          ? "System"
          : "Admin";
  return id && eventKey && result && actorKind && createdAt
    ? {
        actorKind,
        after: audit?.after ?? null,
        before: audit?.before ?? null,
        createdAt,
        eventKey,
        id,
        result,
        source,
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

function mapFulfillmentSettings(
  value: Json | undefined,
): StorefrontFulfillmentSettings | null {
  const settings = objectValue(value);
  const currencyCode = settings ? textValue(settings.currencyCode) : null;
  const timeZone = settings ? textValue(settings.timeZone) : null;
  const updatedAt = settings ? textValue(settings.updatedAt) : null;
  return currencyCode && timeZone && updatedAt
    ? {
        currencyCode,
        deliveryEnabled: booleanValue(settings?.deliveryEnabled),
        pickupEnabled: booleanValue(settings?.pickupEnabled),
        reservationEnabled: booleanValue(settings?.reservationEnabled),
        storefrontEnabled: booleanValue(settings?.storefrontEnabled),
        timeZone,
        updatedAt,
      }
    : null;
}

function emptyPayment(): StorefrontPaymentSettings {
  return {
    cashOnDeliveryEnabled: false,
    configured: false,
    onlinePaymentEnabled: false,
    onlineProvider: "none",
    payAtPickupEnabled: false,
    revision: 0,
    updatedAt: null,
  };
}

function mapPaymentSettings(value: Json | undefined): StorefrontPaymentSettings {
  const settings = objectValue(value);
  if (!settings) return emptyPayment();
  const revision = numberValue(settings.revision);
  const provider = textValue(settings.onlineProvider);
  if (
    revision === null ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    provider !== "none" ||
    booleanValue(settings.onlinePaymentEnabled)
  ) return emptyPayment();
  return {
    cashOnDeliveryEnabled: booleanValue(settings.cashOnDeliveryEnabled),
    configured: booleanValue(settings.configured),
    onlinePaymentEnabled: false,
    onlineProvider: "none",
    payAtPickupEnabled: booleanValue(settings.payAtPickupEnabled),
    revision,
    updatedAt: textValue(settings.updatedAt),
  };
}

function mapPickupPoint(value: Json): StorefrontPickupPoint | null {
  const point = objectValue(value);
  const id = point ? textValue(point.id) : null;
  const publicName = point ? textValue(point.publicName) : null;
  const addressLine1 = point ? textValue(point.addressLine1) : null;
  const commune = point ? textValue(point.commune) : null;
  const region = point ? textValue(point.region) : null;
  const updatedAt = point ? textValue(point.updatedAt) : null;
  return id && publicName && addressLine1 && commune && region && updatedAt
    ? {
        addressLine1,
        addressLine2: textValue(point?.addressLine2),
        commune,
        enabled: booleanValue(point?.enabled),
        id,
        publicInstructions: textValue(point?.publicInstructions),
        publicName,
        region,
        sortRank: numberValue(point?.sortRank) ?? 0,
        updatedAt,
      }
    : null;
}

function mapDeliveryZone(value: Json): StorefrontDeliveryZone | null {
  const zone = objectValue(value);
  const id = zone ? textValue(zone.id) : null;
  const publicName = zone ? textValue(zone.publicName) : null;
  const region = zone ? textValue(zone.region) : null;
  const feeClp = zone ? numberValue(zone.feeClp) : null;
  const updatedAt = zone ? textValue(zone.updatedAt) : null;
  return id && publicName && region && feeClp !== null && updatedAt
    ? {
        communes: stringArray(zone?.communes),
        enabled: booleanValue(zone?.enabled),
        feeClp,
        id,
        publicName,
        region,
        sortRank: numberValue(zone?.sortRank) ?? 0,
        updatedAt,
      }
    : null;
}

function mapFulfillmentSlot(value: Json): StorefrontFulfillmentSlot | null {
  const slot = objectValue(value);
  const id = slot ? textValue(slot.id) : null;
  const mode = slot ? textValue(slot.mode) : null;
  const publicLabel = slot ? textValue(slot.publicLabel) : null;
  const startsAt = slot ? textValue(slot.startsAt) : null;
  const endsAt = slot ? textValue(slot.endsAt) : null;
  const updatedAt = slot ? textValue(slot.updatedAt) : null;
  const capacity = slot ? numberValue(slot.capacity) : null;
  if (
    !id ||
    !publicLabel ||
    !startsAt ||
    !endsAt ||
    !updatedAt ||
    capacity === null ||
    (mode !== "pickup" && mode !== "reservation" && mode !== "delivery")
  ) return null;
  return {
    activeQuoteCount: numberValue(slot?.activeQuoteCount) ?? 0,
    capacity,
    deliveryZoneId: textValue(slot?.deliveryZoneId),
    enabled: booleanValue(slot?.enabled),
    endsAt,
    id,
    mode,
    pickupPointId: textValue(slot?.pickupPointId),
    publicLabel,
    startsAt,
    updatedAt,
  };
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

function emptyFulfillment(): StorefrontFulfillmentReadModel {
  return {
    deliveryZones: [],
    pickupPoints: [],
    settings: null,
    slots: [],
  };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fulfillmentReadAfterWriteDelaysMs = [100, 250, 500, 1_000] as const;

function fulfillmentPayloadHasTarget(
  payload: RpcObject | null,
  targetId: string | null,
) {
  if (!targetId) return true;
  if (textValue(payload?.shop_id) === targetId) return true;
  return [payload?.pickupPoints, payload?.deliveryZones, payload?.slots].some(
    (collection) =>
      Array.isArray(collection) &&
      collection.some((value) => textValue(objectValue(value)?.id) === targetId),
  );
}

function waitForReadAfterWrite(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
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
      fulfillment: emptyFulfillment(),
      images: [],
      imageCandidates: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      permissions: {
        canBulkPublish: false,
        canEdit: false,
        canManageFulfillment: false,
        canManagePayments: false,
        canManagePricing: false,
        canManageImages: false,
        canManagePromotions: false,
        canPublish: false,
        canViewAudit: false,
      },
      promotionConflictRule: "unavailable",
      promotionPagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      promotionPublications: [],
      promotions: [],
      payment: emptyPayment(),
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
  const sourceProductIds = Array.isArray(payload?.rows)
    ? payload.rows.flatMap((value) => {
        const row = objectValue(value);
        const sourceProductId = row ? textValue(row.source_product_id) : null;
        return sourceProductId ? [sourceProductId] : [];
      })
    : [];
  const authoringRpc = access.principalKind === "personal_account"
    ? await access.supabase.rpc("storefront_publications_authoring_read_v1", {
        p_page: 1,
        p_page_size: 100,
        p_shop_id: access.selectedShop.shopId,
        p_source_product_ids: sourceProductIds,
      })
    : await callStaffWebStorefrontAuthoringRead(
        {
          actorStaffId: access.principal.staff.staffId,
          selectedShop: access.selectedShop,
          staffWebSession: access.principal.staffWebSession!,
        },
        sourceProductIds,
      );
  const authoringPayload = objectValue(authoringRpc.data);
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
  const imagesRpc =
    access.principalKind === "personal_account"
      ? await access.supabase.rpc("admin_storefront_images_read_v1", {
          p_shop_id: access.selectedShop.shopId,
        })
      : await callStaffWebStorefrontImagesRead({
          actorStaffId: access.principal.staff.staffId,
          selectedShop: access.selectedShop,
          staffWebSession: access.principal.staffWebSession!,
        });
  const imagesPayload = objectValue(imagesRpc.data);
  const callFulfillmentRead = async () =>
    access.principalKind === "personal_account"
      ? access.supabase.rpc("admin_storefront_fulfillment_read_v1", {
          p_shop_id: access.selectedShop.shopId,
        })
      : callStaffWebStorefrontFulfillmentRead({
          actorStaffId: access.principal.staff.staffId,
          selectedShop: access.selectedShop,
          staffWebSession: access.principal.staffWebSession!,
        });
  const paymentRpc = access.principalKind === "personal_account"
    ? await access.supabase.rpc("admin_storefront_payment_read_v1", {
        p_shop_id: access.selectedShop.shopId,
      })
    : await callStaffWebStorefrontPaymentRead({
        actorStaffId: access.principal.staff.staffId,
        selectedShop: access.selectedShop,
        staffWebSession: access.principal.staffWebSession!,
      });
  const paymentPayload = objectValue(paymentRpc.data);
  const expectedFulfillmentTargetId =
    filters.expectedFulfillmentTargetId &&
    uuidPattern.test(filters.expectedFulfillmentTargetId)
      ? filters.expectedFulfillmentTargetId
      : null;
  let fulfillmentRpc = await callFulfillmentRead();
  let fulfillmentPayload = objectValue(fulfillmentRpc.data);
  for (const delayMs of fulfillmentReadAfterWriteDelaysMs) {
    if (
      fulfillmentRpc.error ||
      fulfillmentPayload?.ok !== true ||
      fulfillmentPayloadHasTarget(
        fulfillmentPayload,
        expectedFulfillmentTargetId,
      )
    ) break;
    await waitForReadAfterWrite(delayMs);
    fulfillmentRpc = await callFulfillmentRead();
    fulfillmentPayload = objectValue(fulfillmentRpc.data);
  }
  if (
    rpc.error ||
    !payload ||
    payload.ok !== true ||
    authoringRpc.error ||
    !authoringPayload ||
    authoringPayload.ok !== true ||
    promotionsRpc.error ||
    !promotionsPayload ||
    promotionsPayload.ok !== true ||
    imagesRpc.error ||
    !imagesPayload ||
    imagesPayload.ok !== true ||
    fulfillmentRpc.error ||
    !fulfillmentPayload ||
    fulfillmentPayload.ok !== true ||
    paymentRpc.error ||
    !paymentPayload ||
    paymentPayload.ok !== true
  ) {
    return {
      audit: [],
      categories: [],
      fulfillment: emptyFulfillment(),
      images: [],
      imageCandidates: [],
      pagination: { page: request.page, pageSize: request.pageSize, total: 0, totalPages: 1 },
      permissions: {
        canBulkPublish: false,
        canEdit: false,
        canManageFulfillment: false,
        canManagePayments: false,
        canManagePricing: false,
        canManageImages: false,
        canManagePromotions: false,
        canPublish: false,
        canViewAudit: false,
      },
      promotionConflictRule: "unavailable",
      promotionPagination: { page: promotionRequest.page, pageSize: promotionRequest.pageSize, total: 0, totalPages: 1 },
      promotionPublications: [],
      promotions: [],
      payment: emptyPayment(),
      preview: { status: "unavailable" },
      reason: "Storefront publication data could not be loaded.",
      rows: [],
      selectedShopId: access.selectedShop.shopId,
      status: "error",
    };
  }

  const authoringSnapshots = new Map(
    (Array.isArray(authoringPayload.rows) ? authoringPayload.rows : [])
      .map(mapAuthoringSnapshot)
      .filter((row): row is AuthoringSnapshot => row !== null)
      .map((row) => [row.sourceProductId, row]),
  );
  const rows = Array.isArray(payload.rows)
    ? payload.rows.map(mapRow).filter((row): row is StorefrontPublicationRow => row !== null)
        .map((row) => {
          const snapshot = authoringSnapshots.get(row.sourceProductId);
          return snapshot
            ? {
                ...row,
                catalogVersion: snapshot.version,
                changedFields: snapshot.changedFields,
                mutationSource: snapshot.mutationSource,
              }
            : row;
        })
    : [];
  const categories = Array.isArray(payload.categories)
    ? payload.categories.map(mapCategory).filter((row): row is StorefrontCategoryOption => row !== null)
    : [];
  const images = Array.isArray(imagesPayload.images)
    ? imagesPayload.images.map(mapImage).filter((row): row is StorefrontImageOption => row !== null)
    : [];
  const imageCandidates = Array.isArray(imagesPayload.candidates)
    ? imagesPayload.candidates.map(mapImageCandidate).filter((row): row is StorefrontImageCandidate => row !== null)
    : [];
  const auditCandidates = [
    ...(Array.isArray(payload.audit) ? payload.audit : []),
    ...(Array.isArray(authoringPayload.audit) ? authoringPayload.audit : []),
    ...(Array.isArray(fulfillmentPayload.audit)
      ? fulfillmentPayload.audit
      : []),
    ...(Array.isArray(paymentPayload.audit) ? paymentPayload.audit : []),
  ]
    .map(mapAudit)
    .filter((row): row is StorefrontAuditRow => row !== null);
  const audit = [...new Map(
    auditCandidates.map((row) => [row.id, row]),
  ).values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
  const pickupPoints = Array.isArray(fulfillmentPayload.pickupPoints)
    ? fulfillmentPayload.pickupPoints
        .map(mapPickupPoint)
        .filter((row): row is StorefrontPickupPoint => row !== null)
    : [];
  const deliveryZones = Array.isArray(fulfillmentPayload.deliveryZones)
    ? fulfillmentPayload.deliveryZones
        .map(mapDeliveryZone)
        .filter((row): row is StorefrontDeliveryZone => row !== null)
    : [];
  const slots = Array.isArray(fulfillmentPayload.slots)
    ? fulfillmentPayload.slots
        .map(mapFulfillmentSlot)
        .filter((row): row is StorefrontFulfillmentSlot => row !== null)
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
        canManageFulfillment: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canManagePayments: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canManagePricing: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canManageImages: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canManagePromotions: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canPublish: access.selectedShop.role === "shop_owner" || access.selectedShop.role === "shop_manager",
        canViewAudit: true,
      }
    : {
        canBulkPublish: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.bulk_publish"),
        canEdit: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.edit"),
        canManageFulfillment: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.settings.manage"),
        canManagePayments: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.settings.manage"),
        canManagePricing: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.pricing.manage"),
        canManageImages: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.images.manage"),
        canManagePromotions: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.promotions.manage"),
        canPublish: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.publish"),
        canViewAudit: access.principal.permissions.includes("shop_admin.full_access") || access.principal.permissions.includes("storefront.audit.view"),
      };

  return {
    audit,
    categories,
    fulfillment: {
      deliveryZones,
      pickupPoints,
      settings: mapFulfillmentSettings(fulfillmentPayload.settings),
      slots,
    },
    images,
    imageCandidates,
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
    payment: mapPaymentSettings(paymentPayload.settings),
    preview: payload.preview ?? { status: "unavailable" },
    reason: "Storefront authoring rows loaded through the shop-scoped RPC boundary.",
    rows,
    selectedShopId: access.selectedShop.shopId,
    status: "ready",
  };
}
