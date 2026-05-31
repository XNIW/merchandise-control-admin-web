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
  PlatformDeviceOverview,
  PlatformSyncOverview,
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

const shortId = (value?: string) => (value ? value.slice(0, 8) : "none");

const stat = (
  label: string,
  value: string,
  detail: string,
  tone: StatItem["tone"] = "neutral",
): StatItem => ({
  detail,
  label,
  tone,
  value,
});

function profileNameById(profiles: readonly Profile[], profileId?: string) {
  if (!profileId) {
    return "System";
  }

  return (
    profiles.find((profile) => profile.profile_id === profileId)?.display_name ??
    `Profile ${shortId(profileId)}`
  );
}

function shopNameById(shops: readonly Shop[], shopId?: string | null) {
  if (!shopId) {
    return "Global";
  }

  return shops.find((shop) => shop.shop_id === shopId)?.shop_name ?? "Shop";
}

function activeOwnerForShop(
  shop: Shop,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  const owner = members.find(
    (member) =>
      member.shop_id === shop.shop_id &&
      member.role_id === "shop_owner" &&
      member.membership_status === "active",
  );

  return owner ? profileNameById(profiles, owner.profile_id) : "Unassigned";
}

function membershipsForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  return members
    .filter((member) => member.profile_id === profileId)
    .map(
      (member) =>
        `${shopNameById(shops, member.shop_id)} (${formatToken(member.role_id)})`,
    );
}

function latestAuditForShop(logs: readonly AuditLog[], shopId: string) {
  return logs.find((log) => log.shop_id === shopId);
}

function latestSyncForShop(
  syncEvents: readonly PlatformSyncOverview[],
  mappings: PlatformAdminLiveReadModel["shopOwnerMappings"],
  shopId: string,
) {
  const ownerIds = new Set(
    mappings
      .filter((mapping) => mapping.shopId === shopId && mapping.ownerUserId)
      .map((mapping) => mapping.ownerUserId as string),
  );

  return syncEvents.find((event) => ownerIds.has(event.owner_user_id));
}

function fallbackSection(
  key: PlatformSectionKey,
  readModel: PlatformAdminLiveReadModel,
): PlatformSection {
  const base = platformSections[key];
  const titleByStatus: Record<PlatformAdminLiveReadModel["status"], string> = {
    error: "Read blocked",
    not_configured: "not_configured",
    ready: "Read-only",
    unauthorized: "Unauthorized",
  };

  return {
    ...base,
    description: readModel.reason,
    emptyState: {
      description: readModel.reason,
      title: titleByStatus[readModel.status],
    },
    guardrails: [
      "The Platform Admin layout performs the server-side role check before this section renders.",
      "No mock rows are rendered when Supabase or the active session is unavailable.",
      "Safe operations remain unavailable without the server authorization boundary.",
    ],
    rows: [],
    stats: [
      stat("Read model", titleByStatus[readModel.status], "Server boundary"),
      stat("Rows shown", "0", "No fallback data", "muted"),
      stat("Operations", "Blocked", "Authorization required", "warning"),
    ],
    status: titleByStatus[readModel.status],
  };
}

function buildOverview(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.overview;
  const activeShops = readModel.shops.filter(
    (shop) => shop.shop_status === "active",
  ).length;
  const suspendedShops = readModel.shops.filter(
    (shop) => shop.shop_status === "suspended",
  ).length;
  const archivedShops = readModel.shops.filter(
    (shop) => shop.shop_status === "archived",
  ).length;
  const revokedOrSuspiciousDevices = readModel.shopDevices.filter(
    (device) => device.status === "revoked" || device.status === "suspicious",
  ).length;

  return {
    ...base,
    description:
      "Global Platform Admin overview loaded server-side through Supabase RLS.",
    guardrails: [
      "Platform Admin governs ecosystem-level users, shops, audit, devices, sync, and diagnostics.",
      "Shop catalog, spreadsheet import/export, ordinary staff, and per-shop daily device management stay in Shop Admin.",
      "Warning rows are derived from visible server read models; no synthetic business data is used.",
    ],
    rows: [
      {
        area: "Shops",
        next: `${readModel.dataHealth.shops_without_owner} shops without owner`,
        signal: `${activeShops} active / ${suspendedShops} suspended / ${archivedShops} archived`,
        state: "Global registry",
      },
      {
        area: "Users",
        next: `${readModel.platformAdminProfileIds.length} platform admins`,
        signal: `${readModel.profiles.length} visible profiles`,
        state: "Server-side directory",
      },
      {
        area: "Audit",
        next: readModel.auditLogs[0]?.event ?? "No recent events",
        signal: `${readModel.auditLogs.length} latest events`,
        state: readModel.dataHealth.audit_coverage,
      },
      {
        area: "Data health",
        next: `${readModel.dataHealth.orphaned_memberships} orphaned memberships`,
        signal: `${readModel.dataHealth.profiles_without_membership} profiles without membership`,
        state: readModel.dataHealth.migration_drift_status,
      },
      {
        area: "Devices",
        next: `${revokedOrSuspiciousDevices} revoked or suspicious`,
        signal: `${readModel.shopDevices.length} visible devices`,
        state: readModel.dataHealth.device_schema_status,
      },
      {
        area: "Sync",
        next: `${readModel.dataHealth.suspended_shops_with_recent_activity} suspended shops with recent activity`,
        signal: `${readModel.syncEvents.length} latest sync/history events`,
        state: readModel.dataHealth.sync_history_mapping_status,
      },
    ],
    stats: [
      stat("Total shops", String(readModel.shops.length), "Visible through RLS"),
      stat("Active shops", String(activeShops), "Operational shops", "good"),
      stat("Suspended", String(suspendedShops), "Requires review", "warning"),
      stat("Archived", String(archivedShops), "Historical shops", "muted"),
      stat(
        "Profiles",
        String(readModel.profiles.length),
        "Visible through Platform Admin",
      ),
      stat(
        "Shop owners",
        String(
          readModel.shopMembers.filter(
            (member) =>
              member.role_id === "shop_owner" &&
              member.membership_status === "active",
          ).length,
        ),
        "Active owner memberships",
        "good",
      ),
      stat(
        "Shops without owner",
        String(readModel.dataHealth.shops_without_owner),
        "Needs provisioning review",
        readModel.dataHealth.shops_without_owner > 0 ? "warning" : "good",
      ),
      stat(
        "Device warnings",
        String(revokedOrSuspiciousDevices),
        "Revoked or suspicious",
        revokedOrSuspiciousDevices > 0 ? "warning" : "good",
      ),
    ],
    status: "Read-only",
  };
}

function buildUsers(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.users;
  const platformAdmins = new Set(readModel.platformAdminProfileIds);

  return {
    ...base,
    guardrails: [
      "Search and filters are server-side concerns; this view renders the current server-limited read model.",
      "No auth secrets are part of the profile DTO.",
      "Profile lifecycle actions are not exposed; Platform Admin grant changes use the dedicated audited admin RPCs.",
    ],
    rows: readModel.profiles.map((profile): TableRow => {
      const memberships = membershipsForProfile(
        profile.profile_id,
        readModel.shops,
        readModel.shopMembers,
      );

      return {
        memberships: memberships.length > 0 ? memberships.slice(0, 3).join(", ") : "None",
        platformRole: platformAdmins.has(profile.profile_id)
          ? "platform_admin"
          : "none",
        profile: profile.display_name,
        rowKey: profile.profile_id,
        state: formatToken(profile.profile_status),
      };
    }),
    stats: [
      stat("Profiles", String(readModel.profiles.length), "Visible users"),
      stat("Platform admins", String(platformAdmins.size), "Active grants", "good"),
      stat(
        "Without membership",
        String(readModel.dataHealth.profiles_without_membership),
        "Support diagnostics signal",
        readModel.dataHealth.profiles_without_membership > 0 ? "warning" : "good",
      ),
    ],
    status: "Read-only",
  };
}

function buildShops(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.shops;

  return {
    ...base,
    guardrails: [
      "This is the global shop registry, not product or staff operations for a single shop.",
      "Lifecycle controls stay on the Safe Operations Center with reason and audit.",
      "Archived shops can be restored only through the audited restore RPC with shop code confirmation.",
    ],
    rows: readModel.shops.map((shop): TableRow => {
      const devices = readModel.shopDevices.filter(
        (device) => device.shop_id === shop.shop_id,
      );
      const latestSync = latestSyncForShop(
        readModel.syncEvents,
        readModel.shopOwnerMappings,
        shop.shop_id,
      );
      const audit = latestAuditForShop(readModel.auditLogs, shop.shop_id);

      return {
        code: shop.shop_code,
        health: `${devices.length} devices / sync ${latestSync ? formatToken(latestSync.event_type) : "none"} / audit ${audit ? formatToken(audit.result) : "none"}`,
        owner: activeOwnerForShop(shop, readModel.profiles, readModel.shopMembers),
        rowKey: shop.shop_id,
        shop: shop.shop_name,
        state: formatToken(shop.shop_status),
      };
    }),
    stats: [
      stat("Shops", String(readModel.shops.length), "Global roots"),
      stat(
        "Without owner",
        String(readModel.dataHealth.shops_without_owner),
        "Needs safe owner assignment",
        readModel.dataHealth.shops_without_owner > 0 ? "warning" : "good",
      ),
      stat(
        "Suspended activity",
        String(readModel.dataHealth.suspended_shops_with_recent_activity),
        "Recent sync on suspended shop",
        readModel.dataHealth.suspended_shops_with_recent_activity > 0
          ? "warning"
          : "good",
      ),
    ],
    status: "Read-only",
  };
}

function buildProvisioning(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.provisioning;
  const activeProfiles = readModel.profiles.filter(
    (profile) => profile.profile_status === "active",
  );

  return {
    ...base,
    guardrails: [
      "Shop creation uses the existing audited create-shop RPC.",
      "Owner assignment supports existing active profiles and pending owner invites.",
      "Pending owner invites store redacted contact state only; email delivery is PASS_WITH_NOTES_EMAIL_DELIVERY.",
      "POS bootstrap admin is not generated by Platform Admin in this task.",
    ],
    rows: [
      {
        area: "Create shop",
        next: "Use /platform/shops/new or /platform/operations",
        signal: "Audited RPC available",
        state: "Available",
      },
      {
        area: "Initial owner",
        next: `${activeProfiles.length} active profiles selectable`,
        signal: "Existing profile",
        state: "Available",
      },
      {
        area: "Pending owner invite",
        next: "Use /platform/provisioning or /platform/shops/new",
        signal: "Redacted contact state",
        state: "Available",
      },
    ],
    stats: [
      stat("Active profiles", String(activeProfiles.length), "Owner candidates"),
      stat("Shop code", "Validated", "Server normalization", "good"),
      stat("Invite delivery", "Pending", "PASS_WITH_NOTES_EMAIL_DELIVERY", "warning"),
    ],
    status: "Safe provisioning",
  };
}

function buildAdmins(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.admins;

  return {
    ...base,
    guardrails: [
      "Platform admin grant/revoke uses audited RPCs with anti self-lockout.",
      "Existing grants are visible through RLS for review.",
      "Strong confirmation and reason are required for global security operations.",
    ],
    rows: readModel.platformAdmins.map((admin): TableRow => ({
      granted: admin.granted_at,
      profile: profileNameById(readModel.profiles, admin.profile_id),
      review: admin.last_reviewed_at ?? "Grant state visible",
      rowKey: admin.platform_admin_id,
      status: formatToken(admin.status),
    })),
    stats: [
      stat("Admin grants", String(readModel.platformAdmins.length), "Visible grants"),
      stat(
        "Active admins",
        String(readModel.platformAdminProfileIds.length),
        "Current access",
        "good",
      ),
      stat("Grant/revoke", "Available", "Anti self-lockout RPCs", "good"),
    ],
    status: "Live actions",
  };
}

function buildAudit(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.audit;

  return {
    ...base,
    guardrails: [
      "Filters are supported by actor, shop, area, action, target, severity, and date at the server read-model boundary.",
      "metadata_redacted is summarized only; raw metadata is not rendered.",
      "Audit logs are distinct from sync/history events.",
    ],
    rows: readModel.auditLogs.map((log): TableRow => ({
      actor: profileNameById(readModel.profiles, log.actor_profile_id),
      date: log.created_at,
      event: log.event,
      rowKey: log.audit_log_id,
      scope:
        log.scope === "shop"
          ? shopNameById(readModel.shops, log.shop_id)
          : "Global",
      severity: formatToken(log.severity),
      target: `${log.target_type ?? "none"}:${shortId(log.target_id)}`,
    })),
    stats: [
      stat("Audit events", String(readModel.auditLogs.length), "Latest rows"),
      stat("Severity filters", "Ready", "actor shop area action target severity date"),
      stat(
        "Metadata",
        "Redacted",
        "metadata_redacted summaries only",
        "good",
      ),
    ],
    status: "Read-only",
  };
}

function buildSystem(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.system;

  return {
    ...base,
    guardrails: [
      "Runtime configuration is reported only as configured/not_configured.",
      "Supabase health is inferred from successful server read-model loading.",
      "Migration drift is NOT_RUN unless verified by the Supabase CLI gate.",
      "Route protection is server-side through the Platform layout.",
    ],
    rows: [
      {
        area: "Redacted runtime configuration",
        next: "Configured values are never printed",
        signal: readModel.status === "ready" ? "configured" : "not_configured",
        state: readModel.status === "ready" ? "PASS" : "not_configured",
      },
      {
        area: "Supabase connection health",
        next: readModel.reason,
        signal: `${readModel.profiles.length + readModel.shops.length} primary rows`,
        state: "PASS",
      },
      {
        area: "RLS/grants summary",
        next: "Selects pass through authenticated RLS only",
        signal: "Profiles, shops, audit, devices, sync",
        state: "PASS_WITH_NOTES",
      },
      {
        area: "Auth SSR health",
        next: "Layout blocks non Platform Admin sessions",
        signal: "resolveCurrentAdminRouteAccess",
        state: "PASS",
      },
      {
        area: "Migration drift",
        next: "Verified only by linked Supabase CLI checks",
        signal: "migration drift",
        state: readModel.dataHealth.migration_drift_status,
      },
    ],
    stats: [
      stat("Auth SSR", "PASS", "Server session boundary", "good"),
      stat("Route protection", "PASS", "Server layout gate", "good"),
      stat("Migration drift", "NOT_RUN", "CLI evidence required", "warning"),
    ],
    status: "System health",
  };
}

function buildData(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.data;
  const health = readModel.dataHealth;

  return {
    ...base,
    guardrails: [
      "Data health is computed from server aggregate inputs only.",
      "Migration drift is NOT_RUN in the UI unless the Supabase CLI gate has been executed.",
      "Blocked and not_configured states are distinct from empty data.",
    ],
    rows: [
      {
        area: "shops without owner",
        next: "Assign owner through safe operations",
        signal: String(health.shops_without_owner),
        state: health.shops_without_owner > 0 ? "PASS_WITH_NOTES" : "PASS",
      },
      {
        area: "profiles without membership",
        next: "Review support diagnostics",
        signal: String(health.profiles_without_membership),
        state: health.profiles_without_membership > 0 ? "PASS_WITH_NOTES" : "PASS",
      },
      {
        area: "orphaned memberships",
        next: "Investigate referential integrity",
        signal: String(health.orphaned_memberships),
        state: health.orphaned_memberships > 0 ? "BLOCKED" : "PASS",
      },
      {
        area: "audit coverage",
        next: "Sensitive operations must write audit",
        signal: String(readModel.auditLogs.length),
        state: health.audit_coverage,
      },
      {
        area: "migration drift",
        next: "Run linked Supabase CLI check",
        signal: "CLI-only",
        state: health.migration_drift_status,
      },
      {
        area: "inventory mapping status",
        next: "Shop-root mapping summary",
        signal: String(readModel.shopOwnerMappings.length),
        state: health.inventory_mapping_status,
      },
      {
        area: "sync/history mapping status",
        next: "Global sync overview",
        signal: String(readModel.syncEvents.length),
        state: health.sync_history_mapping_status,
      },
      {
        area: "device schema status",
        next: "Global device overview",
        signal: String(readModel.shopDevices.length),
        state: health.device_schema_status,
      },
      {
        area: "staff schema status",
        next: "Safe staff view only",
        signal: String(readModel.staffSafeRows.length),
        state: health.staff_schema_status,
      },
    ],
    stats: [
      stat(
        "Shops without owner",
        String(health.shops_without_owner),
        "Owner coverage",
        health.shops_without_owner > 0 ? "warning" : "good",
      ),
      stat(
        "Orphaned memberships",
        String(health.orphaned_memberships),
        "Membership integrity",
        health.orphaned_memberships > 0 ? "warning" : "good",
      ),
      stat("Migration drift", health.migration_drift_status, "CLI-only", "warning"),
    ],
    status: "Data health",
  };
}

function deviceRow(
  device: PlatformDeviceOverview,
  readModel: PlatformAdminLiveReadModel,
): TableRow {
  return {
    device: device.display_name,
    lastSeen: device.last_seen_at ?? "Never",
    rowKey: device.shop_device_id,
    shop: shopNameById(readModel.shops, device.shop_id),
    state: formatToken(device.status),
    type: `${formatToken(device.device_type)} ${device.app_version ?? ""}`.trim(),
  };
}

function buildDevices(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.devices;
  const revoked = readModel.shopDevices.filter(
    (device) => device.status === "revoked",
  ).length;
  const suspicious = readModel.shopDevices.filter(
    (device) => device.status === "suspicious",
  ).length;

  return {
    ...base,
    guardrails: [
      "Device authorization comes from shop_devices, not from sync activity.",
      "source_device_id is treated as sync/history attribution only.",
      "Emergency device action requires server RPC, reason, confirmation, and audit.",
    ],
    rows:
      readModel.shopDevices.length > 0
        ? readModel.shopDevices.map((device) => deviceRow(device, readModel))
        : readModel.syncEvents.slice(0, 12).map((event): TableRow => ({
            device: event.source_device_id ?? "unreported source_device_id",
            lastSeen: event.created_at,
            rowKey: event.sync_event_id,
            shop: event.store_id ?? "Mapped by owner",
            state: "Sync activity only",
            type: `${event.source ?? "unknown"} ${event.domain}`,
          })),
    stats: [
      stat("Devices", String(readModel.shopDevices.length), "shop_devices rows"),
      stat("Revoked", String(revoked), "Authorization disabled", revoked > 0 ? "warning" : "good"),
      stat(
        "Suspicious",
        String(suspicious),
        "Requires support review",
        suspicious > 0 ? "warning" : "good",
      ),
    ],
    status: "Global device overview",
  };
}

function syncRow(
  event: PlatformSyncOverview,
  readModel: PlatformAdminLiveReadModel,
): TableRow {
  const shopId = readModel.shopOwnerMappings.find(
    (mapping) => mapping.ownerUserId === event.owner_user_id,
  )?.shopId;

  return {
    date: event.created_at,
    domain: event.domain,
    event: `${formatToken(event.event_type)} (${event.changed_count})`,
    rowKey: event.sync_event_id,
    shop: shopNameById(readModel.shops, shopId),
    source: `${event.source ?? "unknown"} / ${event.source_device_id ?? "no source_device_id"}`,
  };
}

function buildSyncLike(
  key: "sync" | "history",
  readModel: PlatformAdminLiveReadModel,
): PlatformSection {
  const base = platformSections[key];
  const domains = new Set(readModel.syncEvents.map((event) => event.domain));

  return {
    ...base,
    guardrails: [
      "Sync/history rows are operational replication activity and are distinct from audit_logs.",
      "Raw JSON is summarized and limited by the server read model.",
      "Filters are server-side by source, date, type, state, shop, and domain.",
    ],
    rows: readModel.syncEvents.map((event) => syncRow(event, readModel)),
    stats: [
      stat("Events", String(readModel.syncEvents.length), "Latest sync/history"),
      stat("Domains", String(domains.size), "Visible domains"),
      stat(
        "Suspended activity",
        String(readModel.dataHealth.suspended_shops_with_recent_activity),
        "Suspended shops with recent sync",
        readModel.dataHealth.suspended_shops_with_recent_activity > 0
          ? "warning"
          : "good",
      ),
    ],
    status: key === "sync" ? "Global sync" : "Global history",
  };
}

function buildOperations(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.operations;

  return {
    ...base,
    guardrails: [
      "Every sensitive action requires server authorization, reason, confirmation, and audit.",
      "Double submit protection is handled by post-action redirects and idempotent RPC state checks.",
      "Admin grant/revoke uses reviewed anti self-lockout RPCs with explicit confirmation.",
    ],
    operations: [
      {
        description: "Create shop and assign existing active owner.",
        label: "Create shop",
      },
      {
        description: "Suspend, reactivate, or archive a shop through audited RPCs.",
        label: "Shop lifecycle",
      },
      {
        description: "Emergency device action uses platform_emergency_revoke_device.",
        label: "Emergency device action",
      },
      {
        description: "Run read-only diagnostics before choosing an action.",
        label: "Data diagnostics",
      },
    ],
    rows: [
      {
        availability: "Available",
        operation: "Create shop",
        requirement: "Existing active owner and reason",
        state: "Audited",
      },
      {
        availability: "Available",
        operation: "Assign owner",
        requirement: "Bundled with create shop",
        state: "Audited",
      },
      {
        availability: "Available",
        operation: "Suspend/reactivate/soft delete shop",
        requirement: "Shop code confirmation and reason",
        state: "Audited",
      },
      {
        availability: readModel.shopDevices.length > 0 ? "Available" : "No device rows",
        operation: "Emergency device action",
        requirement: "Device id, shop code confirmation, and reason",
        state: "Audited RPC",
      },
      {
        availability: "Available",
        operation: "Grant/revoke platform admin",
        requirement: "Reason, confirmation, anti self-lockout and last-admin guard",
        state: "Audited RPC",
      },
    ],
    stats: [
      stat("Shop actions", "4", "Existing audited RPCs", "good"),
      stat("Device emergency", "1", "TASK-016 audited RPC", "warning"),
      stat("Admin grants", "2", "Grant and revoke RPCs", "good"),
    ],
    status: "Safe Operations Center",
  };
}

function buildSupport(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.support;
  const profileRows = readModel.profiles.slice(0, 60).map((profile): TableRow => {
    const memberships = membershipsForProfile(
      profile.profile_id,
      readModel.shops,
      readModel.shopMembers,
    );
    const recentAudit = readModel.auditLogs.find(
      (log) => log.actor_profile_id === profile.profile_id,
    );

    return {
      area: profile.display_name,
      next: recentAudit?.event ?? "No recent audit",
      rowKey: profile.profile_id,
      signal:
        memberships.length > 0
          ? memberships.slice(0, 2).join(", ")
          : "No memberships",
      state: formatToken(profile.profile_status),
    };
  });

  const shopRows = readModel.shops.slice(0, 40).map((shop): TableRow => {
    const devices = readModel.shopDevices.filter(
      (device) => device.shop_id === shop.shop_id,
    );
    const sync = latestSyncForShop(
      readModel.syncEvents,
      readModel.shopOwnerMappings,
      shop.shop_id,
    );

    return {
      area: shop.shop_name,
      next: sync ? `${formatToken(sync.event_type)} ${sync.created_at}` : "No sync",
      rowKey: shop.shop_id,
      signal: `${activeOwnerForShop(shop, readModel.profiles, readModel.shopMembers)} / ${devices.length} devices`,
      state: formatToken(shop.shop_status),
    };
  });

  return {
    ...base,
    guardrails: [
      "Support diagnostics is read-only and does not impersonate users.",
      "Suggested actions link back to safe operations; diagnostics do not mutate data.",
      "Access status, memberships, audit, devices, sync, and configuration warnings are redacted summaries.",
    ],
    rows: [...profileRows, ...shopRows],
    stats: [
      stat("Profiles checked", String(profileRows.length), "Support sample"),
      stat("Shops checked", String(shopRows.length), "Support sample"),
      stat("Impersonation", "Out of scope", "Separate task required", "warning"),
    ],
    status: "Read-only diagnostics",
  };
}

function buildAuditDetail(
  readModel: PlatformAdminLiveReadModel,
  eventId: string,
): PlatformSection {
  const base = platformSections.audit;
  const event = readModel.auditLogs.find((log) => log.audit_log_id === eventId);

  return {
    ...base,
    description: "Single global audit event with redacted metadata summary.",
    emptyState: {
      description:
        "The requested event is not visible through the current Platform Admin RLS boundary.",
      title: "Audit event not visible",
    },
    guardrails: [
      "metadata_redacted is summarized only.",
      "Audit detail links back to profile and shop summaries when visible.",
      "No raw payload is rendered.",
    ],
    rows: event
      ? [
          {
            actor: profileNameById(readModel.profiles, event.actor_profile_id),
            date: event.created_at,
            event: event.event,
            rowKey: event.audit_log_id,
            scope:
              event.scope === "shop"
                ? shopNameById(readModel.shops, event.shop_id)
                : "Global",
            severity: formatToken(event.severity),
            target: `${event.target_type ?? "none"}:${shortId(event.target_id)}`,
          },
          {
            actor: "Metadata",
            date: event.created_at,
            event: event.metadata_summary ?? "metadata_redacted: empty",
            rowKey: `${event.audit_log_id}-metadata`,
            scope: "Redacted",
            severity: formatToken(event.result),
            target: "Safe summary",
          },
        ]
      : [],
    stats: [
      stat("Event", event ? "Visible" : "Missing", "RLS detail lookup"),
      stat("Metadata", "Redacted", "Summary only", "good"),
      stat("Result", event ? formatToken(event.result) : "Unknown", "Audit outcome"),
    ],
    status: "Audit detail",
    title: "Audit Detail",
  };
}

function buildUserDetail(
  readModel: PlatformAdminLiveReadModel,
  profileId: string,
): PlatformSection {
  const base = platformSections.users;
  const profile = readModel.profiles.find((item) => item.profile_id === profileId);
  const memberships = profile
    ? readModel.shopMembers.filter((member) => member.profile_id === profile.profile_id)
    : [];
  const audits = readModel.auditLogs.filter(
    (log) => log.actor_profile_id === profileId,
  );

  return {
    ...base,
    description: "Profile detail with memberships, role state, and linked audit.",
    emptyState: {
      description:
        "The requested profile is not visible through the current Platform Admin RLS boundary.",
      title: "Profile not visible",
    },
    guardrails: [
      "Access state is shown from profile and membership rows only.",
      "Suspend/reactivate profile remains outside this task; Platform role changes use the audited admin RPCs.",
      "No auth secret fields are queried or rendered.",
    ],
    rows: profile
      ? [
          {
            memberships:
              memberships.length > 0
                ? memberships
                    .map(
                      (member) =>
                        `${shopNameById(readModel.shops, member.shop_id)} / ${formatToken(member.role_id)}`,
                    )
                    .join(", ")
                : "None",
            platformRole: readModel.platformAdminProfileIds.includes(profile.profile_id)
              ? "platform_admin"
              : "none",
            profile: profile.display_name,
            rowKey: profile.profile_id,
            state: formatToken(profile.profile_status),
          },
          {
            memberships: `${audits.length} linked events`,
            platformRole: "Audit",
            profile: "Recent audit",
            rowKey: `${profile.profile_id}-audit`,
            state: audits[0]?.event ?? "None",
          },
        ]
      : [],
    stats: [
      stat("Profile", profile ? "Visible" : "Missing", "RLS detail lookup"),
      stat("Memberships", String(memberships.length), "Shop memberships"),
      stat("Audit events", String(audits.length), "Actor-linked audit"),
    ],
    status: "User detail",
    title: "User Detail",
  };
}

function buildShopDetail(
  readModel: PlatformAdminLiveReadModel,
  shopId: string,
): PlatformSection {
  const base = platformSections.shops;
  const shop = readModel.shops.find((item) => item.shop_id === shopId);
  const members = readModel.shopMembers.filter((member) => member.shop_id === shopId);
  const devices = readModel.shopDevices.filter((device) => device.shop_id === shopId);
  const sync = latestSyncForShop(
    readModel.syncEvents,
    readModel.shopOwnerMappings,
    shopId,
  );
  const audits = readModel.auditLogs.filter((log) => log.shop_id === shopId);

  return {
    ...base,
    description:
      "Global shop detail with owner, members summary, data health, devices, sync/history, and audit summary.",
    emptyState: {
      description:
        "The requested shop is not visible through the current Platform Admin RLS boundary.",
      title: "Shop not visible",
    },
    guardrails: [
      "Product, category, supplier, spreadsheet, staff, and ordinary device management remain Shop Admin scope.",
      "Lifecycle changes must use the Safe Operations Center.",
      "Restore uses the reviewed audited RPC with shop-code confirmation.",
    ],
    rows: shop
      ? [
          {
            code: shop.shop_code,
            health: `${devices.length} devices / ${audits.length} audit events`,
            owner: activeOwnerForShop(shop, readModel.profiles, readModel.shopMembers),
            rowKey: shop.shop_id,
            shop: shop.shop_name,
            state: formatToken(shop.shop_status),
          },
          {
            code: "Members",
            health: `${members.length} memberships`,
            owner: members
              .slice(0, 4)
              .map((member) => profileNameById(readModel.profiles, member.profile_id))
              .join(", "),
            rowKey: `${shop.shop_id}-members`,
            shop: "Owner/members summary",
            state: "Read-only",
          },
          {
            code: "Sync",
            health: sync ? sync.metadata_summary : "No sync visible",
            owner: sync?.source ?? "None",
            rowKey: `${shop.shop_id}-sync`,
            shop: "Sync/history summary",
            state: sync ? formatToken(sync.event_type) : "Empty",
          },
        ]
      : [],
    stats: [
      stat("Shop", shop ? "Visible" : "Missing", "RLS detail lookup"),
      stat("Members", String(members.length), "Visible memberships"),
      stat("Devices", String(devices.length), "Visible device rows"),
      stat("Audit", String(audits.length), "Recent audit rows"),
    ],
    status: "Shop detail",
    title: "Shop Detail",
  };
}

function buildReadySection(
  key: PlatformSectionKey,
  readModel: PlatformAdminLiveReadModel,
) {
  switch (key) {
    case "overview":
      return buildOverview(readModel);
    case "users":
      return buildUsers(readModel);
    case "shops":
      return buildShops(readModel);
    case "provisioning":
      return buildProvisioning(readModel);
    case "admins":
      return buildAdmins(readModel);
    case "audit":
      return buildAudit(readModel);
    case "system":
      return buildSystem(readModel);
    case "data":
      return buildData(readModel);
    case "devices":
      return buildDevices(readModel);
    case "sync":
      return buildSyncLike("sync", readModel);
    case "history":
      return buildSyncLike("history", readModel);
    case "operations":
      return buildOperations(readModel);
    case "support":
      return buildSupport(readModel);
  }
}

export async function getPlatformSectionForRequest(
  key: PlatformSectionKey,
): Promise<PlatformSection> {
  const readModel = await getPlatformAdminReadModel();

  if (readModel.status !== "ready") {
    return fallbackSection(key, readModel);
  }

  return buildReadySection(key, readModel);
}

export async function getPlatformAuditDetailForRequest(
  eventId: string,
): Promise<PlatformSection> {
  const readModel = await getPlatformAdminReadModel();

  if (readModel.status !== "ready") {
    return fallbackSection("audit", readModel);
  }

  return buildAuditDetail(readModel, eventId);
}

export async function getPlatformUserDetailForRequest(
  profileId: string,
): Promise<PlatformSection> {
  const readModel = await getPlatformAdminReadModel();

  if (readModel.status !== "ready") {
    return fallbackSection("users", readModel);
  }

  return buildUserDetail(readModel, profileId);
}

export async function getPlatformShopDetailForRequest(
  shopId: string,
): Promise<PlatformSection> {
  const readModel = await getPlatformAdminReadModel();

  if (readModel.status !== "ready") {
    return fallbackSection("shops", readModel);
  }

  return buildShopDetail(readModel, shopId);
}
