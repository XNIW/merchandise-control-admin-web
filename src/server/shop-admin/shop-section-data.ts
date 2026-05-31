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

export async function getShopSectionForRequest(
  key: ShopSectionKey,
  requestedShopId?: string | null,
): Promise<ShopSection> {
  if (key !== "overview" && key !== "members" && key !== "audit") {
    return shopSections[key];
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
