import "server-only";

import {
  platformSections,
  type PlatformSection,
  type PlatformSectionKey,
  type StatItem,
  type TableRow,
} from "@/components/platform/platformData";
import type {
  AuditLog,
  Profile,
  Shop,
  ShopMember,
} from "@/domain/platform-admin/types";
import {
  getPlatformAdminReadModel,
  type PlatformAdminLiveReadModel,
} from "./read-model";

const formatToken = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const stat = (
  label: string,
  value: string,
  detail: string,
  tone: StatItem["tone"] = "neutral",
): StatItem => ({
  label,
  value,
  detail,
  tone,
});

function profileNameById(profiles: readonly Profile[], profileId?: string) {
  if (!profileId) {
    return "System";
  }

  return (
    profiles.find((profile) => profile.profile_id === profileId)?.display_name ??
    "Platform User"
  );
}

function shopNameById(shops: readonly Shop[], shopId?: string | null) {
  if (!shopId) {
    return "Global";
  }

  return shops.find((shop) => shop.shop_id === shopId)?.shop_name ?? "Shop";
}

function ownerNameForShop(
  shop: Shop,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  const owner = members.find(
    (member) => member.shop_id === shop.shop_id && member.role_id === "shop_owner",
  );

  return owner ? profileNameById(profiles, owner.profile_id) : "Unmapped";
}

function fallbackSection(
  key: PlatformSectionKey,
  readModel: PlatformAdminLiveReadModel,
): PlatformSection {
  const base = platformSections[key];
  const titleByStatus: Record<PlatformAdminLiveReadModel["status"], string> = {
    not_configured: "Not configured",
    unauthorized: "Unauthorized",
    error: "Read blocked",
    ready: "Read-only",
  };
  const descriptionByStatus: Record<
    PlatformAdminLiveReadModel["status"],
    string
  > = {
    not_configured:
      "Supabase runtime values are not configured for this Admin Web environment.",
    unauthorized:
      "A valid Platform Admin server session is required before rows can be shown.",
    error:
      "The read-only Platform Admin model could not be loaded through the server boundary.",
    ready: "Platform Admin read-only model is available through Supabase RLS.",
  };

  return {
    ...base,
    description: descriptionByStatus[readModel.status],
    status: titleByStatus[readModel.status],
    stats: [
      stat("Supabase", titleByStatus[readModel.status], "Server-only boundary"),
      stat("Rows shown", "0", "No fallback mock rows are rendered", "muted"),
      stat("Actions", "Off", "Read-only contract", "warning"),
    ],
    rows: [],
    emptyState: {
      title: titleByStatus[readModel.status],
      description: descriptionByStatus[readModel.status],
    },
  };
}

function buildOverview(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.overview;
  const nonLiveMappings = readModel.shopOwnerMappings.filter(
    (mapping) => mapping.mappingState !== "mapped",
  ).length;

  return {
    ...base,
    description:
      "Read-only platform summary loaded server-side through Supabase RLS for the active Platform Admin session.",
    status: "Read-only",
    stats: [
      stat("Shops", String(readModel.shops.length), "Visible through RLS"),
      stat(
        "Profiles",
        String(readModel.profiles.length),
        "Visible through Platform Admin",
        "good",
      ),
      stat("Audit events", String(readModel.auditLogs.length), "Latest rows"),
      stat(
        "Mappings",
        String(nonLiveMappings),
        "Unmapped, mobile-only, or ambiguous",
        nonLiveMappings > 0 ? "warning" : "good",
      ),
    ],
    rows: [
      {
        area: "Users / Profiles",
        signal: `${readModel.profiles.length} visible profiles`,
        state: "Read-only",
        next: "Review platform_admin bootstrap",
      },
      {
        area: "Shops",
        signal: `${readModel.shops.length} visible shops`,
        state: "Read-only",
        next: "Keep owner mapping 1:1",
      },
      {
        area: "Audit",
        signal: `${readModel.auditLogs.length} visible audit events`,
        state: readModel.auditLogs.length > 0 ? "Read-only" : "Empty",
        next: "Require audit before mutations",
      },
    ],
    emptyState: {
      title: "No rows visible",
      description:
        "The server boundary is configured, but RLS returned no Platform Admin rows for this session.",
    },
  };
}

function buildUsers(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.users;
  const platformAdmins = new Set(readModel.platformAdminProfileIds);

  return {
    ...base,
    description:
      "Read-only profile directory for the active Platform Admin session.",
    status: "Read-only",
    stats: [
      stat("Profiles", String(readModel.profiles.length), "Visible through RLS"),
      stat("Platform admins", String(platformAdmins.size), "Active grants", "good"),
      stat(
        "Shop memberships",
        String(readModel.shopMembers.length),
        "Visible assignments",
      ),
    ],
    rows: readModel.profiles.map((profile): TableRow => {
      const membership = readModel.shopMembers.find(
        (member) => member.profile_id === profile.profile_id,
      );

      return {
        profile: profile.display_name,
        role: platformAdmins.has(profile.profile_id)
          ? "platform_admin"
          : (membership?.role_id ?? "viewer"),
        scope: membership
          ? shopNameById(readModel.shops, membership.shop_id)
          : "Global",
        state: formatToken(profile.profile_status),
      };
    }),
    emptyState: {
      title: "No profiles visible",
      description:
        "RLS returned no profiles for the current Platform Admin session.",
    },
  };
}

function buildShops(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.shops;
  const pending = readModel.shops.filter(
    (shop) => shop.shop_status === "pending_setup",
  ).length;
  const archived = readModel.shops.filter(
    (shop) => shop.shop_status === "archived",
  ).length;

  return {
    ...base,
    description:
      "Read-only shop registry using shops as the root business model.",
    status: "Read-only",
    stats: [
      stat("Shops", String(readModel.shops.length), "Visible roots"),
      stat("Pending setup", String(pending), "Non-operational", "warning"),
      stat("Archived", String(archived), "Historical records", "muted"),
    ],
    rows: readModel.shops.map((shop): TableRow => ({
      shop: shop.shop_name,
      code: shop.shop_code,
      owner: ownerNameForShop(shop, readModel.profiles, readModel.shopMembers),
      state: formatToken(shop.shop_status),
    })),
    emptyState: {
      title: "No shops visible",
      description: "RLS returned no shops for the current Platform Admin session.",
    },
  };
}

function buildAudit(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.audit;

  return {
    ...base,
    description:
      "Read-only audit visibility through RLS. Mutating operations remain disabled.",
    status: readModel.auditLogs.length > 0 ? "Read-only" : "Audit empty",
    stats: [
      stat("Audit events", String(readModel.auditLogs.length), "Latest rows"),
      stat("Sensitive actions", "0", "No mutations wired", "good"),
      stat("Append-only", "On", "Update/delete blocked by trigger"),
    ],
    rows: readModel.auditLogs.map((log: AuditLog): TableRow => ({
      event: log.event,
      actor: profileNameById(readModel.profiles, log.actor_profile_id),
      scope:
        log.scope === "shop" ? shopNameById(readModel.shops, log.shop_id) : "Global",
      result: formatToken(log.result),
    })),
    emptyState: {
      title: "Audit not configured",
      description:
        "No audit rows are visible yet. Read-only pages may stay empty, but mutations remain blocked until audit writes exist.",
    },
  };
}

function buildSystem(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.system;

  return {
    ...base,
    description:
      "Server-side status derived from the active Supabase read-only boundary.",
    status: "Read-only",
    stats: [
      stat("Auth SSR", "On", "Server session verified", "good"),
      stat("RLS", "On", "Queries scoped by policies", "good"),
      stat("Actions", "Off", "No CRUD in Admin Web", "warning"),
    ],
    rows: [
      {
        service: "Supabase schema",
        state: "Applied",
        source: "TASK-005G",
        note: "profiles, shops, memberships, platform admins, mappings, audit",
      },
      {
        service: "Auth boundary",
        state: "Server-only",
        source: "TASK-005G",
        note: "No service-role key in client or browser code",
      },
      {
        service: "Read model",
        state: "Read-only",
        source: "TASK-005G",
        note: readModel.reason,
      },
    ],
  };
}

function buildOperations(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.operations;

  return {
    ...base,
    description:
      "Audited controlled actions are handled by the dedicated operations page.",
    status: "Controlled actions",
    stats: [
      stat("Available actions", "4", "Server-side RPC boundary", "warning"),
      stat("Read model", readModel.status === "ready" ? "On" : "Off", readModel.reason),
      stat("Audit gate", "On", "Mandatory for every action", "warning"),
    ],
    rows: base.rows,
  };
}

export async function getPlatformSectionForRequest(
  key: PlatformSectionKey,
): Promise<PlatformSection> {
  const readModel = await getPlatformAdminReadModel();

  if (readModel.status !== "ready") {
    return fallbackSection(key, readModel);
  }

  switch (key) {
    case "overview":
      return buildOverview(readModel);
    case "users":
      return buildUsers(readModel);
    case "shops":
      return buildShops(readModel);
    case "audit":
      return buildAudit(readModel);
    case "system":
      return buildSystem(readModel);
    case "operations":
      return buildOperations(readModel);
  }
}
