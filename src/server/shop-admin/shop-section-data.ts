import "server-only";

import {
  shopSections,
  type ShopSection,
  type ShopSectionKey,
  type ShopSectionMetric,
  type ShopSectionTableRow,
} from "@/components/shop/shopSections";
import {
  getShopAuditDetailReadModel,
  getShopAuditReadModel,
  type ShopAuditDetailReadModel,
  type ShopAuditEvent,
  type ShopAuditReadModel,
} from "./audit-read-model";
import {
  getShopDeviceReadModel,
  type ShopDetectedSyncClient,
  type ShopDeviceReadModel,
  type ShopDeviceRegistryRow,
} from "./device-read-model";
import {
  getShopHistoryDetailReadModel,
  getShopHistoryReadModel,
  getShopSyncReadModel,
  type ShopHistoryDetailField,
  type ShopHistoryDetailReadModel,
  type ShopHistoryOverlayStatus,
  type ShopHistoryReadModel,
  type ShopHistorySession,
  type ShopHistoryTablePreviewRow,
  type ShopSyncEventActivity,
} from "./history-read-model";
import {
  getImportExportReadiness,
  sanitizeSpreadsheetCell,
} from "./import-export-readiness";
import {
  getShopCategoriesPageReadModel,
  getShopInventoryProductDetailReadModel,
  getShopInventoryReadModel,
  getShopSuppliersPageReadModel,
  type ShopCatalogEntityPageReadModel,
  type ShopCatalogOptionsReadModel,
  type ShopInventoryCatalogScope,
  type ShopInventoryCategory,
  type ShopInventoryPrice,
  type ShopInventoryProduct,
  type ShopInventoryReadModel,
  type ShopInventorySupplier,
} from "./inventory-read-model";
import {
  SHOP_ADMIN_PERMISSION_MATRIX,
  SHOP_STAFF_PERMISSION_MATRIX,
} from "./permissions";
import {
  getShopPosLiveReadModel,
  type ShopPosLiveDeviceRow,
  type ShopPosLiveReadModel,
} from "./pos-live-read-model";
import {
  getShopAdminReadModel,
  type ShopAdminReadModel,
  type ShopAdminReadModelMember,
} from "./read-model";
import {
  getShopStaffReadModel,
  type ShopStaffReadModel,
  type ShopStaffReadModelStaffAccount,
} from "./staff-read-model";

type CatalogFilters = {
  categoryId?: string | null;
  query?: string | null;
  state?: "active" | "archived" | "all" | string | null;
  supplierId?: string | null;
};

type SyncFilters = {
  domain?: string | null;
  query?: string | null;
  source?: string | null;
  status?: string | null;
};

type GetShopSectionForRequestOptions = {
  auditFilters?: {
    eventQuery?: string | null;
    result?: string | null;
    severity?: string | null;
    targetId?: string | null;
  };
  catalogOptionsReadModel?: ShopCatalogOptionsReadModel;
  catalogFilters?: CatalogFilters;
  inventoryReadModel?: ShopInventoryReadModel;
  syncFilters?: SyncFilters;
};

type CatalogListReadModel =
  | ShopCatalogEntityPageReadModel
  | ShopInventoryReadModel
  | ShopCatalogOptionsReadModel;

const SYNC_FILTER_MAX_LENGTH = 160;

const formatToken = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "Not set" : value;
};

function formatCompanyRut(value: string | null | undefined) {
  const compact = (value ?? "")
    .trim()
    .replace(/[^0-9kK]/g, "")
    .toUpperCase();

  if (compact.length < 2) {
    return "Not configured";
  }

  const body = compact.slice(0, -1);
  const dv = compact.slice(-1);
  const groups: string[] = [];

  for (let index = body.length; index > 0; index -= 3) {
    groups.unshift(body.slice(Math.max(0, index - 3), index));
  }

  return `${groups.join(".")}-${dv}`;
}

const shortId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 8)}...` : "System";

const metric = (
  label: string,
  value: string,
  detail: string,
  tone: ShopSectionMetric["tone"] = "neutral",
): ShopSectionMetric => ({
  label,
  value,
  detail,
  tone,
});

function fallbackSection(
  key: ShopSectionKey,
  readModel: ShopAdminReadModel,
): ShopSection {
  const base = shopSections[key];
  const statusByReadModel: Record<ShopAdminReadModel["status"], string> = {
    not_configured: "Not configured",
    unauthorized: "Unauthorized",
    empty: "No rows visible",
    error: "Read blocked",
    ready: "Read-only",
  };

  return {
    ...base,
    description: readModel.reason,
    status: statusByReadModel[readModel.status],
    metrics: [
      metric(
        "Supabase",
        statusByReadModel[readModel.status],
        "Server-only read",
      ),
      metric("Rows shown", "0", "No fallback rows are rendered", "muted"),
      metric("Writes", "Off", "Read-only contract", "warning"),
    ],
    liveData: {
      title: "Live shop data",
      description:
        "Live rows for the selected shop. Changes are not available on this page.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [],
      emptyState: {
        title: "No live shop rows are visible",
        description: readModel.reason,
      },
    },
  };
}

export function buildOverviewSection(
  readModel: ShopAdminReadModel,
): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    return fallbackSection("overview", readModel);
  }

  const shop = readModel.selectedShop;

  return {
    ...shopSections.overview,
    description:
      "Read-only shop summary loaded server-side for the verified selected shop.",
    status: "Read-only",
    metrics: [
      metric("Shop", shop.shopCode, shop.shopName, "good"),
      metric("Status", formatToken(shop.shopStatus), "Current shop state"),
      metric(
        "Members",
        String(readModel.members.length),
        "Visible shop members",
      ),
      metric("Audit events", String(readModel.auditLogs.length), "Latest rows"),
    ],
    liveData: {
      title: "Live shop data",
      description:
        "Live rows for the selected shop. Changes are not available on this page.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [
        { field: "Shop name", value: shop.shopName },
        { field: "Shop code", value: shop.shopCode },
        { field: "Status", value: formatToken(shop.shopStatus) },
        { field: "Current role", value: formatToken(shop.role) },
        { field: "Created", value: formatDateTime(shop.createdAt) },
        { field: "Updated", value: formatDateTime(shop.updatedAt) },
        {
          field: "Status changed",
          value: formatDateTime(shop.statusChangedAt),
        },
      ].map((row) => ({ ...row, rowKey: row.field })),
      emptyState: {
        title: "No live shop rows are visible",
        description:
          "The selected shop was verified, but no shop profile row is visible through RLS.",
      },
    },
  };
}

function readModelStatusLabel(status: string) {
  return formatToken(status);
}

export function buildShopDashboardSection({
  auditReadModel,
  deviceReadModel,
  historyReadModel,
  inventoryReadModel,
  readModel,
  staffReadModel,
}: {
  auditReadModel: ShopAuditReadModel;
  deviceReadModel: ShopDeviceReadModel;
  historyReadModel: ShopHistoryReadModel;
  inventoryReadModel: ShopInventoryReadModel;
  readModel: ShopAdminReadModel;
  staffReadModel: ShopStaffReadModel;
}): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    return fallbackSection("overview", readModel);
  }

  const shop = readModel.selectedShop;
  const catalogSummary = inventoryReadModel.summary;
  const historySummary = historyReadModel.summary;
  const latestSync = historyReadModel.syncEvents[0];
  const latestAudit = auditReadModel.events[0];
  const activeStaff = staffReadModel.staffAccounts.filter(
    (staff) => staff.status === "active",
  ).length;
  const revokedDevices = deviceReadModel.devices.filter(
    (device) => device.status === "revoked",
  ).length;
  const failedSync = historySummary.latestFailedSyncEvents;
  const inventorySource = inventoryReadModel.mapping
    ? `${formatToken(inventoryReadModel.mapping.sourceKind)} / ${formatToken(
        inventoryReadModel.mapping.mappingState,
      )}`
    : "Not configured";

  return {
    ...shopSections.overview,
    description:
      "Operational dashboard for the verified selected shop. Rows are loaded from server-side shop-scoped read models.",
    status: "Operational",
    metrics: [
      metric("Shop", shop.shopCode, shop.shopName, "good"),
      metric(
        "Total products",
        String(catalogSummary.productsTotal),
        "Mapped catalog total",
      ),
      metric(
        "Categories",
        String(catalogSummary.categories),
        "Mapped catalog total",
      ),
      metric(
        "Suppliers",
        String(catalogSummary.suppliers),
        "Mapped catalog total",
      ),
      metric(
        "Price history rows",
        String(catalogSummary.priceRows),
        "Mapped catalog total",
      ),
      metric(
        "Staff active",
        String(activeStaff),
        "Credential-safe staff rows",
        "good",
      ),
      metric(
        "Devices",
        String(deviceReadModel.devices.length),
        `${revokedDevices} revoked`,
      ),
      metric(
        "Sync failed",
        String(failedSync),
        "Latest mapped sync events",
        failedSync > 0 ? "warning" : "good",
      ),
      metric(
        "Sales / revenue",
        "Not configured",
        "POS sales sync is not connected yet",
        "muted",
      ),
      metric(
        "Audit events",
        String(auditReadModel.events.length),
        "Latest shop audit rows",
      ),
    ],
    liveData: {
      title: "Operational cards",
      description:
        "Overview shop, Data status, Latest events and Latest shop audit are shown together for repeated operations.",
      columns: [
        { key: "group", label: "Group" },
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
        { key: "detail", label: "Detail" },
      ],
      rows: [
        {
          rowKey: "overview:shop",
          group: "Overview shop",
          field: "Shop",
          value: shop.shopName,
          detail: `${shop.shopCode} / ${formatToken(shop.shopStatus)}`,
        },
        {
          rowKey: "overview:role",
          group: "Overview shop",
          field: "Current role",
          value: formatToken(shop.role),
          detail: "Verified by active membership",
        },
        {
          rowKey: "overview:catalog-total",
          group: "Catalog totals",
          field: "Total products",
          value: String(catalogSummary.productsTotal),
          detail: `${catalogSummary.activeProducts} active / ${catalogSummary.archivedProducts} archived`,
        },
        {
          rowKey: "overview:catalog-price",
          group: "Catalog totals",
          field: "Price history rows",
          value: String(catalogSummary.priceRows),
          detail: "Server-side exact count for the selected shop scope",
        },
        {
          rowKey: "overview:inventory-source",
          group: "Inventory source",
          field: "Inventory source",
          value: catalogScopeLabel(inventoryReadModel.catalogScope),
          detail: inventorySource,
        },
        {
          rowKey: "overview:inventory-owner",
          group: "Inventory source",
          field: "Owner account",
          value: inventoryReadModel.legacyOwnerUserId
            ? shortId(inventoryReadModel.legacyOwnerUserId)
            : "Not configured",
          detail: "Owner-scoped mobile data mapped to this shop",
        },
        {
          rowKey: "status:inventory",
          group: "Data status",
          field: "Inventory",
          value: readModelStatusLabel(inventoryReadModel.status),
          detail: inventoryReadModel.reason,
        },
        {
          rowKey: "status:staff",
          group: "Data status",
          field: "POS staff",
          value: readModelStatusLabel(staffReadModel.status),
          detail: staffReadModel.reason,
        },
        {
          rowKey: "status:devices",
          group: "Data status",
          field: "Devices",
          value: readModelStatusLabel(deviceReadModel.status),
          detail: deviceReadModel.reason,
        },
        {
          rowKey: "event:sync",
          group: "Latest events",
          field: "Sync",
          value: latestSync
            ? `${latestSync.domain}:${latestSync.eventType}`
            : "No sync event",
          detail: latestSync
            ? `${latestSync.status} / ${formatDateTime(latestSync.createdAt)}`
            : historyReadModel.reason,
        },
        {
          rowKey: "event:sync-total",
          group: "Latest events",
          field: "Sync events",
          value: String(historySummary.syncEventsTotal),
          detail: historySummary.latestChangedAt
            ? `Latest change ${formatDateTime(historySummary.latestChangedAt)}`
            : "No mapped sync change",
        },
        {
          rowKey: "overview:revenue",
          group: "Revenue",
          field: "Sales / revenue",
          value: "Not configured",
          detail: "POS sales sync is not connected yet",
        },
        {
          rowKey: "event:audit",
          group: "Latest shop audit",
          field: "Audit",
          value: latestAudit ? latestAudit.eventKey : "No audit event",
          detail: latestAudit
            ? `${latestAudit.result} / ${formatDateTime(latestAudit.createdAt)}`
            : auditReadModel.reason,
        },
      ],
      emptyState: {
        title: "No operational rows are visible",
        description:
          "The selected shop was verified, but no operational read models returned rows.",
      },
    },
  };
}

function memberRow(member: ShopAdminReadModelMember): ShopSectionTableRow {
  return {
    rowKey: member.shopMemberId,
    account: member.accountIdentity,
    role: formatToken(member.roleKey),
    status: formatToken(member.membershipStatus),
    created: formatDateTime(member.createdAt),
    updated: formatDateTime(member.updatedAt),
  };
}

export function buildMembersSection(
  readModel: ShopAdminReadModel,
): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    return fallbackSection("members", readModel);
  }

  const owners = readModel.members.filter(
    (member) => member.roleKey === "shop_owner",
  ).length;
  const managers = readModel.members.filter(
    (member) => member.roleKey === "shop_manager",
  ).length;

  return {
    ...shopSections.members,
    description:
      "Read-only member list for the verified selected shop. Personal accounts show email or display name with provider when available.",
    status: readModel.members.length > 0 ? "Read-only" : "Members empty",
    metrics: [
      metric(
        "Members",
        String(readModel.members.length),
        "Rows scoped by shop_id",
      ),
      metric("Owners", String(owners), "shop_owner memberships", "good"),
      metric("Managers", String(managers), "shop_manager memberships"),
    ],
    liveData: {
      title: "Live shop data",
      description:
        "Live rows for the selected shop. Changes are not available on this page.",
      columns: [
        { key: "account", label: "Account" },
        { key: "role", label: "Role" },
        { key: "status", label: "Status" },
        { key: "created", label: "Created" },
        { key: "updated", label: "Updated" },
      ],
      rows: readModel.members.map(memberRow),
      emptyState: {
        title: "No live shop rows are visible",
        description:
          "No member rows are visible for the selected shop through the server boundary.",
      },
    },
  };
}

export function buildMemberDetailSection(
  readModel: ShopAdminReadModel,
  memberId: string,
): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    return fallbackSection("members", readModel);
  }

  const member = readModel.members.find((row) => row.shopMemberId === memberId);

  return {
    ...shopSections.members,
    title: "Member Detail",
    description: member
      ? "Shop member detail for the verified selected shop. Personal account identity stays separate from POS staff."
      : "No member row is visible for this shop-scoped detail request.",
    status: member ? "Read-only detail" : "Not found",
    metrics: [
      metric(
        "Account",
        member
          ? (member.accountIdentity.email ??
              member.accountIdentity.displayName ??
              shortId(member.profileId))
          : "Not found",
        "Personal web account",
      ),
      metric(
        "Role",
        member ? formatToken(member.roleKey) : "Not found",
        "shop_members role_key",
      ),
      metric(
        "Status",
        member ? formatToken(member.membershipStatus) : "Not found",
        "Membership state",
      ),
    ],
    liveData: {
      title: "Member detail",
      description:
        "Member detail is loaded only through the active Shop Admin server boundary.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: member
        ? detailSectionRows([
            { field: "Member id", value: member.shopMemberId },
            { field: "Profile id", value: member.profileId },
            {
              field: "Account",
              value:
                member.accountIdentity.email ??
                member.accountIdentity.displayName ??
                "Account identity unavailable",
            },
            { field: "Provider", value: member.accountIdentity.originLabel },
            { field: "Role", value: formatToken(member.roleKey) },
            { field: "Status", value: formatToken(member.membershipStatus) },
            { field: "Created", value: formatDateTime(member.createdAt) },
            { field: "Updated", value: formatDateTime(member.updatedAt) },
          ])
        : [],
      emptyState: {
        title: "Member not found",
        description:
          "No member row with this id is visible through the verified shop boundary.",
      },
    },
  };
}

function auditEventRow(log: ShopAuditEvent): ShopSectionTableRow {
  return {
    rowKey: log.auditLogId,
    event: log.eventKey,
    actor: log.actorIdentity ?? shortId(log.actorProfileId),
    severity: formatToken(log.severity),
    result: formatToken(log.result),
    target: log.targetType
      ? `${log.targetType}:${log.targetId ?? "unknown"}`
      : "None",
    metadata: log.metadataSummary,
    created: formatDateTime(log.createdAt),
  };
}

export function buildAuditSection(readModel: ShopAuditReadModel): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    return {
      ...shopSections.audit,
      description: readModel.reason,
      status: readModelStatusLabel(readModel.status),
      metrics: [
        metric("Audit events", "0", "No fallback rows are rendered", "muted"),
        metric(
          "Filters",
          "Server-side",
          "No client-only audit filtering",
          "good",
        ),
        metric(
          "Metadata",
          "Redacted",
          "Sensitive fields are not rendered",
          "good",
        ),
      ],
      liveData: {
        title: "Shop audit log",
        description:
          "Audit rows are shown only after active shop membership is verified server-side.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "No shop audit rows are visible",
          description: readModel.reason,
        },
      },
    };
  }

  const warnings = readModel.events.filter(
    (log) => log.severity === "warning" || log.severity === "critical",
  ).length;
  const blocked = readModel.events.filter(
    (log) => log.result === "blocked" || log.result === "failure",
  ).length;
  const filterCount = Object.values(readModel.filters).filter(Boolean).length;

  return {
    ...shopSections.audit,
    description:
      "Shop-scoped audit rows for the verified selected shop, with server-side filters and redacted metadata.",
    status: readModel.events.length > 0 ? "Read-only filtered" : "Audit empty",
    metrics: [
      metric(
        "Audit events",
        String(readModel.events.length),
        "Chronological rows",
      ),
      metric("Warnings", String(warnings), "Warning or critical severity"),
      metric(
        "Blocked",
        String(blocked),
        "Blocked or failed results",
        "warning",
      ),
      metric("Filters", String(filterCount), "Applied server-side"),
    ],
    liveData: {
      title: "Shop audit log",
      description:
        "Events are ordered chronologically and metadata is summarized after recursive redaction.",
      columns: [
        { key: "event", label: "Event" },
        { key: "actor", label: "Actor" },
        { key: "severity", label: "Severity" },
        { key: "result", label: "Result" },
        { key: "target", label: "Target" },
        { key: "metadata", label: "Metadata" },
        { key: "created", label: "Created" },
      ],
      rows: readModel.events.map(auditEventRow),
      emptyState: {
        title: "No shop audit rows are visible",
        description:
          "No audit rows match the current server-side filters for this shop.",
      },
    },
  };
}

function staffRow(staff: ShopStaffReadModelStaffAccount): ShopSectionTableRow {
  return {
    rowKey: staff.staffId,
    code: staff.staffCode,
    name: staff.displayName,
    role: formatToken(staff.roleKey),
    status: formatToken(staff.status),
    credential:
      staff.credentialKind && staff.credentialUpdatedAt
        ? `${formatToken(staff.credentialKind)} ${formatToken(
            staff.credentialStatus,
          )} v${staff.credentialVersion} updated ${formatDateTime(
            staff.credentialUpdatedAt,
          )}`
        : "Pending setup",
    lockout: staff.lockedUntil
      ? `Locked until ${formatDateTime(staff.lockedUntil)}`
      : "Not locked",
    updated: formatDateTime(staff.updatedAt),
  };
}

function posStateLabel(value: string | null | undefined) {
  return value ? formatToken(value) : "Not set";
}

function posDeviceRow(device: ShopPosLiveDeviceRow): ShopSectionTableRow {
  const staff = device.staffCode
    ? `${device.staffDisplayName ?? "Staff"} (${device.staffCode})`
    : "No staff linked";
  const sessionDetail =
    device.sessionStatus === "active"
      ? `Active until ${formatDateTime(device.sessionExpiresAt)}`
      : posStateLabel(device.sessionStatus);
  const trustedDetail =
    device.credentialStatus === "active"
      ? `Trusted until ${formatDateTime(device.credentialExpiresAt)}`
      : posStateLabel(device.credentialStatus);

  return {
    rowKey: device.shopDeviceId,
    device: device.displayName,
    status: `${posStateLabel(device.status)} / ${trustedDetail}`,
    session: `${sessionDetail}; ${device.heartbeatCount} heartbeat`,
    staff,
    heartbeat: formatDateTime(device.sessionLastSeenAt ?? device.lastSeenAt),
    app: device.appVersion ?? "Not set",
    audit: device.latestAuditEvent
      ? `${device.latestAuditEvent} (${posStateLabel(device.latestAuditResult)})`
      : "No POS audit event",
    updated: formatDateTime(device.updatedAt),
  };
}

export function buildPosLiveSection(
  readModel: ShopPosLiveReadModel,
): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    const status = readModelStatusLabel(readModel.status);

    return {
      ...shopSections.pos,
      description: readModel.reason,
      status,
      metrics: [
        metric("POS devices", "0", "No POS rows are rendered", "muted"),
        metric("Sessions", "0", "No fallback session rows", "muted"),
        metric("Scope", status, "Server-side shop access", "warning"),
      ],
      liveData: {
        title: "POS live dashboard",
        description:
          "POS devices and sessions are shown only after Shop Admin authorization.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "POS live data is not available",
          description: readModel.reason,
        },
      },
    };
  }

  const summary = readModel.summary;

  return {
    ...shopSections.pos,
    description:
      "Trusted POS devices, sessions and staff links for the verified selected shop. This view is read-only and does not include sales synchronization.",
    status: readModel.devices.length > 0 ? "Read-only live" : "POS empty",
    metrics: [
      metric(
        "Devices",
        String(summary.registeredDevices),
        "Registered POS devices",
      ),
      metric(
        "Trusted",
        String(summary.trustedActiveDevices),
        "Active device credentials",
        "good",
      ),
      metric(
        "Revoked",
        String(summary.revokedDevices),
        "Device registry state",
        summary.revokedDevices > 0 ? "warning" : "good",
      ),
      metric(
        "Active sessions",
        String(summary.activeSessions),
        "Not expired",
        "good",
      ),
      metric(
        "Expired sessions",
        String(summary.expiredSessions),
        "Expired or past TTL",
        summary.expiredSessions > 0 ? "warning" : "good",
      ),
      metric(
        "Linked staff",
        String(summary.linkedStaff),
        "Credential-safe staff rows",
      ),
      metric(
        "Last heartbeat",
        formatDateTime(summary.latestHeartbeatAt),
        "Latest POS session/device activity",
      ),
      metric(
        "Catalog sync",
        formatDateTime(summary.latestCatalogSyncAt),
        summary.latestCatalogVersion ?? "No successful catalog pull",
        summary.latestCatalogSyncAt ? "good" : "muted",
      ),
      metric(
        "Catalog errors",
        String(summary.catalogSyncErrors),
        "Latest POS catalog pull failures",
        summary.catalogSyncErrors > 0 ? "warning" : "good",
      ),
      metric(
        "Catalog cursor",
        summary.latestCatalogCursor
          ? shortId(summary.latestCatalogCursor)
          : "Not set",
        summary.catalogSyncHasMore
          ? "More catalog rows pending"
          : (summary.latestCatalogVersion ?? "No catalog cursor"),
      ),
    ],
    liveData: {
      title: "POS devices and sessions",
      description:
        "Rows are assembled from real device, trusted credential, session, staff and audit records for this shop.",
      columns: [
        { key: "device", label: "Device" },
        { key: "status", label: "Device / trust" },
        { key: "session", label: "Session" },
        { key: "staff", label: "Staff" },
        { key: "heartbeat", label: "Last heartbeat" },
        { key: "app", label: "App version" },
        { key: "audit", label: "Latest POS audit" },
        { key: "updated", label: "Updated" },
      ],
      rows: readModel.devices.map(posDeviceRow),
      emptyState: {
        title: "No POS devices are visible",
        description:
          "No trusted POS device has registered for the selected shop yet.",
      },
    },
  };
}

export function buildStaffSection(readModel: ShopStaffReadModel): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    const base = shopSections.staff;
    const statusByReadModel: Record<ShopStaffReadModel["status"], string> = {
      not_configured: "Not configured",
      unauthorized: "Unauthorized",
      empty: "No rows visible",
      error: "Read blocked",
      ready: "Read-only",
    };

    return {
      ...base,
      description: readModel.reason,
      status: statusByReadModel[readModel.status],
      metrics: [
        metric("Staff", "0", "No staff rows are rendered", "muted"),
        metric(
          "Credential hashes",
          "Hidden",
          "Safe view excludes hashes",
          "good",
        ),
        metric(
          "Actions",
          "Available",
          "Audited create/reset/suspend flows",
          "good",
        ),
      ],
      liveData: {
        title: "Staff credential-safe read model",
        description:
          "The safe staff view is read-only and excludes stored credential hashes.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "No staff rows are visible",
          description: readModel.reason,
        },
      },
    };
  }

  const active = readModel.staffAccounts.filter(
    (staff) => staff.status === "active",
  ).length;
  const pending = readModel.staffAccounts.filter(
    (staff) => staff.status === "pending_credential",
  ).length;
  const locked = readModel.staffAccounts.filter((staff) =>
    Boolean(staff.lockedUntil),
  ).length;

  return {
    ...shopSections.staff,
    description:
      "POS staff list for the verified selected shop. Credential hashes are never returned to the UI; temporary credentials are generated only during create/reset actions.",
    status: readModel.staffAccounts.length > 0 ? "Live actions" : "Staff empty",
    metrics: [
      metric("Staff", String(readModel.staffAccounts.length), "Safe rows"),
      metric("Active", String(active), "Credential-ready accounts", "good"),
      metric("Pending", String(pending), "Awaiting credential setup"),
      metric("Locked", String(locked), "Temporary lockouts", "warning"),
      metric(
        "Actions",
        "Enabled",
        "Create, reset, suspend, reactivate and archive use audited RPCs",
        "good",
      ),
    ],
    liveData: {
      title: "Staff credential-safe read model",
      description:
        "The safe staff view excludes stored credential hashes. Mutations run through audited Server Actions.",
      columns: [
        { key: "code", label: "Staff code" },
        { key: "name", label: "Name" },
        { key: "role", label: "Role" },
        { key: "status", label: "Status" },
        { key: "credential", label: "Credential state" },
        { key: "lockout", label: "Lockout" },
        { key: "updated", label: "Updated" },
      ],
      rows: readModel.staffAccounts.map(staffRow),
      emptyState: {
        title: "No staff accounts are visible",
        description:
          "The staff schema is available, but no credential-safe staff rows are visible for this shop.",
      },
    },
  };
}

function inventoryStatusLabel(status: ShopInventoryReadModel["status"]) {
  const labels: Record<ShopInventoryReadModel["status"], string> = {
    not_configured: "Not configured",
    unauthorized: "Unauthorized",
    empty: "No rows visible",
    error: "Read blocked",
    ready: "Read-only",
    unmapped: "Mapping required",
  };

  return labels[status];
}

function catalogScopeLabel(scope: ShopInventoryCatalogScope) {
  const labels: Record<ShopInventoryCatalogScope, string> = {
    blocked: "Mapping required",
    legacy_owner_bridge: "Legacy mobile bridge",
    shop_scoped: "Shop scoped",
  };

  return labels[scope];
}

function catalogWriteLabel(
  readModel: Pick<CatalogListReadModel, "catalogScope" | "status">,
) {
  if (readModel.status !== "ready") {
    return "Blocked";
  }

  return readModel.catalogScope === "legacy_owner_bridge"
    ? "Ready via legacy bridge"
    : "Ready";
}

function inventoryFallbackSection(
  key: "products" | "categories" | "suppliers",
  readModel: CatalogListReadModel,
): ShopSection {
  const base = shopSections[key];
  const status = inventoryStatusLabel(readModel.status);
  const catalogScope = catalogScopeLabel(readModel.catalogScope);

  return {
    ...base,
    description: readModel.reason,
    status,
    metrics: [
      metric(
        "Shop access",
        readModel.selectedShop ? "Shop access verified" : status,
        "Server-side principal check",
        readModel.selectedShop ? "good" : "warning",
      ),
      metric(
        "Catalog scope",
        catalogScope,
        "Shop scoped or legacy bridge",
        "warning",
      ),
      metric("Rows shown", "0", "No fallback rows are rendered", "muted"),
      metric(
        "Writes",
        catalogWriteLabel(readModel),
        "Mutation boundary",
        "warning",
      ),
    ],
    liveData: {
      title: "Catalog detail",
      description:
        "Rows are shown through shop_id catalog scope, with the legacy owner bridge only as a compatibility fallback.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [],
      emptyState: {
        title: "Inventory mapping is not ready",
        description: readModel.reason,
      },
    },
  };
}

function productRow(
  product: ShopInventoryProduct,
  categories: Map<string, ShopInventoryCategory>,
  suppliers: Map<string, ShopInventorySupplier>,
): ShopSectionTableRow {
  const archivedAt = product.deletedAt ? formatDateTime(product.deletedAt) : "";

  return {
    rowKey: product.productId,
    productId: shortId(product.productId),
    state: product.deletedAt ? "Archived" : "Active",
    barcode: product.barcode,
    itemNumber: product.itemNumber ?? "Not set",
    productName: product.productName ?? "Unnamed",
    secondName: product.secondProductName ?? "Not set",
    retailPrice:
      product.retailPrice === null ? "Not set" : String(product.retailPrice),
    purchasePrice:
      product.purchasePrice === null
        ? "Not set"
        : String(product.purchasePrice),
    stockQuantity:
      product.stockQuantity === null
        ? "Not set"
        : String(product.stockQuantity),
    supplierName: product.supplierId
      ? (suppliers.get(product.supplierId)?.name ?? "Unknown")
      : "None",
    categoryName: product.categoryId
      ? (categories.get(product.categoryId)?.name ?? "Unknown")
      : "None",
    updatedArchived: product.deletedAt
      ? `Archived ${archivedAt}`
      : `Updated ${formatDateTime(product.updatedAt)}`,
  };
}

export function applyCatalogFilters(
  products: readonly ShopInventoryProduct[],
  filters: CatalogFilters = {},
) {
  const query = filters.query?.trim().toLowerCase();
  const categoryId = filters.categoryId?.trim();
  const supplierId = filters.supplierId?.trim();

  return products.filter((product) => {
    if (categoryId && product.categoryId !== categoryId) {
      return false;
    }

    if (supplierId && product.supplierId !== supplierId) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      product.barcode,
      product.itemNumber,
      product.productName,
      product.secondProductName,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(query));
  });
}

export function applyNamedCatalogFilter<T extends { name: string }>(
  rows: readonly T[],
  filters: CatalogFilters = {},
) {
  const query = filters.query?.trim().toLowerCase();

  if (!query) {
    return [...rows];
  }

  return rows.filter((row) => row.name.toLowerCase().includes(query));
}

function isCatalogEntityPageReadModel(
  readModel: CatalogListReadModel,
): readModel is ShopCatalogEntityPageReadModel {
  return "pagination" in readModel && Boolean(readModel.pagination);
}

export function buildProductsSection(
  readModel: ShopInventoryReadModel,
  filters: CatalogFilters = {},
): ShopSection {
  if (readModel.status !== "ready") {
    return inventoryFallbackSection("products", readModel);
  }

  const categories = new Map(
    readModel.categories.map((category) => [category.categoryId, category]),
  );
  const suppliers = new Map(
    readModel.suppliers.map((supplier) => [supplier.supplierId, supplier]),
  );
  const activeProducts = readModel.products;
  const archivedProducts = readModel.archivedProducts;
  const state =
    filters.state === "archived" || filters.state === "all"
      ? filters.state
      : "active";
  const filteredProducts =
    state === "archived" ? [] : applyCatalogFilters(activeProducts, filters);
  const filteredArchivedProducts =
    state === "active" ? [] : applyCatalogFilters(archivedProducts, filters);
  const visibleProducts = [...filteredProducts, ...filteredArchivedProducts];
  const activeFilters = [
    filters.query,
    filters.categoryId,
    filters.supplierId,
    state === "active" ? "" : state,
  ].filter((value) => Boolean(value?.trim())).length;

  return {
    ...shopSections.products,
    description:
      "Shop catalog products for the verified selected shop. Create, update, archive and restore use audited catalog RPCs.",
    status: activeProducts.length > 0 ? "Live actions" : "Products empty",
    metrics: [
      metric(
        "Total products",
        String(readModel.summary.productsTotal),
        "Mapped catalog total",
      ),
      metric(
        "Results",
        String(visibleProducts.length),
        "Filtered rows",
      ),
      metric(
        "Archived products",
        String(readModel.summary.archivedProducts),
        "Mapped catalog total",
      ),
      metric(
        "Price history rows",
        String(readModel.summary.priceRows),
        "Mapped catalog total",
      ),
      metric("Filters", String(activeFilters), "Search/category/supplier"),
      metric("Catalog scope", catalogScopeLabel(readModel.catalogScope), readModel.reason, "good"),
      metric("Writes", catalogWriteLabel(readModel), "Audited create/update/archive/restore", "good"),
    ],
    liveData: {
      title: "Shop catalog data",
      description:
        "Active and archived products are read through shop_id first and mutated only through server-side RPCs.",
      columns: [
        { key: "productId", label: "Product id" },
        { key: "barcode", label: "Barcode" },
        { key: "itemNumber", label: "Item number" },
        { key: "productName", label: "Product name" },
        { key: "secondName", label: "Second name" },
        { key: "supplierName", label: "Supplier name" },
        { key: "categoryName", label: "Category name" },
        { key: "purchasePrice", label: "Purchase price" },
        { key: "retailPrice", label: "Retail price" },
        { key: "stockQuantity", label: "Stock quantity" },
        { key: "state", label: "State" },
        { key: "updatedArchived", label: "Updated / Archived at" },
      ],
      rows: visibleProducts.map((product) =>
        productRow(product, categories, suppliers),
      ),
      emptyState: {
        title: "No shop catalog products are visible",
        description:
          "No active or archived product rows match the current filters for this catalog scope.",
      },
    },
  };
}

export function buildCategoriesSection(
  readModel: CatalogListReadModel,
  filters: CatalogFilters = {},
): ShopSection {
  if (readModel.status !== "ready") {
    return inventoryFallbackSection("categories", readModel);
  }

  const paginatedReadModel = isCatalogEntityPageReadModel(readModel)
    ? readModel
    : null;
  const filteredCategories = paginatedReadModel
    ? readModel.categories
    : applyNamedCatalogFilter(readModel.categories, filters);
  const activeFilters = Object.values(filters).filter((value) =>
    Boolean(value?.trim()),
  ).length;
  const linkedProductsTotal = filteredCategories.reduce(
    (total, category) => total + category.activeProductsCount,
    0,
  );
  const pagination = paginatedReadModel?.pagination;
  const totalCategories = pagination
    ? pagination.totalCountStatus === "exact"
      ? String(pagination.totalCount)
      : `at least ${pagination.totalCount}`
    : String(readModel.categories.length);
  const rangeLabel =
    pagination && pagination.rangeStart > 0
      ? `${pagination.rangeStart}-${pagination.rangeEnd}`
      : "0";

  return {
    ...shopSections.categories,
    description:
      "Shop catalog category list for the verified selected shop. Create, update and archive use audited catalog RPCs.",
    status:
      readModel.categories.length > 0 ? "Live actions" : "Categories empty",
    metrics: [
      metric(
        "Categories",
        totalCategories,
        pagination ? "Filtered server-side total" : "Loaded category rows",
      ),
      metric(
        "Linked products",
        String(linkedProductsTotal),
        pagination
          ? "Active product assignments on this page"
          : "Active product assignments",
      ),
      metric(
        "Results",
        String(filteredCategories.length),
        pagination
          ? `${rangeLabel} shown on page ${pagination.page}`
          : "Filtered rows",
      ),
      metric("Filters", String(activeFilters), "Search"),
      metric("Catalog scope", catalogScopeLabel(readModel.catalogScope), readModel.reason, "good"),
      metric("Writes", catalogWriteLabel(readModel), "Audited create/update/archive", "good"),
    ],
    liveData: {
      title: "Shop catalog data",
      description:
        "Categories are read through shop_id first for the selected shop.",
      columns: [
        { key: "name", label: "Name" },
        { key: "state", label: "State" },
        { key: "activeProductsCount", label: "Linked active products" },
        { key: "updated", label: "Updated" },
      ],
      rows: filteredCategories.map((category) => ({
        rowKey: category.categoryId,
        activeProductsCount: String(category.activeProductsCount),
        categoryId: category.categoryId,
        id: category.categoryId,
        name: category.name,
        state: category.deletedAt ? "Archived" : "Active",
        updated: formatDateTime(category.updatedAt),
      })),
      emptyState: {
        title: "No shop catalog categories are visible",
        description:
          "No active category rows are visible for this catalog scope.",
      },
    },
  };
}

export function buildSuppliersSection(
  readModel: CatalogListReadModel,
  filters: CatalogFilters = {},
): ShopSection {
  if (readModel.status !== "ready") {
    return inventoryFallbackSection("suppliers", readModel);
  }

  const paginatedReadModel = isCatalogEntityPageReadModel(readModel)
    ? readModel
    : null;
  const filteredSuppliers = paginatedReadModel
    ? readModel.suppliers
    : applyNamedCatalogFilter(readModel.suppliers, filters);
  const activeFilters = Object.values(filters).filter((value) =>
    Boolean(value?.trim()),
  ).length;
  const linkedProductsTotal = filteredSuppliers.reduce(
    (total, supplier) => total + supplier.activeProductsCount,
    0,
  );
  const pagination = paginatedReadModel?.pagination;
  const totalSuppliers = pagination
    ? pagination.totalCountStatus === "exact"
      ? String(pagination.totalCount)
      : `at least ${pagination.totalCount}`
    : String(readModel.suppliers.length);
  const rangeLabel =
    pagination && pagination.rangeStart > 0
      ? `${pagination.rangeStart}-${pagination.rangeEnd}`
      : "0";

  return {
    ...shopSections.suppliers,
    description:
      "Shop catalog supplier list for the verified selected shop. Create, update and archive use audited catalog RPCs.",
    status: readModel.suppliers.length > 0 ? "Live actions" : "Suppliers empty",
    metrics: [
      metric(
        "Suppliers",
        totalSuppliers,
        pagination ? "Filtered server-side total" : "Loaded supplier rows",
      ),
      metric(
        "Linked products",
        String(linkedProductsTotal),
        pagination
          ? "Active product assignments on this page"
          : "Active product assignments",
      ),
      metric(
        "Results",
        String(filteredSuppliers.length),
        pagination
          ? `${rangeLabel} shown on page ${pagination.page}`
          : "Filtered rows",
      ),
      metric("Filters", String(activeFilters), "Search"),
      metric("Catalog scope", catalogScopeLabel(readModel.catalogScope), readModel.reason, "good"),
      metric("Writes", catalogWriteLabel(readModel), "Audited create/update/archive", "good"),
    ],
    liveData: {
      title: "Shop catalog data",
      description:
        "Suppliers are read through shop_id first for the selected shop.",
      columns: [
        { key: "name", label: "Name" },
        { key: "state", label: "State" },
        { key: "activeProductsCount", label: "Linked active products" },
        { key: "updated", label: "Updated" },
      ],
      rows: filteredSuppliers.map((supplier) => ({
        rowKey: supplier.supplierId,
        activeProductsCount: String(supplier.activeProductsCount),
        id: supplier.supplierId,
        supplierId: supplier.supplierId,
        name: supplier.name,
        state: supplier.deletedAt ? "Archived" : "Active",
        updated: formatDateTime(supplier.updatedAt),
      })),
      emptyState: {
        title: "No shop catalog suppliers are visible",
        description:
          "No active supplier rows are visible for this catalog scope.",
      },
    },
  };
}

function detailSectionRows(
  rows: Array<{ field: string; value: string }>,
): ShopSectionTableRow[] {
  return rows.map((row) => ({
    ...row,
    rowKey: row.field,
  }));
}

function buildProductPriceHistoryRows(
  priceRows: readonly ShopInventoryPrice[],
): ShopSectionTableRow[] {
  return [...priceRows]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((price) => ({
      rowKey: price.priceId,
      type: formatToken(price.type),
      price: String(price.price),
      effectiveAt: formatDateTime(price.effectiveAt),
      source: price.source ?? "Not set",
      note: price.note ?? "Not set",
      created: formatDateTime(price.createdAt),
    }));
}

function productHistorySearchTokens(product: ShopInventoryProduct) {
  return [
    product.productId,
    product.barcode,
    product.itemNumber,
    product.productName,
    product.secondProductName,
  ]
    .filter((value): value is string => Boolean(value && value.length >= 3))
    .map((value) => value.toLowerCase());
}

function matchesProductHistoryTokens(
  haystack: string,
  tokens: readonly string[],
) {
  const normalized = haystack.toLowerCase();

  return tokens.some((token) => normalized.includes(token));
}

function buildProductHistoryEntryRows(
  product: ShopInventoryProduct,
  historyReadModel: ShopHistoryReadModel | null | undefined,
): ShopSectionTableRow[] {
  if (!historyReadModel || historyReadModel.status !== "ready") {
    return [];
  }

  const tokens = productHistorySearchTokens(product);
  const syncRows = historyReadModel.syncEvents
    .filter((event) =>
      matchesProductHistoryTokens(
        [
          event.domain,
          event.eventType,
          event.entitySummary,
          event.metadataSummary,
          event.source,
          event.sourceDeviceId,
        ]
          .filter(Boolean)
          .join(" "),
        tokens,
      ),
    )
    .map((event) => ({
      rowKey: `sync:${event.eventId}`,
      kind: "Sync event",
      entry: `sync:${event.eventId}`,
      source: event.source ?? "Unknown",
      payload: `${event.domain} / ${event.eventType}`,
      updated: formatDateTime(event.createdAt),
    }));
  const sessionRows = historyReadModel.sessions
    .filter((session) =>
      matchesProductHistoryTokens(
        [
          session.remoteId,
          session.displayTitle,
          session.displayName,
          session.supplier,
          session.category,
          session.dataSummary,
          session.overlaySummary,
        ].join(" "),
        tokens,
      ),
    )
    .map((session) => ({
      rowKey: `session:${session.remoteId}`,
      kind: "Mobile history entry",
      entry: session.displayTitle,
      source:
        [session.supplier, session.category].filter(Boolean).join(" / ") ||
        "Unknown",
      payload: `${session.dataSummary}; ${session.overlaySummary}`,
      updated: formatDateTime(session.entryDate),
    }));

  return [...syncRows, ...sessionRows].slice(0, 25);
}

function catalogDetailFallback(
  title: string,
  readModel: ShopInventoryReadModel,
): ShopSection {
  return {
    ...shopSections.products,
    title,
    description: readModel.reason,
    status: inventoryStatusLabel(readModel.status),
    metrics: [
      metric("Detail", "Unavailable", "No catalog row is rendered", "muted"),
      metric(
        "Mapping",
        inventoryStatusLabel(readModel.status),
        "shop_inventory_sources gate",
        "warning",
      ),
      metric("Scope", "Server verified", "No client-side shop trust", "good"),
    ],
    liveData: {
      title: "Catalog detail",
      description:
        "Catalog details are shown only after active shop membership and mapped inventory are verified.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [],
      emptyState: {
        title: "Catalog detail is not available",
        description: readModel.reason,
      },
    },
  };
}

export function buildProductDetailSection(
  readModel: ShopInventoryReadModel,
  productId: string,
  historyReadModel?: ShopHistoryReadModel | null,
): ShopSection {
  if (readModel.status !== "ready") {
    return catalogDetailFallback("Product Detail", readModel);
  }

  const product = [...readModel.products, ...readModel.archivedProducts].find(
    (row) => row.productId === productId,
  );
  const productState = product?.deletedAt ? "Archived" : "Active";
  const category = product?.categoryId
    ? readModel.categories.find((row) => row.categoryId === product.categoryId)
    : null;
  const supplier = product?.supplierId
    ? readModel.suppliers.find((row) => row.supplierId === product.supplierId)
    : null;
  const priceRows = readModel.prices.filter(
    (row) => row.productId === productId,
  );
  const historyEntryRows = product
    ? buildProductHistoryEntryRows(product, historyReadModel)
    : [];

  return {
    ...shopSections.products,
    title: "Product Detail",
    description: product
      ? "Shop-scoped product detail loaded from the mapped inventory source."
      : "No product row is visible for this shop-scoped detail request.",
    status: product
      ? product.deletedAt
        ? "Archived detail"
        : "Read-only detail"
      : "Not found",
    metrics: [
      metric(
        "Product",
        product ? product.barcode : "Not found",
        product?.productName ?? "No row",
      ),
      metric("Prices", String(priceRows.length), "Recent price rows"),
      metric("Scope", "Server verified", "Mapped owner source", "good"),
    ],
    liveData: {
      title: "Catalog detail",
      description:
        "The detail view reuses the server-side shop mapping and does not expose mobile-only ownership state.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: product
        ? detailSectionRows([
            { field: "Product id", value: product.productId },
            { field: "State", value: productState },
            { field: "Barcode", value: product.barcode },
            { field: "Product name", value: product.productName ?? "Unnamed" },
            {
              field: "Second name",
              value: product.secondProductName ?? "Not set",
            },
            { field: "Item number", value: product.itemNumber ?? "Not set" },
            {
              field: "Retail price",
              value:
                product.retailPrice === null
                  ? "Not set"
                  : String(product.retailPrice),
            },
            {
              field: "Purchase price",
              value:
                product.purchasePrice === null
                  ? "Not set"
                  : String(product.purchasePrice),
            },
            {
              field: "Stock quantity",
              value:
                product.stockQuantity === null
                  ? "Not set"
                  : String(product.stockQuantity),
            },
            {
              field: "Supplier",
              value: supplier?.name ?? product.supplierId ?? "None",
            },
            {
              field: "Category",
              value: category?.name ?? product.categoryId ?? "None",
            },
            { field: "Updated", value: formatDateTime(product.updatedAt) },
            { field: "Archived", value: formatDateTime(product.deletedAt) },
          ])
        : [],
      emptyState: {
        title: "Product not found",
        description:
          "No product row with this id is visible through the verified shop mapping.",
      },
    },
    secondaryLiveData: [
      {
        title: "Price history",
        description:
          "Purchase and retail price rows from inventory_product_prices for this product.",
        columns: [
          { key: "type", label: "Type" },
          { key: "price", label: "Price" },
          { key: "effectiveAt", label: "Effective at" },
          { key: "source", label: "Source" },
          { key: "note", label: "Reason" },
          { key: "created", label: "Created" },
        ],
        rows: product ? buildProductPriceHistoryRows(priceRows) : [],
        emptyState: {
          title: "No price history rows are visible",
          description:
            "No inventory_product_prices rows are visible for this product and shop scope.",
        },
      },
      {
        title: "History entries",
        description:
          "Related mobile business history entries and sync events, separate from web audit logs.",
        columns: [
          { key: "kind", label: "Kind" },
          { key: "entry", label: "Entry" },
          { key: "source", label: "Source" },
          { key: "payload", label: "Payload" },
          { key: "updated", label: "Updated" },
        ],
        rows: historyEntryRows,
        emptyState: {
          title: "No related mobile history entries are visible",
          description:
            "Mobile history entries are shop-scoped and only shown when their redacted payload links to this product.",
        },
      },
    ],
  };
}

export function buildCategoryDetailSection(
  readModel: ShopInventoryReadModel,
  categoryId: string,
): ShopSection {
  if (readModel.status !== "ready") {
    return catalogDetailFallback("Category Detail", readModel);
  }

  const category = readModel.categories.find(
    (row) => row.categoryId === categoryId,
  );
  const productCount = readModel.products.filter(
    (product) => product.categoryId === categoryId,
  ).length;

  return {
    ...shopSections.categories,
    title: "Category Detail",
    description: category
      ? "Shop-scoped category detail loaded from the mapped inventory source."
      : "No active category row is visible for this shop-scoped detail request.",
    status: category ? "Read-only detail" : "Not found",
    metrics: [
      metric("Category", category?.name ?? "Not found", "Mapped taxonomy"),
      metric("Products", String(productCount), "Products using this category"),
      metric("Scope", "Server verified", "Mapped owner source", "good"),
    ],
    liveData: {
      title: "Catalog detail",
      description: "Category detail and product count are scoped to this shop.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: category
        ? detailSectionRows([
            { field: "Category id", value: category.categoryId },
            { field: "Name", value: category.name },
            { field: "Products", value: String(productCount) },
            { field: "Updated", value: formatDateTime(category.updatedAt) },
          ])
        : [],
      emptyState: {
        title: "Category not found",
        description:
          "No active category row with this id is visible through the verified shop mapping.",
      },
    },
  };
}

export function buildSupplierDetailSection(
  readModel: ShopInventoryReadModel,
  supplierId: string,
): ShopSection {
  if (readModel.status !== "ready") {
    return catalogDetailFallback("Supplier Detail", readModel);
  }

  const supplier = readModel.suppliers.find(
    (row) => row.supplierId === supplierId,
  );
  const productCount = readModel.products.filter(
    (product) => product.supplierId === supplierId,
  ).length;

  return {
    ...shopSections.suppliers,
    title: "Supplier Detail",
    description: supplier
      ? "Shop-scoped supplier detail loaded from the mapped inventory source."
      : "No active supplier row is visible for this shop-scoped detail request.",
    status: supplier ? "Read-only detail" : "Not found",
    metrics: [
      metric(
        "Supplier",
        supplier?.name ?? "Not found",
        "Mapped procurement row",
      ),
      metric("Products", String(productCount), "Products using this supplier"),
      metric("Scope", "Server verified", "Mapped owner source", "good"),
    ],
    liveData: {
      title: "Catalog detail",
      description: "Supplier detail and product count are scoped to this shop.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: supplier
        ? detailSectionRows([
            { field: "Supplier id", value: supplier.supplierId },
            { field: "Name", value: supplier.name },
            { field: "Products", value: String(productCount) },
            { field: "Updated", value: formatDateTime(supplier.updatedAt) },
          ])
        : [],
      emptyState: {
        title: "Supplier not found",
        description:
          "No active supplier row with this id is visible through the verified shop mapping.",
      },
    },
  };
}

export function buildImportExportSection(): ShopSection {
  const readiness = getImportExportReadiness();

  return {
    ...shopSections.importExport,
    description:
      "Excel workbook import/export for catalog transfer. Preview before apply is required and apply runs through audited catalog RPCs.",
    status: "Live Excel",
    metrics: [
      metric("Excel", "Enabled", "Server-only workbook parser/writer", "good"),
      metric(
        "Preview before apply",
        "Required",
        "File changes are never applied directly",
        "good",
      ),
      metric("Limits", `${readiness.maxImportRows} rows`, "5 MB max file size"),
    ],
    liveData: {
      title: "Import / export readiness",
      description:
        "Workbook sheets and safety limits are enforced server-side before catalog apply.",
      columns: [
        { key: "gate", label: "Gate" },
        { key: "status", label: "Status" },
        { key: "detail", label: "Detail" },
      ],
      rows: [
        {
          rowKey: "sheets",
          gate: "Workbook sheets",
          status: "Declared",
          detail: readiness.workbookSheets.join(", "),
        },
        {
          rowKey: "formula",
          gate: "Formula injection",
          status: "Guarded",
          detail:
            sanitizeSpreadsheetCell("=formula") === "'=formula"
              ? "Leading formula characters are escaped"
              : "Escaping unavailable",
        },
        {
          rowKey: "apply",
          gate: "Preview before apply",
          status: readiness.applyStatus,
          detail: readiness.reason,
        },
      ],
      emptyState: {
        title: "No import/export action is available",
        description: readiness.reason,
      },
    },
  };
}

function historyStatusLabel(
  status: ShopHistoryReadModel["status"] | ShopHistoryDetailReadModel["status"],
) {
  const labels: Record<
    ShopHistoryReadModel["status"] | ShopHistoryDetailReadModel["status"],
    string
  > = {
    not_configured: "Not configured",
    unauthorized: "Unauthorized",
    empty: "No rows visible",
    error: "Read blocked",
    ready: "Read-only",
    unmapped: "Mapping required",
    not_found: "Not found",
    invalid_entry: "Invalid entry",
  };

  return labels[status];
}

function sourceScopeLabel(sourceScope: ShopHistorySession["sourceScope"]) {
  const labels: Record<ShopHistorySession["sourceScope"], string> = {
    legacy_owner_bridge: "Legacy owner bridge",
    shop_scoped: "Shop scoped",
  };

  return labels[sourceScope];
}

function overlayStatusLabel(status: ShopHistoryOverlayStatus) {
  const labels: Record<ShopHistoryOverlayStatus, string> = {
    invalid_shape: "Invalid shape",
    legacy_v1: "Legacy v1",
    missing: "Missing",
    ok: "OK",
    schema_unsupported: "Unsupported schema",
    too_large: "Too large",
  };

  return labels[status];
}

function historyEntryType(session: ShopHistorySession) {
  if (session.state === "tombstone") {
    return "Deleted history entry";
  }

  return session.isTechnicalEntry
    ? "Technical history entry"
    : "Active history entry";
}

function historyEntryStatus(session: ShopHistorySession) {
  if (session.state === "tombstone") {
    return "Deleted";
  }

  if (session.isTechnicalEntry) {
    return "Technical";
  }

  if (session.payloadVersion < 2) {
    return "Legacy v1";
  }

  if (session.overlayStatus !== "ok") {
    return "Overlay issue";
  }

  return "Active";
}

function historyEntryPayloadLabel(session: ShopHistorySession) {
  return session.payloadVersion < 2
    ? `Legacy v${session.payloadVersion}`
    : `Payload v${session.payloadVersion}`;
}

function historyEntryOverlayLabel(session: ShopHistorySession) {
  if (session.overlayStatus === "ok") {
    return "Overlay OK";
  }

  if (session.overlayStatus === "legacy_v1") {
    return "Legacy v1";
  }

  return `Overlay issue: ${overlayStatusLabel(session.overlayStatus)}`;
}

function historyEntryIssue(session: ShopHistorySession) {
  if (!session.diagnosticsAvailable) {
    return "Diagnostics load from Detail.";
  }

  if (session.overlayStatus === "ok") {
    return "None";
  }

  if (session.overlayStatus === "legacy_v1") {
    return "Legacy v1 payload has no overlay contract.";
  }

  return `${overlayStatusLabel(session.overlayStatus)}; completed/editable counts are diagnostic only.`;
}

function historyDiagnosticsValue(
  session: ShopHistorySession,
  value: number,
) {
  return session.diagnosticsAvailable ? String(value) : "Diagnostics not available";
}

function historySessionRow(session: ShopHistorySession): ShopSectionTableRow {
  return {
    rowKey: `session:${session.remoteId}`,
    type: historyEntryType(session),
    entryName: session.displayTitle,
    displayName: session.displayName,
    entryDate: formatDateTime(session.entryDate),
    supplierCategory:
      [session.supplier, session.category].filter(Boolean).join(" / ") ||
      "Not set",
    status: historyEntryStatus(session),
    payload: historyEntryPayloadLabel(session),
    overlay: historyEntryOverlayLabel(session),
    items: historyDiagnosticsValue(session, session.itemRowCount || session.rowCount),
    rows: historyDiagnosticsValue(session, session.itemRowCount || session.rowCount),
    completed: historyDiagnosticsValue(session, session.completeCount),
    missing: historyDiagnosticsValue(session, session.missingCount),
    orderTotal: session.orderTotal,
    paidTotal: session.paymentTotal,
    syncState: session.syncStateLabel,
    totalQuantity: session.totalQuantity,
    activeState: session.state === "tombstone" ? "Deleted" : "Active",
    technical: session.isTechnicalEntry ? "true" : "false",
    latestSync: session.latestRelatedSyncAt
      ? formatDateTime(session.latestRelatedSyncAt)
      : "Sync state not available",
    updated: formatDateTime(session.updatedAt),
  };
}

function historySessionListRow(
  session: ShopHistorySession,
): ShopSectionTableRow {
  return {
    rowKey: `session:${session.remoteId}`,
    type: historyEntryType(session),
    entryName: session.displayTitle,
    displayName: session.displayName,
    entryDate: formatDateTime(session.entryDate),
    supplierCategory:
      [session.supplier, session.category].filter(Boolean).join(" / ") ||
      "Not set",
    status: historyEntryStatus(session),
    items: historyDiagnosticsValue(session, session.itemRowCount || session.rowCount),
    rows: historyDiagnosticsValue(session, session.itemRowCount || session.rowCount),
    completed: historyDiagnosticsValue(session, session.completeCount),
    missing: historyDiagnosticsValue(session, session.missingCount),
    orderTotal: session.orderTotal,
    overlay: session.diagnosticsAvailable
      ? historyEntryOverlayLabel(session)
      : "Diagnostics not available",
    paidTotal: session.paymentTotal,
    syncState: session.syncStateLabel,
    totalQuantity: session.totalQuantity,
    activeState: session.state === "tombstone" ? "Deleted" : "Active",
    technical: session.isTechnicalEntry ? "true" : "false",
    latestSync: session.latestRelatedSyncAt
      ? formatDateTime(session.latestRelatedSyncAt)
      : "Sync state not available",
    updated: formatDateTime(session.updatedAt),
  };
}

function historySyncEventRow(
  event: ShopSyncEventActivity,
): ShopSectionTableRow {
  return {
    rowKey: `sync:${event.eventId}`,
    event: event.eventType,
    state: event.status,
    source: event.sourceDeviceId ?? event.source ?? "Unknown",
    changed: String(event.changedCount),
    clientEvent: event.clientEventId ?? "Not set",
    batch: event.batchId ?? "Not set",
    updated: formatDateTime(event.createdAt),
  };
}

function historyDiagnosticsRow(
  session: ShopHistorySession,
): ShopSectionTableRow {
  return {
    rowKey: `diagnostic:${session.remoteId}`,
    entryName: session.displayTitle,
    payloadVersion: historyEntryPayloadLabel(session),
    dataRows: historyDiagnosticsValue(session, session.rowCount),
    overlayStatus: session.diagnosticsAvailable
      ? historyEntryOverlayLabel(session)
      : "Diagnostics not available",
    editableRows: historyDiagnosticsValue(session, session.editableRows),
    completeRows: historyDiagnosticsValue(session, session.completeRows),
    issue: historyEntryIssue(session),
    entryDate: formatDateTime(session.entryDate),
    updated: formatDateTime(session.updatedAt),
  };
}

export function buildHistorySection(
  readModel: ShopHistoryReadModel,
): ShopSection {
  if (readModel.status !== "ready") {
    const status = historyStatusLabel(readModel.status);

    return {
      ...shopSections.history,
      title: "Android / iOS History Entries",
      description: readModel.reason,
      status,
      metrics: [
        metric("Mapping", status, "shop_inventory_sources gate", "warning"),
        metric("Rows shown", "0", "No fallback rows are rendered", "muted"),
        metric(
          "Payload",
          "Redacted",
          "Raw mobile JSON is not rendered",
          "good",
        ),
      ],
      liveData: {
        title: "Android / iOS History Entries",
        description:
          "Real mobile history entries from shared_sheet_sessions appear here after the mapping is ready.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "Mobile history mapping is not ready",
          description: readModel.reason,
        },
      },
    };
  }

  if (readModel.listMode === "light") {
    const pagination = readModel.pagination;
    const totalEntries =
      pagination?.totalCountStatus === "exact"
        ? String(pagination.totalCount)
        : pagination
          ? `at least ${pagination.totalCount}`
          : String(readModel.sessions.length);
    const pageRange =
      pagination && pagination.rangeStart > 0
        ? `${pagination.rangeStart}-${pagination.rangeEnd}`
        : "0";
    const activeSessions = readModel.sessions.filter(
      (session) => session.state === "active",
    ).length;
    const tombstones = readModel.sessions.filter(
      (session) => session.state === "tombstone",
    ).length;
    const technicalSessions = readModel.sessions.filter(
      (session) => session.state === "active" && session.isTechnicalEntry,
    ).length;
    const mobileVisibleSessions = readModel.sessions.filter(
      (session) => session.state === "active" && !session.isTechnicalEntry,
    ).length;
    return {
      ...shopSections.history,
      title: "Android / iOS History Entries",
      description:
        "Lightweight mobile history list from shared_sheet_sessions. Payload, overlay diagnostics and related sync details load only after opening a specific entry.",
      status:
        readModel.sessions.length > 0 ? "Read-only mapped" : "History empty",
      metrics: [
        metric(
          "History entries",
          totalEntries,
          pagination?.totalCountStatus === "exact"
            ? "Filtered server-side total"
            : "Server-side lower bound",
        ),
        metric(
          "Current page rows",
          String(readModel.sessions.length),
          pagination
            ? `${pageRange} shown on page ${pagination.page}`
            : "Visible rows",
        ),
        metric(
          "Active entries",
          String(activeSessions),
          "Rows without deleted_at",
          "good",
        ),
        metric(
          "Deleted entries",
          String(tombstones),
          "Rows with deleted_at",
          tombstones > 0 ? "warning" : "muted",
        ),
        metric(
          "Mobile visible",
          String(mobileVisibleSessions),
          technicalSessions > 0
            ? "Technical rows stay out of default view"
            : "Default view hides technical rows",
          "good",
        ),
        metric(
          "Diagnostics",
          "Deferred",
          "Payload and overlay checks are loaded on detail",
          "good",
        ),
        metric(
          "Fallback",
          readModel.mapping ? "Mapped" : "Shop scoped",
          readModel.reason,
          "good",
        ),
      ],
      liveData: {
        title: "Android / iOS History Entries",
        description:
          "Real mobile history entries from shared_sheet_sessions. Technical sync events and payload diagnostics are opened from Detail.",
        columns: [
          { key: "type", label: "Type" },
          { key: "entryName", label: "Entry name" },
          { key: "entryDate", label: "Entry date" },
          { key: "supplierCategory", label: "Supplier / Category" },
          { key: "status", label: "Status" },
          { key: "items", label: "Items" },
          { key: "totalQuantity", label: "Total quantity" },
          { key: "orderTotal", label: "Order" },
          { key: "paidTotal", label: "Paid" },
          { key: "missing", label: "Missing" },
          { key: "syncState", label: "Sync state" },
          { key: "updated", label: "Updated" },
        ],
        rows: readModel.sessions.map(historySessionListRow),
        emptyState: {
          title: "No mobile history entries are visible",
          description:
            "The mapping is present, but no shared_sheet_sessions rows are visible through current RLS.",
        },
      },
    };
  }

  const historyEvents = readModel.syncEvents.filter(
    (event) => event.domain === "history",
  );
  const activeSessions = readModel.sessions.filter(
    (session) => session.state === "active",
  ).length;
  const tombstones = readModel.sessions.filter(
    (session) => session.state === "tombstone",
  ).length;
  const payloadV2 = readModel.sessions.filter(
    (session) => session.payloadVersion === 2,
  ).length;
  const legacyPayloadV1 = readModel.sessions.filter(
    (session) => session.payloadVersion < 2,
  ).length;
  const overlayOk = readModel.sessions.filter(
    (session) => session.overlayStatus === "ok",
  ).length;
  const overlayIssues = readModel.sessions.filter(
    (session) => session.overlayStatus !== "ok",
  ).length;
  const manualEntries = readModel.sessions.filter(
    (session) => session.isManualEntry,
  ).length;
  const completedRows = readModel.sessions.reduce(
    (total, session) => total + session.completeCount,
    0,
  );
  const missingRows = readModel.sessions.reduce(
    (total, session) => total + session.missingCount,
    0,
  );
  const failedHistoryEvents = historyEvents.filter(
    (event) => event.status === "failed",
  ).length;
  const historySummary = readModel.summary;

  return {
    ...shopSections.history,
    title: "Android / iOS History Entries",
    description:
      "History entries are loaded from shared_sheet_sessions. Sync events are technical synchronization logs linked to those entries. Admin audit events are shown separately in Audit.",
    status:
      historySummary.syncEventsTotal + historySummary.historySessionsTotal > 0
        ? "Read-only mapped"
        : "History empty",
    metrics: [
      metric(
        "History entries",
        String(historySummary.historySessionsTotal),
        "shared_sheet_sessions total",
      ),
      metric(
        "Current page rows",
        String(readModel.sessions.length),
        "Latest visible history entries",
      ),
      metric(
        "Active entries",
        String(activeSessions),
        "Rows without deleted_at",
        "good",
      ),
      metric(
        "Deleted entries",
        String(tombstones),
        "Rows with deleted_at",
        tombstones > 0 ? "warning" : "muted",
      ),
      metric(
        "Payload v2",
        String(payloadV2),
        "Current Android/iOS contract",
        "good",
      ),
      metric(
        "Legacy v1",
        String(legacyPayloadV1),
        "Overlay not expected",
        legacyPayloadV1 > 0 ? "warning" : "muted",
      ),
      metric(
        "Overlay OK",
        String(overlayOk),
        "Schema 1 and row counts match",
        "good",
      ),
      metric(
        "Overlay issues",
        String(overlayIssues),
        "Missing, invalid, too large or unsupported",
        overlayIssues > 0 ? "warning" : "good",
      ),
      metric(
        "Sync events",
        String(historySummary.syncEventsTotal),
        `${failedHistoryEvents} failed events shown`,
        failedHistoryEvents > 0 ? "warning" : "good",
      ),
      metric(
        "Payload safety",
        "Read-only",
        `${manualEntries} manual; ${completedRows} complete flags; ${missingRows} missing flags`,
        overlayIssues > 0 ? "warning" : "good",
      ),
    ],
    liveData: {
      title: "Android / iOS History Entries",
      description:
        "Real mobile history entries from shared_sheet_sessions. This table does not include technical sync_events or admin audit_logs.",
      columns: [
        { key: "type", label: "Type" },
        { key: "entryName", label: "Entry name" },
        { key: "entryDate", label: "Entry date" },
        { key: "supplierCategory", label: "Supplier / Category" },
        { key: "status", label: "Status" },
        { key: "items", label: "Items" },
        { key: "totalQuantity", label: "Total quantity" },
        { key: "orderTotal", label: "Order" },
        { key: "paidTotal", label: "Paid" },
        { key: "missing", label: "Missing" },
        { key: "syncState", label: "Sync state" },
        { key: "updated", label: "Updated" },
      ],
      rows: readModel.sessions.map(historySessionRow),
      emptyState: {
        title: "No mobile history entries are visible",
        description:
          "The mapping is present, but no shared_sheet_sessions rows are visible through current RLS.",
      },
    },
    secondaryLiveData: [
      {
        title: "Related history sync events",
        description:
          "These are technical synchronization logs. They are not the inventory history entries themselves.",
        columns: [
          { key: "event", label: "Event" },
          { key: "state", label: "State" },
          { key: "source", label: "Source / Device" },
          { key: "changed", label: "Changed" },
          { key: "clientEvent", label: "Client event" },
          { key: "batch", label: "Batch" },
          { key: "updated", label: "Updated" },
        ],
        rows: historyEvents.map(historySyncEventRow),
        emptyState: {
          title: "No history sync events are visible",
          description:
            "History sessions may still exist without a related sync_events row.",
        },
      },
      {
        title: "Payload and overlay diagnostics",
        description:
          "Diagnostics are calculated from shared_sheet_sessions payloads and overlays, not from sync_events.",
        columns: [
          { key: "entryName", label: "Entry name" },
          { key: "payloadVersion", label: "Payload version" },
          { key: "dataRows", label: "Data rows" },
          { key: "overlayStatus", label: "Overlay status" },
          { key: "editableRows", label: "Editable rows" },
          { key: "completeRows", label: "Complete rows" },
          { key: "issue", label: "Issue" },
          { key: "entryDate", label: "Entry date" },
          { key: "updated", label: "Updated" },
        ],
        rows: readModel.sessions.map(historyDiagnosticsRow),
        emptyState: {
          title: "No payload diagnostics are available",
          description:
            "Diagnostics appear after shared_sheet_sessions rows are visible.",
        },
      },
    ],
  };
}

function syncStatusRow(
  status: "pending" | "success" | "failed",
  count: number,
) {
  return {
    rowKey: `status:${status}`,
    event: status,
    domain: "all",
    state: status,
    source: "Status summary",
    changed: String(count),
    cursor: "Current filter",
    diagnostic: "Filtered result set",
    updated: "Current result set",
  };
}

function normalizedSyncStatus(value?: string | null) {
  const normalized = normalizeSyncFilter(value);

  return normalized === "pending" ||
    normalized === "success" ||
    normalized === "failed"
    ? normalized
    : null;
}

function normalizeSyncFilter(value?: string | null) {
  const trimmed = value?.trim();

  return trimmed
    ? trimmed.slice(0, SYNC_FILTER_MAX_LENGTH).toLowerCase()
    : null;
}

function includesText(value: string | null | undefined, query: string) {
  return value?.toLowerCase().includes(query) ?? false;
}

export function applySyncFilters(
  events: readonly ShopSyncEventActivity[],
  filters: SyncFilters = {},
) {
  const query = normalizeSyncFilter(filters.query);
  const domain = normalizeSyncFilter(filters.domain);
  const source = normalizeSyncFilter(filters.source);
  const status = normalizedSyncStatus(filters.status);

  return events.filter((event) => {
    if (status && event.status !== status) {
      return false;
    }

    if (domain && !event.domain.toLowerCase().includes(domain)) {
      return false;
    }

    if (
      source &&
      !includesText(event.source, source) &&
      !includesText(event.sourceDeviceId, source)
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      event.domain,
      event.eventType,
      event.source,
      event.sourceDeviceId,
      event.clientEventId,
      event.batchId,
      event.entitySummary,
      event.metadataSummary,
    ].some((value) => includesText(value, query));
  });
}

export function buildSyncSection(
  readModel: ShopHistoryReadModel,
  filters: SyncFilters = {},
): ShopSection {
  if (readModel.status !== "ready") {
    const status = historyStatusLabel(readModel.status);

    return {
      ...shopSections.sync,
      description: readModel.reason,
      status,
      metrics: [
        metric("Mapping", status, "shop_inventory_sources gate", "warning"),
        metric("Sync events", "0", "No fallback rows are rendered", "muted"),
        metric(
          "Mode",
          "Read-only",
          "Admin Web does not synchronize clients",
          "good",
        ),
      ],
      liveData: {
        title: "Sync events",
        description:
          "Sync activity appears only after a verified shop mapping resolves the owner-scoped mobile source.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "Sync Center is not ready",
          description: readModel.reason,
        },
      },
    };
  }

  const filteredEvents = applySyncFilters(readModel.syncEvents, filters);
  const statusFilter = normalizedSyncStatus(filters.status);
  const activeFilters = [
    normalizeSyncFilter(filters.query),
    normalizeSyncFilter(filters.domain),
    normalizeSyncFilter(filters.source),
    statusFilter,
  ].filter(Boolean).length;
  const pending = filteredEvents.filter(
    (event) => event.status === "pending",
  ).length;
  const success = filteredEvents.filter(
    (event) => event.status === "success",
  ).length;
  const failed = filteredEvents.filter(
    (event) => event.status === "failed",
  ).length;
  const latestEvent = filteredEvents[0];
  const latestFailedEvent = filteredEvents.find(
    (event) => event.status === "failed",
  );
  const sourceCount = new Set(
    filteredEvents.map(
      (event) => event.sourceDeviceId ?? event.source ?? "Unknown",
    ),
  ).size;
  const adminWebEvents = filteredEvents.filter(
    (event) => event.source === "admin_web",
  );
  const latestAdminWebEvent = adminWebEvents[0];

  return {
    ...shopSections.sync,
    description:
      "Sync Center for mapped mobile events. Admin Web records technical sync_events after catalog and history mutations while classifying states without triggering synchronization.",
    status:
      readModel.summary.syncEventsTotal > 0 ? "Read-only mapped" : "Sync empty",
    metrics: [
      metric("Pending", String(pending), "Events marked pending"),
      metric(
        "Success",
        String(success),
        "Events without failure metadata",
        "good",
      ),
      metric(
        "Failed",
        String(failed),
        "Events with failure metadata",
        failed > 0 ? "warning" : "good",
      ),
      metric(
        "Events shown",
        String(filteredEvents.length),
        `${readModel.summary.syncEventsTotal} total mapped rows`,
      ),
      metric(
        "Admin Web events",
        String(adminWebEvents.length),
        latestAdminWebEvent?.clientEventId ?? "No Admin Web cursor visible",
        adminWebEvents.length > 0 ? "good" : "muted",
      ),
      metric(
        "Latest cursor",
        latestEvent?.clientEventId ?? "None",
        latestEvent
          ? `${latestEvent.domain}:${latestEvent.eventType}`
          : "No client event cursor visible",
        latestEvent?.clientEventId ? "good" : "muted",
      ),
      metric(
        "Sources",
        String(sourceCount),
        "Source/device values in current result",
      ),
      metric(
        "Latest error",
        latestFailedEvent
          ? `${latestFailedEvent.domain}:${latestFailedEvent.eventType}`
          : "None",
        latestFailedEvent
          ? formatDateTime(latestFailedEvent.createdAt)
          : "No failed event in current result",
        latestFailedEvent ? "warning" : "good",
      ),
      metric("Filters", String(activeFilters), "Server-side query params"),
    ],
    liveData: {
      title: "Sync events",
      description: latestEvent
        ? `Latest visible event: ${latestEvent.domain}:${latestEvent.eventType} at ${formatDateTime(latestEvent.createdAt)}. Sync activity is separate from shop audit.`
        : "Sync activity is separate from shop audit. Pending, success and failed are derived from the event payload when available.",
      columns: [
        { key: "event", label: "Event" },
        { key: "domain", label: "Domain" },
        { key: "state", label: "State" },
        { key: "source", label: "Source" },
        { key: "changed", label: "Changed" },
        { key: "cursor", label: "Cursor / Client event" },
        { key: "diagnostic", label: "Diagnostic" },
        { key: "updated", label: "Updated" },
      ],
      rows: [
        syncStatusRow("pending", pending),
        syncStatusRow("success", success),
        syncStatusRow("failed", failed),
        ...filteredEvents.map((event) => ({
          rowKey: `sync:${event.eventId}`,
          event: event.eventType,
          domain: event.domain,
          state: event.status,
          source: event.sourceDeviceId ?? event.source ?? "Unknown",
          changed: String(event.changedCount),
          cursor: event.clientEventId ?? "Not set",
          diagnostic: `${event.entitySummary}; ${event.metadataSummary}`,
          updated: formatDateTime(event.createdAt),
        })),
      ],
      emptyState: {
        title: "No sync events are visible",
        description:
          activeFilters > 0
            ? "The mapping is present, but no sync rows match the current filters."
            : "The mapping is present, but no sync rows are visible through current RLS.",
      },
    },
  };
}

function historyDetailRow(field: ShopHistoryDetailField): ShopSectionTableRow {
  return {
    rowKey: field.key,
    field: field.label,
    value: field.value,
  };
}

function historyPreviewRow(
  row: ShopHistoryTablePreviewRow,
): ShopSectionTableRow {
  return { ...row };
}

function relatedHistoryEventRow(
  event: ShopSyncEventActivity,
): ShopSectionTableRow {
  return {
    rowKey: `related:${event.eventId}`,
    event: event.eventType,
    state: event.status,
    source: event.sourceDeviceId ?? event.source ?? "Unknown",
    clientEvent: event.clientEventId ?? "Not set",
    changed: String(event.changedCount),
    sessionIds:
      event.sessionIds.length > 0
        ? event.sessionIds.slice(0, 4).join(", ")
        : "None",
    updated: formatDateTime(event.createdAt),
    sourceScope: sourceScopeLabel(event.sourceScope),
  };
}

export function buildHistoryDetailSection(
  readModel: ShopHistoryDetailReadModel,
): ShopSection {
  const status = historyStatusLabel(readModel.status);

  if (readModel.status !== "ready" || !readModel.detail) {
    return {
      ...shopSections.history,
      title: "History Detail",
      description: readModel.reason,
      status,
      metrics: [
        metric("Mapping", status, "shop_inventory_sources gate", "warning"),
        metric("Entry", "Unavailable", "No detail row is rendered", "muted"),
        metric(
          "Payload",
          "Redacted",
          "Raw mobile JSON is not rendered",
          "good",
        ),
      ],
      liveData: {
        title: "History detail",
        description:
          "A detail row is shown only after a verified shop mapping resolves the owner-scoped mobile source.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "History detail is not available",
          description: readModel.reason,
        },
      },
    };
  }

  const detail = readModel.detail;
  const analysis = detail.sessionAnalysis;
  const secondaryLiveData: ShopSection["secondaryLiveData"] = [
    {
      title: "Redacted JSON preview",
      description:
        "Bounded JSON preview after recursive key/value redaction. This is for diagnostics only, not editing.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [
        {
          rowKey: "json-preview",
          field: "Preview",
          value: detail.rawJsonPreview,
        },
      ],
      emptyState: {
        title: "No JSON preview is available",
        description:
          "The detail payload did not include a previewable JSON body.",
      },
    },
  ];

  if (analysis) {
    secondaryLiveData.unshift(
      {
        title: "Payload table preview",
        description:
          "First safe rows from shared_sheet_sessions.data with complete/editable overlay context.",
        columns: [
          { key: "rowNumber", label: "Row" },
          { key: "complete", label: "Complete" },
          { key: "editable", label: "Editable value" },
          { key: "item", label: "Main item" },
          { key: "barcode", label: "Barcode" },
          { key: "name", label: "Name" },
          { key: "sourceQuantity", label: "Supplier Qty" },
          { key: "purchasePrice", label: "Purchase" },
          { key: "countedQuantity", label: "Counted Qty" },
          { key: "salePrice", label: "Sale Price" },
          { key: "values", label: "Values" },
        ],
        rows: detail.tablePreview.map(historyPreviewRow),
        emptyState: {
          title: "No payload rows are previewable",
          description:
            "The session data field is empty or not shaped as a grid of rows.",
        },
      },
      {
        title: "Related history sync events",
        description:
          "sync_events rows that explicitly reference this remote_id in entity_ids.session_ids or entity_ids.sessionIds.",
        columns: [
          { key: "event", label: "Event" },
          { key: "state", label: "State" },
          { key: "clientEvent", label: "Client event" },
          { key: "source", label: "Source" },
          { key: "changed", label: "Changed" },
          { key: "sessionIds", label: "Session IDs" },
          { key: "updated", label: "Updated" },
          { key: "sourceScope", label: "Source scope" },
        ],
        rows: detail.relatedSyncEvents.map(relatedHistoryEventRow),
        emptyState: {
          title: "No related history sync events are visible",
          description:
            "The session can exist without a linked sync_events row, or the event may not include this remote_id.",
        },
      },
    );
  }

  return {
    ...shopSections.history,
    title: analysis
      ? "Mobile History Entry Detail"
      : "History Sync Event Detail",
    description: analysis
      ? "Read-only shared_sheet_sessions record detail with remote_id identity, tombstone state, overlay diagnostics and safe row preview."
      : "Read-only sync_events record detail for a technical event linked to mobile history entries.",
    status: "Read-only mapped",
    metrics: analysis
      ? [
          metric("Remote ID", analysis.remoteId, detail.title, "good"),
          metric(
            "State",
            formatToken(analysis.state),
            analysis.deletedAt
              ? formatDateTime(analysis.deletedAt)
              : "Active session",
          ),
          metric(
            "Rows",
            String(analysis.rowCount),
            `${analysis.columnCount} columns`,
          ),
          metric("Total quantity", analysis.totalQuantity, "Source quantity"),
          metric("Order", analysis.orderTotal, "Source quantity x purchase"),
          metric("Paid", analysis.paymentTotal, "Complete rows only"),
          metric(
            "Overlay",
            overlayStatusLabel(analysis.overlayStatus),
            `schema ${analysis.overlaySchema ?? "n/a"}; ${analysis.overlayBytes} bytes`,
            analysis.overlayStatus === "ok" ? "good" : "warning",
          ),
          metric(
            "Completed",
            String(analysis.completeCount),
            `${analysis.missingCount} missing`,
            analysis.missingCount > 0 ? "warning" : "good",
          ),
          metric(
            "Related events",
            String(analysis.relatedSyncEventCount),
            analysis.latestRelatedSyncAt
              ? formatDateTime(analysis.latestRelatedSyncAt)
              : "No related event",
          ),
        ]
      : [
          metric("Entry", detail.entryId, detail.title, "good"),
          metric("Records", String(detail.recordCount), detail.tableSummary),
          metric("Payload", "Redacted", detail.payloadSummary, "good"),
        ],
    liveData: {
      title: analysis ? "shared_sheet_sessions record" : "sync_events record",
      description: analysis
        ? "remote_id is the cross-platform identity. deleted_at marks tombstone/deleted sessions. Invalid overlays are diagnostic only and are not trusted for completed/editable counts."
        : "This technical sync event can reference history entries, but it is not the Android / iOS History Entry itself.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: detail.fields.map(historyDetailRow),
      emptyState: {
        title: "No history detail is visible",
        description:
          "The mapping is present, but this entry is not visible through current RLS.",
      },
    },
    secondaryLiveData,
  };
}

export function buildDevicesSection(
  readModel: ShopDeviceReadModel,
): ShopSection {
  if (readModel.status !== "ready") {
    const status = historyStatusLabel(readModel.status);

    return {
      ...shopSections.devices,
      description: readModel.reason,
      status,
      metrics: [
        metric(
          "Device registry",
          status,
          "Server registry read gate",
          "warning",
        ),
        metric("Rows shown", "0", "No fallback rows are rendered", "muted"),
        metric(
          "Revocation",
          "Unavailable",
          "No registry rows rendered",
          "warning",
        ),
      ],
      liveData: {
        title: "Device registry",
        description:
          "Device registry rows are shown only after Shop Admin authorization.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "Device activity is not ready",
          description: readModel.reason,
        },
      },
    };
  }

  return {
    ...shopSections.devices,
    description:
      "Owner-friendly shop device registry with revoke/reactivate state. Updated Android/iOS/POS clients appear here after authentication or sync.",
    status: "Revocation enforced",
    metrics: [
      metric("Devices", String(readModel.devices.length), "Registered devices"),
      metric(
        "Revoked",
        String(
          readModel.devices.filter((device) => device.status === "revoked")
            .length,
        ),
        "Blocked by registry status",
      ),
      metric(
        "Sync activity hints",
        String(readModel.detectedSyncClients.length),
        "Activity hints only",
      ),
      metric(
        "Revocation",
        "Enforced",
        "Updated POS/Android/iOS clients check active status before sync/write",
      ),
    ],
    liveData: {
      title: "Device registry",
      description:
        "Rows represent authorized shop_devices registry state with read-only sync activity links when available.",
      columns: [
        { key: "device", label: "Device" },
        { key: "identifier", label: "Short id" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "account", label: "Account personale usato" },
        { key: "staff", label: "Staff POS usato" },
        { key: "appVersion", label: "App version" },
        { key: "lastSeen", label: "Last access/sync" },
        { key: "latest", label: "Latest sync" },
        { key: "history", label: "History" },
      ],
      rows: readModel.devices.map((device: ShopDeviceRegistryRow) => ({
        rowKey: device.deviceId,
        device: device.displayName,
        identifier: shortId(device.deviceIdentifier),
        type: formatToken(device.deviceType),
        status: formatToken(device.status),
        account:
          device.lastSeenAccount ??
          (device.lastSeenPrincipalKind === "personal_account"
            ? "Account not visible"
            : "Not seen"),
        staff:
          device.lastSeenStaff ??
          (device.lastSeenPrincipalKind === "pos_staff"
            ? "Staff not visible"
            : "Not seen"),
        appVersion: device.appVersion ?? "Not set",
        lastSeen: formatDateTime(device.lastSeenAt),
        latest: device.syncActivity
          ? `${device.syncActivity.latestDomain}:${device.syncActivity.latestEventType}`
          : "No sync event",
        history: device.deviceDetailHref,
      })),
      emptyState: {
        title: "No registered devices yet",
        description:
          "Devices will appear after login or sync from updated clients.",
      },
    },
    secondaryLiveData: [
      {
        title: "Sync activity hints",
        description:
          "Read-only activity hints from sync_events.source_device_id. These rows are not authorized devices and cannot be revoked here.",
        columns: [
          { key: "sourceDeviceId", label: "Source device id" },
          { key: "status", label: "Status" },
          { key: "source", label: "Source" },
          { key: "latest", label: "Latest sync" },
          { key: "events", label: "Events" },
          { key: "changed", label: "Changed rows" },
          { key: "history", label: "History" },
        ],
        rows: readModel.detectedSyncClients.map(
          (client: ShopDetectedSyncClient) => ({
            rowKey: client.sourceDeviceId,
            sourceDeviceId: client.sourceDeviceId,
            status: "Activity hint only",
            source: client.source ?? "unknown",
            latest: `${client.latestDomain}:${client.latestEventType} / ${formatDateTime(client.latestEventAt)}`,
            events: String(client.eventCount),
            changed: String(client.changedCount),
            history: client.historyHref,
          }),
        ),
        emptyState: {
          title: "No sync-only clients detected",
          description:
            "sync_events.source_device_id has no unmapped client hints for this shop.",
        },
      },
    ],
  };
}

export function buildStaffDetailSection(
  readModel: ShopStaffReadModel,
  staffId: string,
): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    const status = readModelStatusLabel(readModel.status);

    return {
      ...shopSections.staff,
      title: "Staff Detail",
      description: readModel.reason,
      status,
      metrics: [
        metric(
          "Staff",
          "Unavailable",
          "No staff detail row is rendered",
          "muted",
        ),
        metric(
          "Credential hash",
          "Hidden",
          "Safe view excludes hashes",
          "good",
        ),
        metric("Scope", status, "Server-side shop access"),
      ],
      liveData: {
        title: "Staff detail",
        description:
          "Staff details are shown only through the credential-safe view.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "Staff detail is not available",
          description: readModel.reason,
        },
      },
    };
  }

  const staff = readModel.staffAccounts.find((row) => row.staffId === staffId);

  return {
    ...shopSections.staff,
    title: "Staff Detail",
    description: staff
      ? "Credential-safe POS staff detail for the verified selected shop."
      : "No staff row is visible for this shop-scoped detail request.",
    status: staff ? "Credential-safe detail" : "Not found",
    metrics: [
      metric(
        "Staff code",
        staff?.staffCode ?? "Not found",
        staff?.displayName ?? "No row",
      ),
      metric(
        "Status",
        staff ? formatToken(staff.status) : "Not found",
        "POS staff state",
      ),
      metric(
        "Credential hash",
        "Hidden",
        "Safe view excludes stored hashes",
        "good",
      ),
    ],
    liveData: {
      title: "Staff detail",
      description:
        "PIN/password authentication is not implemented here. This detail prepares the fields needed by future POS auth.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: staff
        ? detailSectionRows([
            { field: "Staff id", value: staff.staffId },
            { field: "Staff code", value: staff.staffCode },
            { field: "Display name", value: staff.displayName },
            { field: "Role", value: formatToken(staff.roleKey) },
            { field: "Status", value: formatToken(staff.status) },
            {
              field: "Credential status",
              value: formatToken(staff.credentialStatus),
            },
            {
              field: "Credential version",
              value: `v${staff.credentialVersion}`,
            },
            {
              field: "Credential kind",
              value: staff.credentialKind
                ? formatToken(staff.credentialKind)
                : "Pending setup",
            },
            {
              field: "Must change credential",
              value: staff.mustChangeCredential ? "Yes" : "No",
            },
            { field: "Failed attempts", value: String(staff.failedAttempts) },
            { field: "Locked until", value: formatDateTime(staff.lockedUntil) },
            { field: "Last login", value: formatDateTime(staff.lastLoginAt) },
            {
              field: "Session invalidated",
              value: formatDateTime(staff.sessionInvalidatedAt),
            },
            { field: "Updated", value: formatDateTime(staff.updatedAt) },
          ])
        : [],
      emptyState: {
        title: "Staff not found",
        description:
          "No staff row with this id is visible through the credential-safe shop view.",
      },
    },
  };
}

export function buildDeviceDetailSection(
  readModel: ShopDeviceReadModel,
  deviceId: string,
): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    const status = readModelStatusLabel(readModel.status);

    return {
      ...shopSections.devices,
      title: "Device Detail",
      description: readModel.reason,
      status,
      metrics: [
        metric(
          "Device",
          "Unavailable",
          "No device detail row is rendered",
          "muted",
        ),
        metric("Registry", status, "Server-side shop access"),
        metric(
          "Secret fields",
          "Hidden",
          "No device tokens are rendered",
          "good",
        ),
      ],
      liveData: {
        title: "Device detail",
        description:
          "Device details are shown only after Shop Admin authorization.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "Device detail is not available",
          description: readModel.reason,
        },
      },
    };
  }

  const device = readModel.devices.find((row) => row.deviceId === deviceId);

  return {
    ...shopSections.devices,
    title: "Device Detail",
    description: device
      ? "Server registry detail for a shop device. Updated POS/Android/iOS clients check active status before sync/write."
      : "No device row is visible for this shop-scoped detail request.",
    status: device ? "Server registry detail" : "Not found",
    metrics: [
      metric(
        "Device",
        device?.displayName ?? "Not found",
        device?.deviceIdentifier ?? "No row",
      ),
      metric(
        "Status",
        device ? formatToken(device.status) : "Not found",
        "Server registry status",
      ),
      metric("Audit", "Linked", "Use target filter in Shop Audit"),
    ],
    liveData: {
      title: "Device detail",
      description:
        "The detail view links device registry state with latest sync attribution when available.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: device
        ? detailSectionRows([
            { field: "Device id", value: device.deviceId },
            { field: "Identifier", value: device.deviceIdentifier },
            { field: "Display name", value: device.displayName },
            { field: "Type", value: formatToken(device.deviceType) },
            { field: "Status", value: formatToken(device.status) },
            { field: "App version", value: device.appVersion ?? "Not set" },
            { field: "Last seen", value: formatDateTime(device.lastSeenAt) },
            { field: "Revoked", value: formatDateTime(device.revokedAt) },
            {
              field: "Latest sync",
              value: device.syncActivity
                ? `${device.syncActivity.latestDomain}:${device.syncActivity.latestEventType}`
                : "No sync event",
            },
            { field: "Audit target filter", value: device.deviceId },
          ])
        : [],
      emptyState: {
        title: "Device not found",
        description:
          "No device row with this id is visible through the shop device registry.",
      },
    },
  };
}

export function buildAuditDetailSection(
  readModel: ShopAuditDetailReadModel,
): ShopSection {
  if (readModel.status !== "ready" || !readModel.event) {
    return {
      ...shopSections.audit,
      title: "Audit Event Detail",
      description: readModel.reason,
      status: readModelStatusLabel(readModel.status),
      metrics: [
        metric(
          "Audit event",
          "Unavailable",
          "No detail row is rendered",
          "muted",
        ),
        metric(
          "Metadata",
          "Redacted",
          "Raw sensitive metadata is not rendered",
          "good",
        ),
        metric(
          "Scope",
          "Server verified",
          "No cross-shop event lookup",
          "good",
        ),
      ],
      liveData: {
        title: "Audit event detail",
        description:
          "Audit event detail is shown only after active shop membership is verified.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "Audit event detail is not available",
          description: readModel.reason,
        },
      },
    };
  }

  const event = readModel.event;

  return {
    ...shopSections.audit,
    title: "Audit Event Detail",
    description:
      "Redacted shop audit detail for the verified selected shop. Sensitive metadata remains summarized.",
    status: "Read-only detail",
    metrics: [
      metric("Event", event.eventKey, formatDateTime(event.createdAt)),
      metric("Result", formatToken(event.result), formatToken(event.severity)),
      metric("Metadata", "Redacted", event.metadataSummary, "good"),
    ],
    liveData: {
      title: "Audit event detail",
      description:
        "Metadata is read from metadata_redacted and passed through recursive redaction again before rendering.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: detailSectionRows([
        { field: "Audit event id", value: event.auditLogId },
        { field: "Event", value: event.eventKey },
        {
          field: "Actor",
          value:
            event.actorIdentity?.email ??
            event.actorIdentity?.displayName ??
            shortId(event.actorProfileId),
        },
        {
          field: "Actor provider",
          value: event.actorIdentity?.originLabel ?? "Origin unavailable",
        },
        { field: "Severity", value: formatToken(event.severity) },
        { field: "Result", value: formatToken(event.result) },
        {
          field: "Target",
          value: event.targetType
            ? `${event.targetType}:${event.targetId ?? "unknown"}`
            : "None",
        },
        { field: "Metadata summary", value: event.metadataSummary },
        { field: "Redacted metadata", value: event.metadataPreview },
        { field: "Created", value: formatDateTime(event.createdAt) },
      ]),
      emptyState: {
        title: "Audit event not found",
        description:
          "No audit event with this id is visible through the verified shop boundary.",
      },
    },
  };
}

function permissionRows(
  matrix: Record<string, readonly string[]>,
  namespace: string,
): ShopSectionTableRow[] {
  return Object.entries(matrix).map(([role, permissions]) => ({
    rowKey: `${namespace}:${role}`,
    role: formatToken(role),
    namespace,
    permissions: permissions.join(", "),
    count: String(permissions.length),
  }));
}

export function buildRolesSection(): ShopSection {
  return {
    ...shopSections.roles,
    description:
      "Server-side baseline permission matrix for web shop members and POS staff roles. Granular editing is not available yet because no granular roles schema exists.",
    status: "Baseline matrix",
    metrics: [
      metric(
        "Web roles",
        String(Object.keys(SHOP_ADMIN_PERMISSION_MATRIX).length),
        "shop_members role_key",
      ),
      metric(
        "Staff roles",
        String(Object.keys(SHOP_STAFF_PERMISSION_MATRIX).length),
        "staff_accounts role_key",
      ),
      metric(
        "Granular editing",
        "Not available yet",
        "Baseline matrix only. No granular roles schema yet.",
        "warning",
      ),
    ],
    liveData: {
      title: "Permissions matrix",
      description:
        "The matrix separates personal web memberships from POS staff roles.",
      columns: [
        { key: "role", label: "Role" },
        { key: "namespace", label: "Namespace" },
        { key: "count", label: "Count" },
        { key: "permissions", label: "Permissions" },
      ],
      rows: [
        ...permissionRows(SHOP_ADMIN_PERMISSION_MATRIX, "web"),
        ...permissionRows(SHOP_STAFF_PERMISSION_MATRIX, "staff"),
      ],
      emptyState: {
        title: "No permissions are configured",
        description: "The server-side permission matrix is unavailable.",
      },
    },
  };
}

export function buildSettingsSection(
  readModel: ShopAdminReadModel,
): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    return fallbackSection("settings", readModel);
  }

  const shop = readModel.selectedShop;
  const fiscalRows = [
    {
      rowKey: "company-rut",
      field: "Company RUT",
      value: formatCompanyRut(shop.companyRut),
    },
    {
      rowKey: "giro",
      field: "Giro",
      value: shop.businessGiro ?? "Not configured",
    },
    {
      rowKey: "address",
      field: "Address",
      value: shop.businessAddress ?? "Not configured",
    },
    {
      rowKey: "city",
      field: "City",
      value: shop.businessCity ?? "Not configured",
    },
    {
      rowKey: "legal-representative",
      field: "Legal representative RUT",
      value: shop.legalRepresentativeRut ?? "Not configured",
    },
  ];

  return {
    ...shopSections.settings,
    description:
      "Shop profile and fiscal identity are managed by Master Console. Admin Console can view these fields but cannot edit them. Fiscal/boleta identity is managed by Master Console.",
    status: "Read-only",
    metrics: [
      metric("Shop", shop.shopCode, shop.shopName, "good"),
      metric("Status", formatToken(shop.shopStatus), "Current shop state"),
      metric(
        "Profile updates",
        "Master Console only",
        "Shop profile and fiscal identity are read-only in Admin Console",
        "warning",
      ),
    ],
    liveData: {
      title: "Shop profile and fiscal identity",
      description:
        "Verified shop profile fields visible through the server boundary. Shop profile and fiscal identity are managed by Master Console.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [
        { rowKey: "name", field: "Shop name", value: shop.shopName },
        { rowKey: "code", field: "Shop code", value: shop.shopCode },
        {
          rowKey: "status",
          field: "Status",
          value: formatToken(shop.shopStatus),
        },
        {
          rowKey: "role",
          field: "Current role",
          value: formatToken(shop.role),
        },
        {
          rowKey: "updated",
          field: "Updated",
          value: formatDateTime(shop.updatedAt),
        },
        {
          rowKey: "fiscal-boundary",
          field: "Fiscal boundary",
          value: "Read-only in Admin Console",
        },
        ...fiscalRows,
      ],
      emptyState: {
        title: "No shop profile is visible",
        description:
          "The selected shop was verified, but no profile row is visible through RLS.",
      },
    },
  };
}

export async function getShopSectionForRequest(
  key: ShopSectionKey,
  requestedShopId?: string | null,
  options: GetShopSectionForRequestOptions = {},
): Promise<ShopSection> {
  if (key === "staff") {
    const staffReadModel = await getShopStaffReadModel({ requestedShopId });

    return buildStaffSection(staffReadModel);
  }

  if (key === "pos") {
    const posLiveReadModel = await getShopPosLiveReadModel({ requestedShopId });

    return buildPosLiveSection(posLiveReadModel);
  }

  if (key === "products") {
    const inventoryReadModel =
      options.inventoryReadModel ??
      (await getShopInventoryReadModel({
        requestedShopId,
      }));

    return buildProductsSection(inventoryReadModel, options.catalogFilters);
  }

  if (key === "categories") {
    const catalogReadModel =
      options.catalogOptionsReadModel ??
      (await getShopCategoriesPageReadModel({ requestedShopId }));

    return buildCategoriesSection(catalogReadModel, options.catalogFilters);
  }

  if (key === "suppliers") {
    const catalogReadModel =
      options.catalogOptionsReadModel ??
      (await getShopSuppliersPageReadModel({ requestedShopId }));

    return buildSuppliersSection(catalogReadModel, options.catalogFilters);
  }

  if (key === "importExport") {
    return buildImportExportSection();
  }

  if (key === "history") {
    const historyReadModel = await getShopHistoryReadModel({ requestedShopId });

    return buildHistorySection(historyReadModel);
  }

  if (key === "sync") {
    const historyReadModel = await getShopSyncReadModel({ requestedShopId });

    return buildSyncSection(historyReadModel, options.syncFilters);
  }

  if (key === "devices") {
    const deviceReadModel = await getShopDeviceReadModel({ requestedShopId });

    return buildDevicesSection(deviceReadModel);
  }

  if (key === "roles") {
    return buildRolesSection();
  }

  const readModel = await getShopAdminReadModel({ requestedShopId });

  switch (key) {
    case "overview": {
      return buildOverviewSection(readModel);
    }
    case "members":
      return buildMembersSection(readModel);
    case "audit": {
      const auditReadModel = await getShopAuditReadModel({
        eventQuery: options.auditFilters?.eventQuery,
        requestedShopId,
        result: options.auditFilters?.result,
        severity: options.auditFilters?.severity,
        targetId: options.auditFilters?.targetId,
      });

      return buildAuditSection(auditReadModel);
    }
    case "settings":
      return buildSettingsSection(readModel);
    default:
      return shopSections[key];
  }
}

export async function getShopCatalogDetailSectionForRequest(
  kind: "product" | "category" | "supplier",
  catalogId: string,
  requestedShopId?: string | null,
): Promise<ShopSection> {
  if (kind === "product") {
    const [inventoryReadModel, historyReadModel] = await Promise.all([
      getShopInventoryProductDetailReadModel({
        productId: catalogId,
        requestedShopId,
      }),
      getShopHistoryReadModel({ requestedShopId }),
    ]);

    return buildProductDetailSection(
      inventoryReadModel,
      catalogId,
      historyReadModel,
    );
  }

  const inventoryReadModel = await getShopInventoryReadModel({
    requestedShopId,
  });

  if (kind === "category") {
    return buildCategoryDetailSection(inventoryReadModel, catalogId);
  }

  return buildSupplierDetailSection(inventoryReadModel, catalogId);
}

export async function getShopMemberDetailSectionForRequest(
  memberId: string,
  requestedShopId?: string | null,
): Promise<ShopSection> {
  const readModel = await getShopAdminReadModel({ requestedShopId });

  return buildMemberDetailSection(readModel, memberId);
}

export async function getShopStaffDetailSectionForRequest(
  staffId: string,
  requestedShopId?: string | null,
): Promise<ShopSection> {
  const staffReadModel = await getShopStaffReadModel({ requestedShopId });

  return buildStaffDetailSection(staffReadModel, staffId);
}

export async function getShopDeviceDetailSectionForRequest(
  deviceId: string,
  requestedShopId?: string | null,
): Promise<ShopSection> {
  const deviceReadModel = await getShopDeviceReadModel({ requestedShopId });

  return buildDeviceDetailSection(deviceReadModel, deviceId);
}

export async function getShopAuditDetailSectionForRequest(
  eventId: string,
  requestedShopId?: string | null,
): Promise<ShopSection> {
  const auditReadModel = await getShopAuditDetailReadModel(eventId, {
    requestedShopId,
  });

  return buildAuditDetailSection(auditReadModel);
}

export async function getShopHistoryDetailSectionForRequest(
  entryId: string,
  requestedShopId?: string | null,
): Promise<ShopSection> {
  const historyReadModel = await getShopHistoryDetailReadModel(entryId, {
    requestedShopId,
  });

  return buildHistoryDetailSection(historyReadModel);
}
