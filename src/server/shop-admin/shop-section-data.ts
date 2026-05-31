import "server-only";

import {
  shopSections,
  type ShopSection,
  type ShopSectionKey,
  type ShopSectionMetric,
  type ShopSectionTableRow,
} from "@/components/shop/shopSections";
import {
  getShopAdminReadModel,
  type ShopAdminReadModel,
  type ShopAdminReadModelAuditLog,
  type ShopAdminReadModelMember,
} from "./read-model";
import {
  getShopStaffReadModel,
  type ShopStaffReadModel,
  type ShopStaffReadModelStaffAccount,
} from "./staff-read-model";

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

function auditRow(log: ShopAdminReadModelAuditLog): ShopSectionTableRow {
  return {
    rowKey: log.auditLogId,
    event: log.eventKey,
    actor: shortId(log.actorProfileId),
    severity: formatToken(log.severity),
    result: formatToken(log.result),
    target: log.targetType ? `${log.targetType}:${log.targetId ?? "unknown"}` : "None",
    created: formatDateTime(log.createdAt),
  };
}

export function buildAuditSection(readModel: ShopAdminReadModel): ShopSection {
  if (readModel.status !== "ready" || !readModel.selectedShop) {
    return fallbackSection("audit", readModel);
  }

  const warnings = readModel.auditLogs.filter(
    (log) => log.severity === "warning" || log.severity === "critical",
  ).length;
  const blocked = readModel.auditLogs.filter(
    (log) => log.result === "blocked" || log.result === "failure",
  ).length;

  return {
    ...shopSections.audit,
    description:
      "Latest shop-scoped audit rows for the verified selected shop, read through Supabase RLS.",
    status: readModel.auditLogs.length > 0 ? "Read-only" : "Audit empty",
    metrics: [
      metric("Audit events", String(readModel.auditLogs.length), "Latest rows"),
      metric("Warnings", String(warnings), "Warning or critical severity"),
      metric("Blocked", String(blocked), "Blocked or failed results", "warning"),
    ],
    liveData: {
      title: "Live shop data",
      description:
        "Live rows for the selected shop. Changes are not available on this page.",
      columns: [
        { key: "event", label: "Event" },
        { key: "actor", label: "Actor" },
        { key: "severity", label: "Severity" },
        { key: "result", label: "Result" },
        { key: "target", label: "Target" },
        { key: "created", label: "Created" },
      ],
      rows: readModel.auditLogs.map(auditRow),
      emptyState: {
        title: "No live shop rows are visible",
        description:
          "No audit rows are visible for the selected shop. This is a valid empty read state.",
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
        ? `${formatToken(staff.credentialKind)} updated ${formatDateTime(
            staff.credentialUpdatedAt,
          )}`
        : "Pending setup",
    lockout: staff.lockedUntil
      ? `Locked until ${formatDateTime(staff.lockedUntil)}`
      : "Not locked",
    updated: formatDateTime(staff.updatedAt),
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
        metric("Writes", "Off", "No staff mutations in TASK-014", "warning"),
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
      "Read-only POS staff list for the verified selected shop. Credential hashes and plaintext credentials are never returned to the UI.",
    status:
      readModel.staffAccounts.length > 0 ? "Read-only" : "Staff empty",
    metrics: [
      metric("Staff", String(readModel.staffAccounts.length), "Safe rows"),
      metric("Active", String(active), "Credential-ready accounts", "good"),
      metric("Pending", String(pending), "Awaiting credential setup"),
      metric("Locked", String(locked), "Temporary lockouts", "warning"),
    ],
    liveData: {
      title: "Staff credential-safe read model",
      description:
        "The safe staff view is read-only and excludes stored credential hashes.",
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

export async function getShopSectionForRequest(
  key: ShopSectionKey,
  requestedShopId?: string | null,
): Promise<ShopSection> {
  if (
    key !== "overview" &&
    key !== "members" &&
    key !== "audit" &&
    key !== "staff"
  ) {
    return shopSections[key];
  }

  if (key === "staff") {
    const staffReadModel = await getShopStaffReadModel({ requestedShopId });

    return buildStaffSection(staffReadModel);
  }

  const readModel = await getShopAdminReadModel({ requestedShopId });

  switch (key) {
    case "overview":
      return buildOverviewSection(readModel);
    case "members":
      return buildMembersSection(readModel);
    case "audit":
      return buildAuditSection(readModel);
    default:
      return shopSections[key];
  }
}
