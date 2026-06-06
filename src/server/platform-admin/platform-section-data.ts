import "server-only";

import {
  platformSections,
  type PlatformSection,
  type PlatformSectionKey,
  type RowDetailPanel,
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

function shopCodeById(shops: readonly Shop[], shopId?: string | null) {
  if (!shopId) {
    return "no shop";
  }

  return shops.find((shop) => shop.shop_id === shopId)?.shop_code ?? shortId(shopId);
}

function activeOwnerMembersForShop(
  shopId: string,
  members: readonly ShopMember[],
) {
  return members.filter(
    (member) =>
      member.shop_id === shopId &&
      member.role_id === "shop_owner" &&
      member.membership_status === "active",
  );
}

function activeOwnerNamesForShop(
  shopId: string,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  return activeOwnerMembersForShop(shopId, members).map((member) =>
    profileNameById(profiles, member.profile_id),
  );
}

function activeOwnerForShop(
  shop: Shop,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  return activeOwnerNamesForShop(shop.shop_id, profiles, members)[0] ?? "Unassigned";
}

function ownerSummaryForShop(
  shop: Shop,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  const owners = activeOwnerNamesForShop(shop.shop_id, profiles, members);

  if (owners.length === 0) {
    return "Unassigned";
  }

  if (owners.length === 1) {
    return `1 owner\n${owners[0]}`;
  }

  const overflow = owners.length > 2 ? `\n+${owners.length - 2} more` : "";

  return `${owners.length} owners\n${owners.slice(0, 2).join(", ")}${overflow}`;
}

function memberSummaryForShop(shopId: string, members: readonly ShopMember[]) {
  const shopMembers = members.filter((member) => member.shop_id === shopId);
  const activeMembers = shopMembers.filter(
    (member) => member.membership_status === "active",
  );

  return `${activeMembers.length} active / ${shopMembers.length} total`;
}

function accountOriginForProfile() {
  return "Not captured";
}

function activeMembershipsForProfile(
  profileId: string,
  members: readonly ShopMember[],
) {
  return members.filter(
    (member) =>
      member.profile_id === profileId && member.membership_status === "active",
  );
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
        `${shopCodeById(shops, member.shop_id)} / ${formatToken(member.role_id)} / ${formatToken(member.membership_status)}`,
    );
}

function shopCodesForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  return activeMembershipsForProfile(profileId, members).map((member) =>
    shopCodeById(shops, member.shop_id),
  );
}

function shopAccessSummaryForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  const shopCodes = shopCodesForProfile(profileId, shops, members);

  if (shopCodes.length === 0) {
    return "0 shops";
  }

  if (shopCodes.length === 1) {
    return `1 shop\n${shopCodes[0]}`;
  }

  const visibleCodes = shopCodes.slice(0, 2).join(", ");
  const overflow = shopCodes.length > 2 ? `\n+${shopCodes.length - 2} more` : "";

  return `${shopCodes.length} shops\n${visibleCodes}${overflow}`;
}

function platformRoleForProfile(
  profileId: string,
  platformAdminProfileIds: readonly string[],
) {
  return platformAdminProfileIds.includes(profileId) ? "platform_admin" : "none";
}

function accessSummaryForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  const access = new Set<string>();
  const activeMemberships = activeMembershipsForProfile(
    profileId,
    readModel.shopMembers,
  );

  if (readModel.platformAdminProfileIds.includes(profileId)) {
    access.add("Master admin");
  }

  if (activeMemberships.some((member) => member.role_id === "shop_owner")) {
    access.add("Shop owner");
  }

  if (activeMemberships.some((member) => member.role_id === "shop_manager")) {
    access.add("Shop manager");
  }

  for (const member of activeMemberships) {
    if (member.role_id !== "shop_owner" && member.role_id !== "shop_manager") {
      access.add(formatToken(member.role_id));
    }
  }

  if (activeMemberships.length === 0) {
    access.add("No shop access");
  }

  return Array.from(access).join("\n");
}

function primaryRoleForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  if (readModel.platformAdminProfileIds.includes(profileId)) {
    return "Master admin";
  }

  const activeMemberships = activeMembershipsForProfile(
    profileId,
    readModel.shopMembers,
  );

  return activeMemberships[0]?.role_id
    ? formatToken(activeMemberships[0].role_id)
    : "No shop access";
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

function staffSafeReadIssue(readModel: PlatformAdminLiveReadModel) {
  return readModel.readIssues.find((issue) => issue.area === "staff_accounts_safe");
}

function profileDiagnostics(
  profile: Profile,
  readModel: PlatformAdminLiveReadModel,
) {
  const duplicateCount = readModel.profiles.filter(
    (candidate) =>
      candidate.profile_id !== profile.profile_id &&
      candidate.display_name === profile.display_name,
  ).length;
  const activeMembershipCount = activeMembershipsForProfile(
    profile.profile_id,
    readModel.shopMembers,
  ).length;

  return [
    {
      label: "Duplicate display name",
      value: duplicateCount > 0 ? `${duplicateCount} duplicate visible` : "None visible",
    },
    {
      label: "Profile without membership",
      value: activeMembershipCount === 0 ? "Yes" : "No",
    },
    {
      label: "Provider data",
      value: "Not captured in safe profile DTO",
    },
  ];
}

function shopDeviceSummary(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
) {
  const devices = readModel.shopDevices.filter(
    (device) => device.shop_id === shop.shop_id,
  );

  if (devices.length === 0) {
    return "No devices visible";
  }

  const active = devices.filter((device) => device.status === "active").length;
  const revoked = devices.filter((device) => device.status === "revoked").length;
  const suspicious = devices.filter(
    (device) => device.status === "suspicious",
  ).length;

  return `${devices.length} devices\n${active} active / ${revoked} revoked / ${suspicious} suspicious`;
}

function shopHealthSummary(shop: Shop, readModel: PlatformAdminLiveReadModel) {
  const latestSync = latestSyncForShop(
    readModel.syncEvents,
    readModel.shopOwnerMappings,
    shop.shop_id,
  );
  const latestAudit = latestAuditForShop(readModel.auditLogs, shop.shop_id);

  return [
    latestSync ? `Sync ${formatToken(latestSync.event_type)}` : "Sync not visible",
    latestAudit ? `Audit ${formatToken(latestAudit.result)}` : "Audit not visible",
  ].join("\n");
}

function userRowDetail(
  profile: Profile,
  readModel: PlatformAdminLiveReadModel,
): RowDetailPanel {
  const memberships = membershipsForProfile(
    profile.profile_id,
    readModel.shops,
    readModel.shopMembers,
  );
  const audits = readModel.auditLogs.filter(
    (log) => log.actor_profile_id === profile.profile_id,
  );
  const platformRole = platformRoleForProfile(
    profile.profile_id,
    readModel.platformAdminProfileIds,
  );
  const activeMembershipCount = activeMembershipsForProfile(
    profile.profile_id,
    readModel.shopMembers,
  ).length;

  return {
    groups: [
      {
        fields: [
          { label: "Display name", value: profile.display_name },
          { label: "Profile ID", value: profile.profile_id },
          { label: "Status", value: formatToken(profile.profile_status) },
        ],
        title: "Identity",
      },
      {
        fields: [
          { label: "Provider", value: accountOriginForProfile() },
          {
            label: "Capture state",
            value: "Provider origin is not captured in the current safe profile DTO.",
          },
        ],
        notes: ["No auth secret fields are queried or rendered."],
        title: "Account origin",
      },
      {
        fields: [
          {
            label: "Master Console access",
            value: platformRole === "platform_admin" ? "Master admin" : "No",
          },
          {
            label: "Admin Console/shop access",
            value: accessSummaryForProfile(profile.profile_id, readModel),
          },
          { label: "Primary role", value: primaryRoleForProfile(profile.profile_id, readModel) },
        ],
        title: "Access",
      },
      {
        fields: [
          { label: "Count", value: String(activeMembershipCount) },
          { label: "Visible memberships", value: memberships.join("\n") || "None" },
        ],
        title: "Shop memberships",
      },
      {
        fields: [
          { label: "Linked events", value: String(audits.length) },
          { label: "Latest event", value: audits[0]?.event ?? "No visible audit event" },
        ],
        title: "Recent audit",
      },
      {
        fields: profileDiagnostics(profile, readModel),
        title: "Diagnostics",
      },
    ],
    href: `/platform/users/${profile.profile_id}`,
    notes: [
      "Provider origin is not captured in the current safe profile DTO.",
      "No auth secret fields are queried or rendered.",
    ],
    rowKey: profile.profile_id,
    subtitle: `ID ${shortId(profile.profile_id)} / ${shopAccessSummaryForProfile(
      profile.profile_id,
      readModel.shops,
      readModel.shopMembers,
    ).replace(/\n/g, " ")}`,
    title: profile.display_name,
  };
}

function shopRowDetail(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
): RowDetailPanel {
  const owners = activeOwnerNamesForShop(
    shop.shop_id,
    readModel.profiles,
    readModel.shopMembers,
  );
  const devices = readModel.shopDevices.filter(
    (device) => device.shop_id === shop.shop_id,
  );
  const latestSync = latestSyncForShop(
    readModel.syncEvents,
    readModel.shopOwnerMappings,
    shop.shop_id,
  );
  const audits = readModel.auditLogs.filter((log) => log.shop_id === shop.shop_id);

  return {
    groups: [
      {
        fields: [
          { label: "Shop name", value: shop.shop_name },
          { label: "Shop code", value: shop.shop_code },
          { label: "Shop ID", value: shop.shop_id },
          { label: "Status", value: formatToken(shop.shop_status) },
        ],
        title: "Overview",
      },
      {
        fields: [
          { label: "Owners", value: owners.join("\n") || "Unassigned" },
          { label: "Members", value: memberSummaryForShop(shop.shop_id, readModel.shopMembers) },
          {
            label: "Primary roles",
            value:
              readModel.shopMembers
                .filter((member) => member.shop_id === shop.shop_id)
                .map((member) => formatToken(member.role_id))
                .slice(0, 4)
                .join("\n") || "No roles visible",
          },
        ],
        title: "Owners & members",
      },
      {
        fields: [
          { label: "Summary", value: shopDeviceSummary(shop, readModel) },
          {
            label: "Latest device update",
            value: devices[0]?.updated_at ?? "No devices visible",
          },
        ],
        notes: [
          "Device and sync values are support signals, not daily device management.",
          "Open Admin Console for shop-level device management.",
        ],
        title: "Devices",
      },
      {
        fields: [
          {
            label: "Latest sync",
            value: latestSync
              ? `${formatToken(latestSync.event_type)} / ${latestSync.created_at}`
              : "No sync visible",
          },
          { label: "Audit count", value: String(audits.length) },
          { label: "Latest audit", value: audits[0]?.event ?? "No audit event visible" },
        ],
        notes:
          latestSync || audits.length > 0
            ? ["Device and sync values are support signals, not daily device management."]
            : [
                "Device and sync values are support signals, not daily device management.",
                "Related data limited by current boundary.",
              ],
        title: "Sync & audit",
      },
      {
        fields: [
          { label: "Full detail", value: "Open full detail" },
          {
            label: "Lifecycle actions",
            value: "Controlled Operations with reason and audit",
          },
        ],
        title: "Operations",
      },
    ],
    href: `/platform/shops/${shop.shop_id}`,
    notes: [
      "This is the global shop registry, not product or staff operations for a single shop.",
      "Lifecycle changes remain on Controlled Operations with reason and audit.",
      "Device and sync values are support signals, not daily device management.",
      "Open Admin Console for shop-level device management.",
    ],
    rowKey: shop.shop_id,
    subtitle: `${shop.shop_code} / ${formatToken(shop.shop_status)}`,
    title: shop.shop_name,
  };
}

function userDetailSections(
  profile: Profile,
  readModel: PlatformAdminLiveReadModel,
) {
  const memberships = membershipsForProfile(
    profile.profile_id,
    readModel.shops,
    readModel.shopMembers,
  );
  const audits = readModel.auditLogs.filter(
    (log) => log.actor_profile_id === profile.profile_id,
  );
  const platformRole = platformRoleForProfile(
    profile.profile_id,
    readModel.platformAdminProfileIds,
  );

  return [
    {
      fields: [
        { label: "Display name", value: profile.display_name },
        { label: "Profile ID", value: profile.profile_id },
        { label: "Short ID", value: shortId(profile.profile_id) },
        { label: "Status", value: formatToken(profile.profile_status) },
      ],
      title: "Identity",
    },
    {
      fields: [
        { label: "Provider", value: accountOriginForProfile() },
        {
          label: "Capture state",
          value: "Provider origin is not captured in the current safe profile DTO.",
        },
      ],
      notes: ["No auth secret fields are queried or rendered."],
      title: "Account origin",
    },
    {
      fields: [
        {
          label: "Master Console access",
          value: platformRole === "platform_admin" ? "Master admin" : "No",
        },
        {
          label: "Admin Console/shop access",
          value: accessSummaryForProfile(profile.profile_id, readModel),
        },
        { label: "Primary role", value: primaryRoleForProfile(profile.profile_id, readModel) },
      ],
      title: "Master Console access",
    },
    {
      fields: [
        { label: "Count", value: String(memberships.length) },
        { label: "Visible memberships", value: memberships.join("\n") || "None" },
      ],
      title: "Shop memberships",
    },
    {
      fields: [
        { label: "Linked events", value: String(audits.length) },
        { label: "Latest event", value: audits[0]?.event ?? "No visible audit event" },
      ],
      title: "Recent audit",
    },
    {
      fields: profileDiagnostics(profile, readModel),
      title: "Diagnostics",
    },
  ];
}

function shopDetailSections(shop: Shop, readModel: PlatformAdminLiveReadModel) {
  const members = readModel.shopMembers.filter(
    (member) => member.shop_id === shop.shop_id,
  );
  const devices = readModel.shopDevices.filter(
    (device) => device.shop_id === shop.shop_id,
  );
  const sync = latestSyncForShop(
    readModel.syncEvents,
    readModel.shopOwnerMappings,
    shop.shop_id,
  );
  const audits = readModel.auditLogs.filter((log) => log.shop_id === shop.shop_id);
  const relatedRowsVisible = devices.length > 0 || Boolean(sync) || audits.length > 0;

  return [
    {
      fields: [
        { label: "Shop name", value: shop.shop_name },
        { label: "Shop code", value: shop.shop_code },
        { label: "Shop ID", value: shop.shop_id },
        { label: "Status", value: formatToken(shop.shop_status) },
      ],
      title: "Overview",
    },
    {
      fields: [
        {
          label: "Owners",
          value: ownerSummaryForShop(shop, readModel.profiles, readModel.shopMembers),
        },
        { label: "Members", value: memberSummaryForShop(shop.shop_id, readModel.shopMembers) },
        {
          label: "Visible roles",
          value:
            members.map((member) => formatToken(member.role_id)).join("\n") ||
            "No roles visible",
        },
      ],
      title: "Owners & members",
    },
    {
      fields: [
        { label: "Summary", value: shopDeviceSummary(shop, readModel) },
        { label: "Latest update", value: devices[0]?.updated_at ?? "No devices visible" },
      ],
      notes:
        devices.length === 0
          ? [
              "Device and sync values are support signals, not daily device management.",
              "Open Admin Console for shop-level device management.",
              "Related data limited by current boundary.",
            ]
          : [
              "Device and sync values are support signals, not daily device management.",
              "Open Admin Console for shop-level device management.",
            ],
      title: "Devices",
    },
    {
      fields: [
        {
          label: "Latest sync",
          value: sync
            ? `${formatToken(sync.event_type)} / ${sync.created_at}`
            : "No sync visible",
        },
        { label: "Latest audit", value: audits[0]?.event ?? "No audit event visible" },
      ],
      notes: relatedRowsVisible
        ? ["Device and sync values are support signals, not daily device management."]
        : [
            "Device and sync values are support signals, not daily device management.",
            "Some related rows are not visible through the current read boundary.",
          ],
      title: "Sync/history",
    },
    {
      fields: [
        { label: "Audit count", value: String(audits.length) },
        { label: "Latest result", value: audits[0] ? formatToken(audits[0].result) : "No audit event visible" },
      ],
      title: "Audit",
    },
    {
      fields: [
        {
          label: "Lifecycle actions",
          value: "Controlled Operations with reason and audit",
        },
        {
          label: "Boundary copy",
          value: "Related data limited by current boundary",
        },
      ],
      title: "Operations boundary",
    },
  ];
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
      "Platform Admin governs ecosystem-level users, shops, audit, device/sync diagnostic signals, and data health.",
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
        area: "Device signals",
        next: `${revokedOrSuspiciousDevices} revoked or suspicious`,
        signal: `${readModel.shopDevices.length} visible devices`,
        state: readModel.dataHealth.device_schema_status,
      },
      {
        area: "Sync signals",
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
    filters: [
      {
        key: "state",
        label: "State",
        options: [
          { label: "All states", value: "" },
          { label: "Active", value: "Active" },
          { label: "Disabled", value: "Disabled" },
          { label: "Review", value: "Review" },
        ],
      },
      {
        key: "access",
        label: "Access",
        options: [
          { label: "All access", value: "" },
          { label: "Master admin", value: "Master admin" },
          { label: "Shop owner", value: "Shop owner" },
          { label: "Shop manager", value: "Shop manager" },
          { label: "No shop access", value: "No shop access" },
        ],
      },
    ],
    guardrails: [
      "Search and filters are server-side concerns; this view renders the current server-limited read model.",
      "No auth secrets are part of the profile DTO.",
      "Profile lifecycle actions are not exposed; Platform Admin grant changes use the dedicated audited admin RPCs.",
    ],
    rowDetails: readModel.profiles.map((profile) => userRowDetail(profile, readModel)),
    rows: readModel.profiles.map((profile): TableRow => {
      const shopAccess = shopAccessSummaryForProfile(
        profile.profile_id,
        readModel.shops,
        readModel.shopMembers,
      );
      const profileStatus = formatToken(profile.profile_status);

      return {
        origin: accountOriginForProfile(),
        access: accessSummaryForProfile(profile.profile_id, readModel),
        profile: `${profile.display_name}\nID ${shortId(profile.profile_id)}\n${profileStatus}`,
        rowKey: profile.profile_id,
        shops: shopAccess,
        state: profileStatus,
      };
    }),
    searchPlaceholder: "Search users by name or profile ID",
    stats: [
      stat("Profiles", String(readModel.profiles.length), "Visible users"),
      stat("Platform admins", String(platformAdmins.size), "Active grants", "good"),
      stat(
        "Without membership",
        String(readModel.dataHealth.profiles_without_membership),
        "Support diagnostics signal",
        readModel.dataHealth.profiles_without_membership > 0 ? "warning" : "good",
      ),
      stat("Origins", "Not captured", "Provider not in safe profile DTO", "muted"),
    ],
    status: "Read-only",
  };
}

function buildShops(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.shops;

  return {
    ...base,
    filters: [
      {
        key: "shop",
        label: "State",
        options: [
          { label: "All states", value: "" },
          { label: "Active", value: "Active" },
          { label: "Pending", value: "Pending Setup" },
          { label: "Suspended", value: "Suspended" },
          { label: "Archived", value: "Archived" },
        ],
      },
      {
        key: "owners",
        label: "Owner status",
        options: [
          { label: "All owners", value: "" },
          { label: "With owner", value: "owner" },
          { label: "Unassigned", value: "Unassigned" },
        ],
      },
    ],
    guardrails: [
      "This is the global shop registry, not product or staff operations for a single shop.",
      "Lifecycle controls stay on Controlled Operations with reason and audit.",
      "Device and sync values are support signals, not daily device management.",
      "Open Admin Console for shop-level device management.",
      "Archived shops can be restored only through the audited restore RPC with shop code confirmation.",
    ],
    rowDetails: readModel.shops.map((shop) => shopRowDetail(shop, readModel)),
    rows: readModel.shops.map((shop): TableRow => {
      const shopStatus = formatToken(shop.shop_status);

      return {
        code: shop.shop_code,
        devices: shopDeviceSummary(shop, readModel),
        health: shopHealthSummary(shop, readModel),
        members: memberSummaryForShop(shop.shop_id, readModel.shopMembers),
        owners: ownerSummaryForShop(shop, readModel.profiles, readModel.shopMembers),
        rowKey: shop.shop_id,
        shop: `${shop.shop_name}\nID ${shortId(shop.shop_id)}\n${shopStatus}`,
      };
    }),
    searchPlaceholder: "Search shops by name, code, or ID",
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
        next: "Use /platform/provisioning",
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
  const staffIssue = staffSafeReadIssue(readModel);

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
        next: staffIssue?.message ?? "Selects pass through authenticated RLS only",
        signal: "Profiles, shops, audit, devices, sync",
        state: staffIssue ? staffIssue.code : "PASS_WITH_NOTES",
      },
      {
        area: "Staff safe read model",
        next: staffIssue?.message ?? "Safe staff view is readable or empty",
        signal: staffIssue ? staffIssue.code : `${readModel.staffSafeRows.length} rows`,
        state: readModel.dataHealth.staff_schema_status,
      },
      {
        area: "Device/sync data health",
        next: "Device signals are aggregated for support.",
        signal:
          "Sync signals are diagnostic; live Win7POS Sales Sync remains separately verified.",
        state: "Read-only diagnostics",
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
  const staffIssue = staffSafeReadIssue(readModel);

  return {
    ...base,
    guardrails: [
      "Data health is computed from server aggregate inputs only.",
      "Migration drift is NOT_RUN in the UI unless the Supabase CLI gate has been executed.",
      "Blocked and not_configured states are distinct from empty data.",
      "Device/sync data health is read-only and aggregated for support diagnostics.",
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
        area: "Device/sync data health",
        next: "Device signals are aggregated for support.",
        signal:
          "Sync signals are diagnostic; live Win7POS Sales Sync remains separately verified.",
        state: "Read-only diagnostics",
      },
      {
        area: "staff schema status",
        next: staffIssue?.message ?? "Safe staff view only",
        signal: staffIssue ? staffIssue.code : String(readModel.staffSafeRows.length),
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
  const authorized = readModel.shopDevices.filter(
    (device) => device.status === "active",
  ).length;
  const revoked = readModel.shopDevices.filter(
    (device) => device.status === "revoked",
  ).length;
  const suspicious = readModel.shopDevices.filter(
    (device) => device.status === "suspicious",
  ).length;
  const syncSourceIds = new Set(
    readModel.syncEvents
      .map((event) => event.source_device_id)
      .filter((sourceDeviceId): sourceDeviceId is string => Boolean(sourceDeviceId)),
  );

  return {
    ...base,
    title: "Device Signals",
    eyebrow: "Internal diagnostic",
    description:
      "Read-only diagnostic view for global device coverage and support signals. Daily device management belongs to Admin Console.",
    diagnosticsPriority: "secondary",
    emptyState: {
      title: "No device signals visible",
      description:
        "Device signals appear after POS or mobile registration. Sync source ids alone do not authorize a device.",
    },
    guardrails: [
      "This route is an internal diagnostic deep link, not a top-level Master Console destination.",
      "Device authorization comes from shop_devices.",
      "source_device_id is sync/history attribution only.",
      "Daily device management belongs to Admin Console.",
      "Emergency device action requires server RPC, reason, confirmation, and audit.",
    ],
    nextLinks: [
      {
        description:
          "Review the global shop registry with device and health support signals.",
        href: "/platform/shops",
        label: "Open Shops",
      },
      {
        description:
          "Use Support Diagnostics as the primary triage surface for device signals.",
        href: "/platform/support",
        label: "Open Support",
      },
      {
        description:
          "Use Operations only for audited emergency device revoke or lifecycle actions.",
        href: "/platform/operations",
        label: "Open Operations",
      },
    ],
    purposeItems: [
      {
        detail: "Review aggregated device coverage and support signals across shops.",
        label: "Shows",
      },
      {
        detail:
          "Use it when checking device authorization, revoked devices, or suspicious device state for support triage.",
        label: "Use when",
      },
      {
        detail:
          "It does not authorize sync source ids and does not replace daily device management in Admin Console.",
        label: "Not included",
      },
      {
        detail: "Device signals appear after POS or mobile registration.",
        label: "Empty state",
      },
    ],
    rows: readModel.shopDevices.map((device) => deviceRow(device, readModel)),
    stats: [
      stat("Authorized", String(authorized), "Active shop_devices rows", "good"),
      stat("Revoked", String(revoked), "Authorization disabled", revoked > 0 ? "warning" : "good"),
      stat(
        "Suspicious",
        String(suspicious),
        "Requires support review",
        suspicious > 0 ? "warning" : "good",
      ),
      stat(
        "Sync source ids",
        String(syncSourceIds.size),
        "Attribution only, not authorization",
        "muted",
      ),
    ],
    status: "Internal diagnostic",
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

function historyRow(
  event: PlatformSyncOverview,
  readModel: PlatformAdminLiveReadModel,
): TableRow {
  const shopId = readModel.shopOwnerMappings.find(
    (mapping) => mapping.ownerUserId === event.owner_user_id,
  )?.shopId;

  return {
    date: event.created_at,
    history: `${formatToken(event.event_type)} / ${event.changed_count} changes`,
    next: "Use Global Sync for technical event details",
    rowKey: event.sync_event_id,
    scope: `${event.domain} / ${event.source ?? "unknown"}`,
    shop: shopNameById(readModel.shops, shopId),
  };
}

function buildSyncLike(
  key: "sync" | "history",
  readModel: PlatformAdminLiveReadModel,
): PlatformSection {
  const base = platformSections[key];
  const domains = new Set(readModel.syncEvents.map((event) => event.domain));
  const isSync = key === "sync";

  return {
    ...base,
    title: isSync ? "Sync Signals" : base.title,
    eyebrow: isSync ? "Internal diagnostic" : base.eyebrow,
    description: isSync
      ? "Read-only diagnostic view for global sync signals. Shop-level sync troubleshooting belongs to Admin Console."
      : "Read-only history view for mobile/inventory history and high-level sync history.",
    diagnosticsPriority: "secondary",
    emptyState: isSync
      ? {
          title: "No sync signals visible",
          description:
            "Sync signals appear after mobile/POS/catalog sync events are written to the server read model. Shop-level sync troubleshooting belongs to Admin Console.",
        }
      : {
          title: "No history events visible",
          description:
            "History rows appear only when the server read model exposes safe history DTOs.",
        },
    guardrails: isSync
      ? [
          "This route is an internal diagnostic deep link, not a top-level Master Console destination.",
          "This is not admin audit and does not prove live Sales Sync.",
          "Sales Sync foundation exists, but live Win7POS sales sync is not verified yet.",
          "Shop-level sync troubleshooting belongs to Admin Console.",
          "Raw JSON is summarized and limited by the server read model.",
        ]
      : [
          "For technical sync events use Global Sync. For admin actions use Audit.",
          "History rows are high-level mobile/inventory or sync-history signals.",
          "Raw JSON is summarized and limited by the server read model.",
        ],
    nextLinks: isSync
      ? [
          {
            description: "Review aggregate device and sync health in the data diagnostics page.",
            href: "/platform/data",
            label: "Open Data",
          },
          {
            description:
              "Use Support Diagnostics as the primary triage surface for sync signals.",
            href: "/platform/support",
            label: "Open Support",
          },
          {
            description: "Review administrative actions and sensitive changes.",
            href: "/platform/audit",
            label: "Open Audit",
          },
        ]
      : [
          {
            description: "Use technical sync events when debugging event-level replication.",
            href: "/platform/sync",
            label: "Open Sync",
          },
          {
            description: "Use Audit for admin actions, results, actors, and targets.",
            href: "/platform/audit",
            label: "Open Audit",
          },
        ],
    purposeItems: isSync
      ? [
          {
            detail:
              "Review global sync signals for POS, mobile, catalog, and future integrations.",
            label: "Shows",
          },
          {
            detail: "Use it when debugging global sync visibility before opening shop-level troubleshooting.",
            label: "Use when",
          },
          {
            detail:
              "It is not administrative audit, not shop-level troubleshooting, and does not prove live Win7POS Sales Sync.",
            label: "Not included",
          },
          {
            detail:
              "Rows appear when sync signals are written to the server read model.",
            label: "Empty state",
          },
        ]
      : [
          {
            detail:
              "Review mobile/inventory history and high-level sync history from safe DTOs.",
            label: "Shows",
          },
          {
            detail: "Use it when Sync feels too technical for a support question.",
            label: "Use when",
          },
          {
            detail: "It is not technical sync detail and not admin audit.",
            label: "Not included",
          },
          {
            detail: "Rows appear only when safe history DTOs are exposed.",
            label: "Empty state",
          },
        ],
    rows: readModel.syncEvents.map((event) =>
      isSync ? syncRow(event, readModel) : historyRow(event, readModel),
    ),
    stats: [
      stat(
        "Events",
        String(readModel.syncEvents.length),
        isSync ? "Latest sync events" : "History signals",
      ),
      stat("Domains", String(domains.size), "Visible domains"),
      stat(
        "Suspended activity",
        String(readModel.dataHealth.suspended_shops_with_recent_activity),
        "Suspended shops with recent sync",
        readModel.dataHealth.suspended_shops_with_recent_activity > 0
          ? "warning"
          : "good",
      ),
      stat(
        "Sales Sync live",
        "Not verified",
        "Win7POS live sales sync is not claimed",
        "warning",
      ),
    ],
    status: isSync ? "Internal diagnostic" : "Read-only",
  };
}

function buildOperations(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.operations;

  return {
    ...base,
    guardrails: [
      "Every sensitive action requires server authorization, reason, confirmation, and audit.",
      "Double submit protection is handled by pending-aware submit controls and idempotent RPC state checks.",
      "Provisioning and Platform Admin grants stay on their dedicated pages.",
      "Device emergency operations are global exceptions. Daily device management belongs to Admin Console.",
    ],
    operations: [
      {
        description: "Suspend, reactivate, or archive a shop through audited RPCs.",
        label: "Shop lifecycle",
      },
      {
        description:
          "Emergency device action uses platform_emergency_revoke_device as a global exception. Daily device management belongs to Admin Console.",
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
    ],
    stats: [
      stat("Shop lifecycle", "4", "Existing audited RPCs", "good"),
      stat("Device emergency", "1", "TASK-016 audited RPC", "warning"),
      stat("Provisioning", "Dedicated", "/platform/provisioning", "muted"),
    ],
    status: "Controlled Operations",
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
      rowKey: profile.profile_id,
      signal:
        memberships.length > 0
          ? memberships.slice(0, 2).join(", ")
          : "No memberships",
      state: formatToken(profile.profile_status),
      subject: profile.display_name,
      suggestedNextStep:
        memberships.length === 0
          ? "Check profile membership"
          : recentAudit
            ? "Open user detail"
            : "No action needed",
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
      rowKey: shop.shop_id,
      signal: `${activeOwnerForShop(shop, readModel.profiles, readModel.shopMembers)} / ${devices.length} devices`,
      state: formatToken(shop.shop_status),
      subject: shop.shop_name,
      suggestedNextStep:
        activeOwnerForShop(shop, readModel.profiles, readModel.shopMembers) === "Unassigned"
          ? "Use Provisioning"
          : devices.length === 0
            ? "Open Data"
            : sync
              ? "Open shop detail"
              : "Open Data",
    };
  });
  const accessIssues =
    readModel.dataHealth.profiles_without_membership +
    readModel.dataHealth.shops_without_owner +
    readModel.readIssues.length;

  return {
    ...base,
    columns: [
      { key: "subject", label: "Subject" },
      { key: "signal", label: "Signal" },
      { key: "state", label: "State" },
      { key: "suggestedNextStep", label: "Suggested next step" },
    ],
    description:
      "Read-only diagnostic view for access, membership, shop setup, devices, sync, and recent audit signals.",
    diagnosticsPriority: "secondary",
    emptyState: {
      title: "No support signals visible",
      description:
        "Support rows appear when safe profile, shop, membership, device, sync, or audit DTOs are returned by the server read model.",
    },
    guardrails: [
      "Support diagnostics is read-only and does not impersonate users.",
      "Suggested actions link back to safe operations; diagnostics do not mutate data.",
      "Access status, memberships, audit, devices, sync, and configuration warnings are redacted summaries.",
    ],
    nextLinks: [
      {
        description: "Review profile identity, memberships, and access state.",
        href: "/platform/users",
        label: "Open Users",
      },
      {
        description: "Review shop setup, owners, members, devices, and health.",
        href: "/platform/shops",
        label: "Open Shops",
      },
      {
        description:
          "Review aggregate data health for device and sync diagnostic signals.",
        href: "/platform/data",
        label: "Open Data",
      },
      {
        description: "Use Provisioning when a shop needs owner setup.",
        href: "/platform/provisioning",
        label: "Open Provisioning",
      },
      {
        description: "Use Operations only for audited emergency or lifecycle actions.",
        href: "/platform/operations",
        label: "Open Operations",
      },
    ],
    purposeItems: [
      {
        detail:
          "Diagnose access, membership, shop setup, devices, sync, and recent audit signals.",
        label: "Shows",
      },
      {
        detail:
          "Use it when a profile cannot enter, a shop is missing, or device/sync rows are not visible.",
        label: "Use when",
      },
      {
        detail: "It does not impersonate users and does not run mutative support actions.",
        label: "Not included",
      },
      {
        detail:
          "Suggested next steps point to Users, Shops, Data, Provisioning, or Operations.",
        label: "Next step",
      },
    ],
    rows: [...profileRows, ...shopRows],
    stats: [
      stat("Profiles checked", String(profileRows.length), "Support sample"),
      stat("Shops checked", String(shopRows.length), "Support sample"),
      stat(
        "Access issues",
        String(accessIssues),
        "Membership, owner, or read warnings",
        accessIssues > 0 ? "warning" : "good",
      ),
      stat("Impersonation: Out of scope", "No", "No mutative support action", "warning"),
    ],
    status: "Read-only",
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
    detailSections: profile ? userDetailSections(profile, readModel) : undefined,
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
            access: accessSummaryForProfile(profile.profile_id, readModel),
            origin: accountOriginForProfile(),
            profile: `${profile.display_name}\nID ${shortId(profile.profile_id)}\n${formatToken(profile.profile_status)}`,
            rowKey: profile.profile_id,
            shops:
              memberships.length > 0
                ? memberships
                    .map((member) => `${shopCodeById(readModel.shops, member.shop_id)} / ${formatToken(member.role_id)}`)
                    .join("\n")
                : "None",
            state: formatToken(profile.profile_status),
          },
          {
            access: "Audit",
            origin: "Server audit",
            profile: "Recent audit",
            rowKey: `${profile.profile_id}-audit`,
            shops: `${audits.length} linked events`,
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
    title: profile
      ? `${profile.display_name} / ID ${shortId(profile.profile_id)}`
      : "User Detail",
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
    detailSections: shop ? shopDetailSections(shop, readModel) : undefined,
    emptyState: {
      description:
        "The requested shop is not visible through the current Platform Admin RLS boundary.",
      title: "Shop not visible",
    },
    guardrails: [
      "Product, category, supplier, spreadsheet, staff, and ordinary device management remain Shop Admin scope.",
      "Lifecycle changes must use Controlled Operations.",
      "Restore uses the reviewed audited RPC with shop-code confirmation.",
    ],
    rows: shop
      ? [
          {
            code: shop.shop_code,
            devices: shopDeviceSummary(shop, readModel),
            health: shopHealthSummary(shop, readModel),
            members: memberSummaryForShop(shop.shop_id, readModel.shopMembers),
            owners: ownerSummaryForShop(shop, readModel.profiles, readModel.shopMembers),
            rowKey: shop.shop_id,
            shop: `${shop.shop_name}\nID ${shortId(shop.shop_id)}\n${formatToken(shop.shop_status)}`,
          },
          {
            code: "Members",
            devices: "No device change",
            health: `${members.length} memberships`,
            members: memberSummaryForShop(shop.shop_id, readModel.shopMembers),
            owners: members
              .slice(0, 4)
              .map((member) => profileNameById(readModel.profiles, member.profile_id))
              .join(", "),
            rowKey: `${shop.shop_id}-members`,
            shop: "Owner/members summary",
          },
          {
            code: "Sync",
            devices: `${devices.length} visible devices`,
            health: sync ? sync.metadata_summary : "No sync visible",
            members: `${audits.length} audit events`,
            owners: sync?.source ?? "None",
            rowKey: `${shop.shop_id}-sync`,
            shop: "Sync/history summary",
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
    title: shop ? `${shop.shop_name} / ${shop.shop_code}` : "Shop Detail",
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
