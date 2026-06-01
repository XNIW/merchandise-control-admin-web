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
  type ShopDeviceReadModel,
  type ShopDeviceRegistryRow,
} from "./device-read-model";
import {
  getShopHistoryDetailReadModel,
  getShopHistoryReadModel,
  type ShopHistoryDetailField,
  type ShopHistoryDetailReadModel,
  type ShopHistoryReadModel,
  type ShopHistorySession,
  type ShopSyncEventActivity,
} from "./history-read-model";
import {
  getImportExportReadiness,
  sanitizeSpreadsheetCell,
} from "./import-export-readiness";
import {
  getShopInventoryReadModel,
  type ShopInventoryCategory,
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
  supplierId?: string | null;
};

type GetShopSectionForRequestOptions = {
  auditFilters?: {
    eventQuery?: string | null;
    result?: string | null;
    severity?: string | null;
    targetId?: string | null;
  };
  catalogFilters?: CatalogFilters;
};

const formatToken = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

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
      metric("Supabase", statusByReadModel[readModel.status], "Server-only read"),
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
      metric("Members", String(readModel.members.length), "Visible shop members"),
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
  const latestSync = historyReadModel.syncEvents[0];
  const latestAudit = auditReadModel.events[0];
  const activeStaff = staffReadModel.staffAccounts.filter(
    (staff) => staff.status === "active",
  ).length;
  const revokedDevices = deviceReadModel.devices.filter(
    (device) => device.status === "revoked",
  ).length;
  const failedSync = historyReadModel.syncEvents.filter(
    (event) => event.status === "failed",
  ).length;

  return {
    ...shopSections.overview,
    description:
      "Operational dashboard for the verified selected shop. Rows are loaded from server-side shop-scoped read models.",
    status: "Operational",
    metrics: [
      metric("Shop", shop.shopCode, shop.shopName, "good"),
      metric("Products", String(inventoryReadModel.products.length), "Mapped active rows"),
      metric("Categories", String(inventoryReadModel.categories.length), "Mapped taxonomy"),
      metric("Suppliers", String(inventoryReadModel.suppliers.length), "Mapped suppliers"),
      metric("Staff active", String(activeStaff), "Credential-safe staff rows", "good"),
      metric("Devices", String(deviceReadModel.devices.length), `${revokedDevices} revoked`),
      metric("Sync failed", String(failedSync), "Latest mapped sync events", failedSync > 0 ? "warning" : "good"),
      metric("Audit events", String(auditReadModel.events.length), "Latest shop audit rows"),
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
    profile: shortId(member.profileId),
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
      "Read-only member list for the verified selected shop. Profile identifiers are shortened in the UI.",
    status: readModel.members.length > 0 ? "Read-only" : "Members empty",
    metrics: [
      metric("Members", String(readModel.members.length), "Rows scoped by shop_id"),
      metric("Owners", String(owners), "shop_owner memberships", "good"),
      metric("Managers", String(managers), "shop_manager memberships"),
    ],
    liveData: {
      title: "Live shop data",
      description:
        "Live rows for the selected shop. Changes are not available on this page.",
      columns: [
        { key: "profile", label: "Profile" },
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
      ? "Shop member detail for the verified selected shop. Profile identifiers remain shortened in summary surfaces."
      : "No member row is visible for this shop-scoped detail request.",
    status: member ? "Read-only detail" : "Not found",
    metrics: [
      metric("Member", member ? shortId(member.profileId) : "Not found", "Personal web account"),
      metric("Role", member ? formatToken(member.roleKey) : "Not found", "shop_members role_key"),
      metric("Status", member ? formatToken(member.membershipStatus) : "Not found", "Membership state"),
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
    actor: shortId(log.actorProfileId),
    severity: formatToken(log.severity),
    result: formatToken(log.result),
    target: log.targetType ? `${log.targetType}:${log.targetId ?? "unknown"}` : "None",
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
        metric("Filters", "Server-side", "No client-only audit filtering", "good"),
        metric("Metadata", "Redacted", "Sensitive fields are not rendered", "good"),
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
      metric("Audit events", String(readModel.events.length), "Chronological rows"),
      metric("Warnings", String(warnings), "Warning or critical severity"),
      metric("Blocked", String(blocked), "Blocked or failed results", "warning"),
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

function staffRow(
  staff: ShopStaffReadModelStaffAccount,
): ShopSectionTableRow {
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

export function buildPosLiveSection(readModel: ShopPosLiveReadModel): ShopSection {
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
      metric("Devices", String(summary.registeredDevices), "Registered POS devices"),
      metric("Trusted", String(summary.trustedActiveDevices), "Active device credentials", "good"),
      metric("Revoked", String(summary.revokedDevices), "Device registry state", summary.revokedDevices > 0 ? "warning" : "good"),
      metric("Active sessions", String(summary.activeSessions), "Not expired", "good"),
      metric("Expired sessions", String(summary.expiredSessions), "Expired or past TTL", summary.expiredSessions > 0 ? "warning" : "good"),
      metric("Linked staff", String(summary.linkedStaff), "Credential-safe staff rows"),
      metric("Last heartbeat", formatDateTime(summary.latestHeartbeatAt), "Latest POS session/device activity"),
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
        metric("Credential hashes", "Hidden", "Safe view excludes hashes", "good"),
        metric("Actions", "Available", "Audited create/reset/suspend flows", "good"),
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
    status:
      readModel.staffAccounts.length > 0 ? "Live actions" : "Staff empty",
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

function inventoryFallbackSection(
  key: "products" | "categories" | "suppliers",
  readModel: ShopInventoryReadModel,
): ShopSection {
  const base = shopSections[key];
  const status = inventoryStatusLabel(readModel.status);

  return {
    ...base,
    description: readModel.reason,
    status,
    metrics: [
      metric("Mapping", status, "shop_inventory_sources gate", "warning"),
      metric("Rows shown", "0", "No fallback rows are rendered", "muted"),
      metric("Writes", "Blocked", "Mutation boundary not verified", "warning"),
    ],
    liveData: {
      title: "Mapped inventory data",
      description:
        "Rows are shown only after a verified shop_inventory_sources mapping resolves the owner-scoped inventory source.",
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
  return {
    rowKey: product.productId,
    barcode: product.barcode,
    name: product.productName ?? "Unnamed",
    retail: product.retailPrice === null ? "Not set" : String(product.retailPrice),
    purchase:
      product.purchasePrice === null ? "Not set" : String(product.purchasePrice),
    stock:
      product.stockQuantity === null ? "Not set" : String(product.stockQuantity),
    supplier: product.supplierId
      ? (suppliers.get(product.supplierId)?.name ?? "Unknown")
      : "None",
    category: product.categoryId
      ? (categories.get(product.categoryId)?.name ?? "Unknown")
      : "None",
    updated: formatDateTime(product.updatedAt),
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
  const filteredProducts = applyCatalogFilters(readModel.products, filters);
  const activeFilters = Object.values(filters).filter((value) =>
    Boolean(value?.trim()),
  ).length;

  return {
    ...shopSections.products,
    description:
      "Mapped inventory products for the verified selected shop. Create, update and archive use audited catalog RPCs.",
    status: readModel.products.length > 0 ? "Live actions" : "Products empty",
    metrics: [
      metric("Products", String(filteredProducts.length), "Filtered mapped rows"),
      metric("Prices", String(readModel.prices.length), "Recent price rows"),
      metric("Filters", String(activeFilters), "Search/category/supplier"),
      metric("Writes", "Enabled", "Audited create/update/archive", "good"),
    ],
    liveData: {
      title: "Mapped inventory data",
      description:
        "Products are read through the selected shop mapping and mutated only through server-side RPCs.",
      columns: [
        { key: "barcode", label: "Barcode" },
        { key: "name", label: "Name" },
        { key: "retail", label: "Retail" },
        { key: "purchase", label: "Purchase" },
        { key: "stock", label: "Stock" },
        { key: "supplier", label: "Supplier" },
        { key: "category", label: "Category" },
        { key: "updated", label: "Updated" },
      ],
      rows: filteredProducts.map((product) =>
        productRow(product, categories, suppliers),
      ),
      emptyState: {
        title: "No mapped products are visible",
        description:
          "The mapping is present, but no active product rows are visible through current RLS.",
      },
    },
  };
}

export function buildCategoriesSection(
  readModel: ShopInventoryReadModel,
  filters: CatalogFilters = {},
): ShopSection {
  if (readModel.status !== "ready") {
    return inventoryFallbackSection("categories", readModel);
  }

  const filteredCategories = applyNamedCatalogFilter(
    readModel.categories,
    filters,
  );
  const activeFilters = Object.values(filters).filter((value) =>
    Boolean(value?.trim()),
  ).length;

  return {
    ...shopSections.categories,
    description:
      "Mapped category list for the verified selected shop. Create, update and archive use audited catalog RPCs.",
    status:
      readModel.categories.length > 0 ? "Live actions" : "Categories empty",
    metrics: [
      metric("Categories", String(filteredCategories.length), "Filtered mapped rows"),
      metric("Products", String(readModel.products.length), "Products loaded"),
      metric("Filters", String(activeFilters), "Search"),
      metric("Writes", "Enabled", "Audited create/update/archive", "good"),
    ],
    liveData: {
      title: "Mapped inventory data",
      description: "Categories are read through the selected shop mapping.",
      columns: [
        { key: "name", label: "Name" },
        { key: "updated", label: "Updated" },
      ],
      rows: filteredCategories.map((category) => ({
        rowKey: category.categoryId,
        name: category.name,
        updated: formatDateTime(category.updatedAt),
      })),
      emptyState: {
        title: "No mapped categories are visible",
        description:
          "The mapping is present, but no active category rows are visible through current RLS.",
      },
    },
  };
}

export function buildSuppliersSection(
  readModel: ShopInventoryReadModel,
  filters: CatalogFilters = {},
): ShopSection {
  if (readModel.status !== "ready") {
    return inventoryFallbackSection("suppliers", readModel);
  }

  const filteredSuppliers = applyNamedCatalogFilter(readModel.suppliers, filters);
  const activeFilters = Object.values(filters).filter((value) =>
    Boolean(value?.trim()),
  ).length;

  return {
    ...shopSections.suppliers,
    description:
      "Mapped supplier list for the verified selected shop. Create, update and archive use audited catalog RPCs.",
    status:
      readModel.suppliers.length > 0 ? "Live actions" : "Suppliers empty",
    metrics: [
      metric("Suppliers", String(filteredSuppliers.length), "Filtered mapped rows"),
      metric("Products", String(readModel.products.length), "Products loaded"),
      metric("Filters", String(activeFilters), "Search"),
      metric("Writes", "Enabled", "Audited create/update/archive", "good"),
    ],
    liveData: {
      title: "Mapped inventory data",
      description: "Suppliers are read through the selected shop mapping.",
      columns: [
        { key: "name", label: "Name" },
        { key: "updated", label: "Updated" },
      ],
      rows: filteredSuppliers.map((supplier) => ({
        rowKey: supplier.supplierId,
        name: supplier.name,
        updated: formatDateTime(supplier.updatedAt),
      })),
      emptyState: {
        title: "No mapped suppliers are visible",
        description:
          "The mapping is present, but no active supplier rows are visible through current RLS.",
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
      metric("Mapping", inventoryStatusLabel(readModel.status), "shop_inventory_sources gate", "warning"),
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
): ShopSection {
  if (readModel.status !== "ready") {
    return catalogDetailFallback("Product Detail", readModel);
  }

  const product = readModel.products.find((row) => row.productId === productId);
  const category = product?.categoryId
    ? readModel.categories.find((row) => row.categoryId === product.categoryId)
    : null;
  const supplier = product?.supplierId
    ? readModel.suppliers.find((row) => row.supplierId === product.supplierId)
    : null;
  const priceRows = readModel.prices.filter((row) => row.productId === productId);

  return {
    ...shopSections.products,
    title: "Product Detail",
    description: product
      ? "Shop-scoped product detail loaded from the mapped inventory source."
      : "No active product row is visible for this shop-scoped detail request.",
    status: product ? "Read-only detail" : "Not found",
    metrics: [
      metric("Product", product ? product.barcode : "Not found", product?.productName ?? "No row"),
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
            { field: "Barcode", value: product.barcode },
            { field: "Product name", value: product.productName ?? "Unnamed" },
            { field: "Second name", value: product.secondProductName ?? "Not set" },
            { field: "Item number", value: product.itemNumber ?? "Not set" },
            { field: "Retail price", value: product.retailPrice === null ? "Not set" : String(product.retailPrice) },
            { field: "Purchase price", value: product.purchasePrice === null ? "Not set" : String(product.purchasePrice) },
            { field: "Stock quantity", value: product.stockQuantity === null ? "Not set" : String(product.stockQuantity) },
            { field: "Supplier", value: supplier?.name ?? product.supplierId ?? "None" },
            { field: "Category", value: category?.name ?? product.categoryId ?? "None" },
            { field: "Updated", value: formatDateTime(product.updatedAt) },
          ])
        : [],
      emptyState: {
        title: "Product not found",
        description:
          "No active product row with this id is visible through the verified shop mapping.",
      },
    },
  };
}

export function buildCategoryDetailSection(
  readModel: ShopInventoryReadModel,
  categoryId: string,
): ShopSection {
  if (readModel.status !== "ready") {
    return catalogDetailFallback("Category Detail", readModel);
  }

  const category = readModel.categories.find((row) => row.categoryId === categoryId);
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

  const supplier = readModel.suppliers.find((row) => row.supplierId === supplierId);
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
      metric("Supplier", supplier?.name ?? "Not found", "Mapped procurement row"),
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
      metric("Preview before apply", "Required", "File changes are never applied directly", "good"),
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
          detail: sanitizeSpreadsheetCell("=formula") === "'=formula"
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

function syncEventRow(event: ShopSyncEventActivity): ShopSectionTableRow {
  return {
    rowKey: `sync:${event.eventId}`,
    kind: "Sync event",
    label: `${event.domain}:${event.eventType}`,
    source: event.sourceDeviceId ?? event.source ?? "Unknown",
    count: String(event.changedCount),
    payload: `${event.entitySummary}; ${event.metadataSummary}`,
    updated: formatDateTime(event.createdAt),
  };
}

function historySessionRow(session: ShopHistorySession): ShopSectionTableRow {
  return {
    rowKey: `session:${session.remoteId}`,
    kind: session.deletedAt ? "History tombstone" : "History session",
    label: session.displayName,
    source: [session.supplier, session.category].filter(Boolean).join(" / "),
    count: `v${session.payloadVersion}`,
    payload: `${session.dataSummary}; ${session.overlaySummary}`,
    updated: formatDateTime(session.updatedAt),
  };
}

export function buildHistorySection(readModel: ShopHistoryReadModel): ShopSection {
  if (readModel.status !== "ready") {
    const status = historyStatusLabel(readModel.status);

    return {
      ...shopSections.history,
      description: readModel.reason,
      status,
      metrics: [
        metric("Mapping", status, "shop_inventory_sources gate", "warning"),
        metric("Rows shown", "0", "No fallback rows are rendered", "muted"),
        metric("Payload", "Redacted", "Raw mobile JSON is not rendered", "good"),
      ],
      liveData: {
        title: "Mobile history activity",
        description:
          "History rows are shown only after a verified shop mapping resolves the owner-scoped mobile source.",
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

  return {
    ...shopSections.history,
    description:
      "Read-only mobile sync/history activity for the verified selected shop. Payloads are summarized and recursively redacted.",
    status:
      readModel.syncEvents.length + readModel.sessions.length > 0
        ? "Read-only mapped"
        : "History empty",
    metrics: [
      metric("Sync events", String(readModel.syncEvents.length), "Mapped rows"),
      metric("Sessions", String(readModel.sessions.length), "History rows"),
      metric("Payload", "Redacted", "No raw JSON is rendered", "good"),
    ],
    liveData: {
      title: "Mobile history activity",
      description:
        "Sync events and shared sheet sessions are summarized separately from web audit logs.",
      columns: [
        { key: "kind", label: "Kind" },
        { key: "label", label: "Label" },
        { key: "source", label: "Source" },
        { key: "count", label: "Count" },
        { key: "payload", label: "Payload summary" },
        { key: "updated", label: "Updated" },
      ],
      rows: [
        ...readModel.syncEvents.map(syncEventRow),
        ...readModel.sessions.map(historySessionRow),
      ],
      emptyState: {
        title: "No mobile history rows are visible",
        description:
          "The mapping is present, but no sync or session rows are visible through current RLS.",
      },
    },
  };
}

function syncStatusRow(status: "pending" | "success" | "failed", count: number) {
  return {
    rowKey: `status:${status}`,
    event: status,
    domain: "all",
    state: status,
    source: "Status summary",
    changed: String(count),
    updated: "Current result set",
  };
}

export function buildSyncSection(readModel: ShopHistoryReadModel): ShopSection {
  if (readModel.status !== "ready") {
    const status = historyStatusLabel(readModel.status);

    return {
      ...shopSections.sync,
      description: readModel.reason,
      status,
      metrics: [
        metric("Mapping", status, "shop_inventory_sources gate", "warning"),
        metric("Sync events", "0", "No fallback rows are rendered", "muted"),
        metric("Mode", "Read-only", "Admin Web does not synchronize clients", "good"),
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

  const pending = readModel.syncEvents.filter(
    (event) => event.status === "pending",
  ).length;
  const success = readModel.syncEvents.filter(
    (event) => event.status === "success",
  ).length;
  const failed = readModel.syncEvents.filter(
    (event) => event.status === "failed",
  ).length;

  return {
    ...shopSections.sync,
    description:
      "Read-only Sync Center for mapped mobile events. This page classifies pending, success and failed states without triggering synchronization.",
    status: readModel.syncEvents.length > 0 ? "Read-only mapped" : "Sync empty",
    metrics: [
      metric("Pending", String(pending), "Events marked pending"),
      metric("Success", String(success), "Events without failure metadata", "good"),
      metric("Failed", String(failed), "Events with failure metadata", failed > 0 ? "warning" : "good"),
    ],
    liveData: {
      title: "Sync events",
      description:
        "Sync activity is separate from shop audit. Pending, success and failed are derived from the event payload when available.",
      columns: [
        { key: "event", label: "Event" },
        { key: "domain", label: "Domain" },
        { key: "state", label: "State" },
        { key: "source", label: "Source" },
        { key: "changed", label: "Changed" },
        { key: "updated", label: "Updated" },
      ],
      rows: [
        syncStatusRow("pending", pending),
        syncStatusRow("success", success),
        syncStatusRow("failed", failed),
        ...readModel.syncEvents.map((event) => ({
          rowKey: `sync:${event.eventId}`,
          event: event.eventType,
          domain: event.domain,
          state: event.status,
          source: event.sourceDeviceId ?? event.source ?? "Unknown",
          changed: String(event.changedCount),
          updated: formatDateTime(event.createdAt),
        })),
      ],
      emptyState: {
        title: "No sync events are visible",
        description:
          "The mapping is present, but no sync rows are visible through current RLS.",
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
        metric("Payload", "Redacted", "Raw mobile JSON is not rendered", "good"),
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

  return {
    ...shopSections.history,
    title: "History Detail",
    description:
      "Read-only mobile history detail for the verified selected shop. Nested payload data is recursively redacted and limited.",
    status: "Read-only mapped",
    metrics: [
      metric("Entry", detail.entryId, detail.title, "good"),
      metric("Records", String(detail.recordCount), detail.tableSummary),
      metric("Payload", "Redacted", detail.payloadSummary, "good"),
    ],
    liveData: {
      title: "History detail",
      description:
        "Detail fields are loaded from the mapped mobile source and kept separate from web audit logs.",
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
  };
}

export function buildDevicesSection(readModel: ShopDeviceReadModel): ShopSection {
  if (readModel.status !== "ready") {
    const status = historyStatusLabel(readModel.status);

    return {
      ...shopSections.devices,
      description: readModel.reason,
      status,
      metrics: [
        metric("Device registry", status, "Server registry read gate", "warning"),
        metric("Rows shown", "0", "No fallback rows are rendered", "muted"),
        metric("Revocation", "Unavailable", "No registry rows rendered", "warning"),
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
      "Server registry for shop devices with revoke/reactivate state. Mobile/POS clients must consume this registry before revocation becomes client-enforced.",
    status: "Server registry",
    metrics: [
      metric("Devices", String(readModel.devices.length), "Registered rows"),
      metric("Revoked", String(readModel.devices.filter((device) => device.status === "revoked").length), "Server-side status"),
      metric("Revocation", "Server-side", "Client enforcement is a mobile/POS follow-up", "warning"),
    ],
    liveData: {
      title: "Device registry",
      description:
        "Rows represent the Admin Web authorization registry with read-only sync activity links when available.",
      columns: [
        { key: "device", label: "Device" },
        { key: "identifier", label: "Identifier" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "latest", label: "Latest sync" },
        { key: "history", label: "History" },
        { key: "updated", label: "Updated" },
      ],
      rows: readModel.devices.map((device: ShopDeviceRegistryRow) => ({
        rowKey: device.deviceId,
        device: device.displayName,
        identifier: device.deviceIdentifier,
        type: formatToken(device.deviceType),
        status: formatToken(device.status),
        latest: device.syncActivity
          ? `${device.syncActivity.latestDomain}:${device.syncActivity.latestEventType}`
          : "No sync event",
        history: device.deviceDetailHref,
        updated: formatDateTime(device.updatedAt),
      })),
      emptyState: {
        title: "No registered devices are visible",
        description:
          "Register a device from Admin Web or wait for a future client registration flow.",
      },
    },
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
        metric("Staff", "Unavailable", "No staff detail row is rendered", "muted"),
        metric("Credential hash", "Hidden", "Safe view excludes hashes", "good"),
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
      metric("Staff code", staff?.staffCode ?? "Not found", staff?.displayName ?? "No row"),
      metric("Status", staff ? formatToken(staff.status) : "Not found", "POS staff state"),
      metric("Credential hash", "Hidden", "Safe view excludes stored hashes", "good"),
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
            { field: "Credential status", value: formatToken(staff.credentialStatus) },
            { field: "Credential version", value: `v${staff.credentialVersion}` },
            { field: "Credential kind", value: staff.credentialKind ? formatToken(staff.credentialKind) : "Pending setup" },
            { field: "Must change credential", value: staff.mustChangeCredential ? "Yes" : "No" },
            { field: "Failed attempts", value: String(staff.failedAttempts) },
            { field: "Locked until", value: formatDateTime(staff.lockedUntil) },
            { field: "Last login", value: formatDateTime(staff.lastLoginAt) },
            { field: "Session invalidated", value: formatDateTime(staff.sessionInvalidatedAt) },
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
        metric("Device", "Unavailable", "No device detail row is rendered", "muted"),
        metric("Registry", status, "Server-side shop access"),
        metric("Secret fields", "Hidden", "No device tokens are rendered", "good"),
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
      ? "Server registry detail for a shop device. Client enforcement still depends on Android/iOS/POS consumption of the registry."
      : "No device row is visible for this shop-scoped detail request.",
    status: device ? "Server registry detail" : "Not found",
    metrics: [
      metric("Device", device?.displayName ?? "Not found", device?.deviceIdentifier ?? "No row"),
      metric("Status", device ? formatToken(device.status) : "Not found", "Server registry status"),
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
            { field: "Latest sync", value: device.syncActivity ? `${device.syncActivity.latestDomain}:${device.syncActivity.latestEventType}` : "No sync event" },
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
        metric("Audit event", "Unavailable", "No detail row is rendered", "muted"),
        metric("Metadata", "Redacted", "Raw sensitive metadata is not rendered", "good"),
        metric("Scope", "Server verified", "No cross-shop event lookup", "good"),
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
        { field: "Actor", value: shortId(event.actorProfileId) },
        { field: "Severity", value: formatToken(event.severity) },
        { field: "Result", value: formatToken(event.result) },
        { field: "Target", value: event.targetType ? `${event.targetType}:${event.targetId ?? "unknown"}` : "None" },
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
      "Server-side baseline permission matrix for web shop members and POS staff roles. Advanced granular role editing remains blocked until schema support exists.",
    status: "Baseline matrix",
    metrics: [
      metric("Web roles", String(Object.keys(SHOP_ADMIN_PERMISSION_MATRIX).length), "shop_members role_key"),
      metric("Staff roles", String(Object.keys(SHOP_STAFF_PERMISSION_MATRIX).length), "staff_accounts role_key"),
      metric("Role editing", "Blocked", "No granular roles schema", "warning"),
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

export function buildSettingsSection(readModel: ShopAdminReadModel): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    return fallbackSection("settings", readModel);
  }

  const shop = readModel.selectedShop;

  return {
    ...shopSections.settings,
    description:
      "Read-only shop profile and operational settings. Profile updates are blocked until an audited settings mutation boundary is available.",
    status: "Read-only",
    metrics: [
      metric("Shop", shop.shopCode, shop.shopName, "good"),
      metric("Status", formatToken(shop.shopStatus), "Current shop state"),
      metric("Writes", "Blocked", "Settings RPC boundary required", "warning"),
    ],
    liveData: {
      title: "Shop profile",
      description: "Verified shop profile fields visible through the server boundary.",
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [
        { rowKey: "name", field: "Shop name", value: shop.shopName },
        { rowKey: "code", field: "Shop code", value: shop.shopCode },
        { rowKey: "status", field: "Status", value: formatToken(shop.shopStatus) },
        { rowKey: "role", field: "Current role", value: formatToken(shop.role) },
        { rowKey: "updated", field: "Updated", value: formatDateTime(shop.updatedAt) },
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

  if (key === "products" || key === "categories" || key === "suppliers") {
    const inventoryReadModel = await getShopInventoryReadModel({
      requestedShopId,
    });

    if (key === "products") {
      return buildProductsSection(inventoryReadModel, options.catalogFilters);
    }

    if (key === "categories") {
      return buildCategoriesSection(inventoryReadModel, options.catalogFilters);
    }

    return buildSuppliersSection(inventoryReadModel, options.catalogFilters);
  }

  if (key === "importExport") {
    return buildImportExportSection();
  }

  if (key === "history") {
    const historyReadModel = await getShopHistoryReadModel({ requestedShopId });

    return buildHistorySection(historyReadModel);
  }

  if (key === "sync") {
    const historyReadModel = await getShopHistoryReadModel({ requestedShopId });

    return buildSyncSection(historyReadModel);
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
      const [
        inventoryReadModel,
        staffReadModel,
        deviceReadModel,
        historyReadModel,
        auditReadModel,
      ] = await Promise.all([
        getShopInventoryReadModel({ requestedShopId }),
        getShopStaffReadModel({ requestedShopId }),
        getShopDeviceReadModel({ requestedShopId }),
        getShopHistoryReadModel({ requestedShopId }),
        getShopAuditReadModel({ requestedShopId }),
      ]);

      return buildShopDashboardSection({
        auditReadModel,
        deviceReadModel,
        historyReadModel,
        inventoryReadModel,
        readModel,
        staffReadModel,
      });
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
  const inventoryReadModel = await getShopInventoryReadModel({ requestedShopId });

  if (kind === "product") {
    return buildProductDetailSection(inventoryReadModel, catalogId);
  }

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
