import "server-only";

import {
  formatToken,
  readableBoundaryStatus,
} from "@/components/platform/displayFormat";
import {
  platformSections,
  type PlatformSection,
  type PlatformSectionKey,
  type RowDetailField,
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
  isActiveMembershipStatus,
  isOperationalMembership,
  isOperationalShopStatus,
  membershipOperationalLabel,
  nonOperationalMembershipsForProfile,
  operationalMembershipsForProfile,
  operationalMembershipsForShop,
  shopById,
  shopOperationalAccessLabel,
  shopStatusDescription,
  shopStatusLabel,
} from "@/domain/platform-admin/semantics";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getPlatformAdminReadModel,
  type PlatformAdminLiveReadModel,
  type PlatformProfileSyncState,
  type PlatformShopAccessState,
  type PlatformUserAccountSummary,
} from "./read-model";
import { normalizePlatformUserSearchQuery } from "./auth-identities";
import {
  canTransitionShopStatus,
  formatRutForDisplay,
} from "./shop-action-validation";

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
    profiles.find((profile) => profile.profile_id === profileId)
      ?.display_name ?? `Profile ${shortId(profileId)}`
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

  return (
    shops.find((shop) => shop.shop_id === shopId)?.shop_code ?? shortId(shopId)
  );
}

function activeOwnerMembersForShop(shop: Shop, members: readonly ShopMember[]) {
  return members.filter(
    (member) =>
      member.shop_id === shop.shop_id &&
      member.role_id === "shop_owner" &&
      isOperationalMembership(member, shop),
  );
}

function ownerMembershipsForShop(
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

function configuredValue(value?: string | null) {
  const trimmed = value?.trim() ?? "";

  return trimmed || "Not configured";
}

function configuredRut(value?: string | null) {
  const trimmed = value?.trim() ?? "";

  return trimmed ? formatRutForDisplay(trimmed) : "Not configured";
}

function configuredTimestamp(value?: string | null) {
  return value ?? "Not configured";
}

function shopRecordLabel(shop: Shop) {
  return `${shopStatusLabel(shop.shop_status)} record`;
}

function shopOperationalAccessState(shop: Shop) {
  return isOperationalShopStatus(shop.shop_status) ? "Enabled" : "Disabled";
}

function shopOperationalAccessTableValue(shop: Shop) {
  if (isOperationalShopStatus(shop.shop_status)) {
    return "Enabled";
  }

  return `Disabled\n${shopStatusLabel(shop.shop_status)} shop`;
}

function hasConfiguredFiscalIdentity(shop: Shop) {
  return Boolean(
    shop.company_rut?.trim() ||
    shop.business_giro?.trim() ||
    shop.business_address?.trim() ||
    shop.business_city?.trim() ||
    shop.legal_representative_rut?.trim(),
  );
}

function activeOwnerNamesForShop(
  shop: Shop,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  return activeOwnerMembersForShop(shop, members).map((member) =>
    profileNameById(profiles, member.profile_id),
  );
}

function activeOwnerForShop(
  shop: Shop,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  return activeOwnerNamesForShop(shop, profiles, members)[0] ?? "Unassigned";
}

function ownerSummaryForShop(
  shop: Shop,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  const ownerMemberships = ownerMembershipsForShop(shop.shop_id, members);
  const owners = isOperationalShopStatus(shop.shop_status)
    ? activeOwnerNamesForShop(shop, profiles, members)
    : ownerMemberships.map((member) =>
        profileNameById(profiles, member.profile_id),
      );

  if (owners.length === 0) {
    return "Unassigned";
  }

  if (!isOperationalShopStatus(shop.shop_status)) {
    return `${owners.length} owner membership${owners.length === 1 ? "" : "s"}\n${shopOperationalAccessTableValue(shop)}`;
  }

  if (owners.length === 1) {
    return `1 owner\n${owners[0]}`;
  }

  const overflow = owners.length > 2 ? `\n+${owners.length - 2} more` : "";

  return `${owners.length} owners\n${owners.slice(0, 2).join(", ")}${overflow}`;
}

function memberSummaryForShop(shop: Shop, members: readonly ShopMember[]) {
  const shopMembers = members.filter(
    (member) => member.shop_id === shop.shop_id,
  );
  const operationalMembers = operationalMembershipsForShop(shop, shopMembers);

  if (!isOperationalShopStatus(shop.shop_status)) {
    return `${shopMembers.length} membership${shopMembers.length === 1 ? "" : "s"}\n${shopOperationalAccessTableValue(shop)}`;
  }

  return `${operationalMembers.length} operational / ${shopMembers.length} total`;
}

function accountOriginForUser(account: PlatformUserAccountSummary) {
  return `${account.provider}\n${formatToken(account.providerType)}`;
}

function isUnavailableIdentityValue(value: string) {
  return [
    "Auth identity unavailable",
    "Email unavailable",
    "Not captured",
    "Unavailable",
  ].includes(value);
}

function accountSafeEmail(account: PlatformUserAccountSummary) {
  const email = account.email.trim();

  return email && !isUnavailableIdentityValue(email) ? email : "";
}

function isGenericAccountDisplayName(value: string) {
  const normalized = value.trim().toLocaleLowerCase();

  return [
    "admin",
    "administrator",
    "master admin",
    "platform admin",
    "profile",
    "user",
  ].includes(normalized);
}

function accountPrimaryLabel(account: PlatformUserAccountSummary) {
  const email = accountSafeEmail(account);
  const displayName = account.displayName.trim();

  if (email && (!displayName || isGenericAccountDisplayName(displayName))) {
    return email;
  }

  return displayName || email || `Profile ${shortId(account.profileId)}`;
}

function accountForProfileId(
  profileId: string | undefined,
  readModel: PlatformAdminLiveReadModel,
) {
  if (!profileId) {
    return undefined;
  }

  return readModel.userAccounts.find(
    (account) => account.profileId === profileId,
  );
}

function accountPrimaryLabelForProfile(
  profileId: string | undefined,
  readModel: PlatformAdminLiveReadModel,
) {
  if (!profileId) {
    return "Unassigned";
  }

  const account = accountForProfileId(profileId, readModel);
  const safeEmail = account ? accountSafeEmail(account) : "";

  if (safeEmail) {
    return safeEmail;
  }

  if (account) {
    return accountPrimaryLabel(account);
  }

  const profileLabel = profileNameById(readModel.profiles, profileId);

  return isGenericAccountDisplayName(profileLabel)
    ? `Profile ${shortId(profileId)}`
    : profileLabel;
}

function accountProfileCell(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
) {
  const primaryLabel = accountPrimaryLabel(account);
  const profileSyncState = profileSyncStateLabel(account.profileSyncState);
  const lines = [primaryLabel];

  if (account.displayName && account.displayName !== primaryLabel) {
    lines.push(`Profile display name ${account.displayName}`);
  }

  lines.push(`Profile ID ${shortId(account.profileId)}`);
  lines.push(profileSyncState);

  if (mobileInventoryDataLinkedToShop(account.mobileInventoryData)) {
    lines.push(mobileInventoryDataStatusLabel(account.mobileInventoryData));
  }

  if (hasPlatformAdminAccess(account.profileId, readModel)) {
    lines.push("Platform Admin / Master Console");
  }

  return lines.join("\n");
}

function profileSyncStateLabel(state: PlatformProfileSyncState) {
  switch (state) {
    case "auth_only":
      return "Auth only";
    case "origin_unavailable":
      return "Origin unavailable";
    case "profile_ok":
      return "Profile OK";
    case "profile_only":
      return "Profile only";
  }
}

function shopAccessStateLabel(state: PlatformShopAccessState) {
  switch (state) {
    case "member":
      return "Operational shop member";
    case "member_and_platform_admin":
      return "Platform Admin + operational shop member";
    case "none":
      return "No shop access";
    case "platform_admin":
      return "Platform Admin (Master Console)";
  }
}

function hasPlatformAdminAccess(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  return readModel.platformAdminProfileIds.includes(profileId);
}

function isShopAdminRole(member: ShopMember) {
  return member.role_id === "shop_owner" || member.role_id === "shop_manager";
}

function shopAdminMembershipsForProfile(
  profileId: string,
  members: readonly ShopMember[],
) {
  return members.filter(
    (member) => member.profile_id === profileId && isShopAdminRole(member),
  );
}

function currentShopAdminMembershipsForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  const shopsById = shopById(shops);

  return shopAdminMembershipsForProfile(profileId, members).filter((member) =>
    isOperationalMembership(member, shopsById.get(member.shop_id)),
  );
}

function historicalShopAdminMembershipsForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  const shopsById = shopById(shops);

  return shopAdminMembershipsForProfile(profileId, members).filter(
    (member) =>
      isActiveMembershipStatus(member.membership_status) &&
      !isOperationalMembership(member, shopsById.get(member.shop_id)),
  );
}

function disabledShopAdminMembershipsForProfile(
  profileId: string,
  members: readonly ShopMember[],
) {
  return shopAdminMembershipsForProfile(profileId, members).filter(
    (member) => !isActiveMembershipStatus(member.membership_status),
  );
}

function operationalShopAdminMembershipsForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  return currentShopAdminMembershipsForProfile(profileId, shops, members);
}

function canAccessAdminConsole(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  return (
    operationalShopAdminMembershipsForProfile(
      profileId,
      readModel.shops,
      readModel.shopMembers,
    ).length > 0
  );
}

function hasShopAdminMembershipHistory(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  return (
    shopAdminMembershipsForProfile(profileId, readModel.shopMembers).length > 0
  );
}

function shopAdminAccessStateForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  const current = currentShopAdminMembershipsForProfile(
    profileId,
    readModel.shops,
    readModel.shopMembers,
  ).length;
  const historical = historicalShopAdminMembershipsForProfile(
    profileId,
    readModel.shops,
    readModel.shopMembers,
  ).length;
  const disabled = disabledShopAdminMembershipsForProfile(
    profileId,
    readModel.shopMembers,
  ).length;

  if (current > 0) {
    return "Current";
  }

  if (historical > 0) {
    return "Historical only";
  }

  if (disabled > 0) {
    return "Disabled";
  }

  return "No shop admin membership";
}

function accountTypeSegmentsForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  const segments: string[] = [];
  const account = readModel.userAccounts.find(
    (candidate) => candidate.profileId === profileId,
  );
  const isIncomplete = account
    ? account.profileSyncState !== "profile_ok"
    : false;

  if (hasPlatformAdminAccess(profileId, readModel)) {
    segments.push("Platform Admin / Master Console");
  }

  if (hasShopAdminMembershipHistory(profileId, readModel)) {
    segments.push("Shop Admin");

    const memberships = shopAdminMembershipsForProfile(
      profileId,
      readModel.shopMembers,
    );

    if (memberships.some((member) => member.role_id === "shop_owner")) {
      segments.push("Shop Owner");
    }

    if (memberships.some((member) => member.role_id === "shop_manager")) {
      segments.push("Shop Manager");
    }
  }

  if (isIncomplete) {
    segments.push("Incomplete account");
  }

  if (segments.length > 0) {
    return segments;
  }

  return ["Normal account"];
}

function accountTypeLabelForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  return accountTypeSegmentsForProfile(profileId, readModel).join("\n");
}

function globalAccessSummaryForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  return hasPlatformAdminAccess(profileId, readModel)
    ? "Platform Admin (Master Console)"
    : "No global access";
}

function shopRolesForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  const roles = new Set(
    operationalMembershipsForProfile(profileId, shops, members).map((member) =>
      formatToken(member.role_id),
    ),
  );

  return Array.from(roles);
}

function shopAdminAccessSummaryForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  const operationalMemberships = operationalMembershipsForProfile(
    profileId,
    shops,
    members,
  );
  const adminMemberships = operationalShopAdminMembershipsForProfile(
    profileId,
    shops,
    members,
  );
  const historicalAdminMemberships = historicalShopAdminMembershipsForProfile(
    profileId,
    shops,
    members,
  );
  const disabledAdminMemberships = disabledShopAdminMembershipsForProfile(
    profileId,
    members,
  );

  if (adminMemberships.length === 0) {
    if (historicalAdminMemberships.length > 0) {
      return `Historical only\n0 current shops\n${historicalAdminMemberships.length} archived/non-operational`;
    }

    if (disabledAdminMemberships.length > 0) {
      return `Disabled\n${disabledAdminMemberships.length} inactive shop admin membership${disabledAdminMemberships.length === 1 ? "" : "s"}`;
    }

    return operationalMemberships.length > 0
      ? "No Admin Console access"
      : "No shop access";
  }

  const ownerCount = adminMemberships.filter(
    (member) => member.role_id === "shop_owner",
  ).length;
  const managerCount = adminMemberships.filter(
    (member) => member.role_id === "shop_manager",
  ).length;
  const segments: string[] = [];

  if (ownerCount > 0) {
    segments.push(`Owner of ${ownerCount} shop${ownerCount === 1 ? "" : "s"}`);
  }

  if (managerCount > 0) {
    segments.push(
      `Manager of ${managerCount} shop${managerCount === 1 ? "" : "s"}`,
    );
  }

  if (historicalAdminMemberships.length > 0) {
    segments.push(
      `${historicalAdminMemberships.length} historical/non-operational`,
    );
  }

  if (disabledAdminMemberships.length > 0) {
    segments.push(`${disabledAdminMemberships.length} disabled`);
  }

  return `Current\n${segments.join("\n")}`;
}

function shopAdminAccountMembershipsForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  const shopsById = shopById(readModel.shops);

  return shopAdminMembershipsForProfile(profileId, readModel.shopMembers).sort(
    (left, right) => {
      const leftCurrent = isOperationalMembership(
        left,
        shopsById.get(left.shop_id),
      );
      const rightCurrent = isOperationalMembership(
        right,
        shopsById.get(right.shop_id),
      );

      if (leftCurrent !== rightCurrent) {
        return leftCurrent ? -1 : 1;
      }

      return left.shop_id.localeCompare(right.shop_id);
    },
  );
}

function isNonAdminPersonalAccount(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
) {
  return (
    !hasPlatformAdminAccess(account.profileId, readModel) &&
    !hasShopAdminMembershipHistory(account.profileId, readModel)
  );
}

function shopAdminRolesSummaryForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  const memberships = shopAdminAccountMembershipsForProfile(
    profileId,
    readModel,
  );
  const roles: string[] = [];

  if (memberships.some((member) => member.role_id === "shop_owner")) {
    roles.push("Owner");
  }

  if (memberships.some((member) => member.role_id === "shop_manager")) {
    roles.push("Manager");
  }

  return roles.join("\n") || "No Admin Console access";
}

function shopAdminShopsSummaryForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  const shopsById = shopById(readModel.shops);
  const memberships = shopAdminAccountMembershipsForProfile(
    profileId,
    readModel,
  );

  if (memberships.length === 0) {
    return "No Admin Console access";
  }

  const uniqueShopMemberships = Array.from(
    new Map(memberships.map((member) => [member.shop_id, member])).values(),
  );
  const summaries = uniqueShopMemberships.slice(0, 2).map((member) => {
    const shop = shopsById.get(member.shop_id);

    return shop?.shop_name ?? `Shop ${shortId(member.shop_id)}`;
  });
  const overflow =
    uniqueShopMemberships.length > summaries.length
      ? `\n+${uniqueShopMemberships.length - summaries.length} more`
      : "";

  return `${uniqueShopMemberships.length} shop${uniqueShopMemberships.length === 1 ? "" : "s"}\n${summaries.join("\n")}${overflow}`;
}

function operationalMembershipRowsForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  return operationalMembershipsForProfile(profileId, shops, members);
}

function membershipsForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  const shopsById = shopById(shops);

  return members
    .filter((member) => member.profile_id === profileId)
    .map((member) => {
      const shop = shopsById.get(member.shop_id);

      return [
        shopCodeById(shops, member.shop_id),
        formatToken(member.role_id),
        `membership ${formatToken(member.membership_status)}`,
        `shop ${shop ? shopStatusLabel(shop.shop_status) : "Not visible"}`,
        `operational ${membershipOperationalLabel(member, shop)}`,
      ].join(" / ");
    });
}

function membershipFieldsForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
): RowDetailField[] {
  const shopsById = shopById(shops);
  const profileMemberships = members.filter(
    (member) => member.profile_id === profileId,
  );

  if (profileMemberships.length === 0) {
    return [{ label: "Memberships", value: "None" }];
  }

  return profileMemberships.map((member) => {
    const shop = shopsById.get(member.shop_id);
    const shopLabel = shop
      ? `${shop.shop_name} (${shop.shop_code})`
      : `Shop ${shortId(member.shop_id)}`;

    return {
      href: shop ? `/platform/shops/${shop.shop_id}` : undefined,
      label: shopLabel,
      value: [
        `role ${formatToken(member.role_id)}`,
        `membership ${formatToken(member.membership_status)}`,
        `shop ${shop ? shopStatusLabel(shop.shop_status) : "Not visible"}`,
        `operational ${membershipOperationalLabel(member, shop)}`,
      ].join(" / "),
    };
  });
}

function shopCodesForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  return operationalMembershipRowsForProfile(profileId, shops, members).map(
    (member) => shopCodeById(shops, member.shop_id),
  );
}

function shopAccessSummaryForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  const shopCodes = shopCodesForProfile(profileId, shops, members);
  const nonOperationalCount = nonOperationalMembershipsForProfile(
    profileId,
    shops,
    members,
  ).length;

  if (shopCodes.length === 0) {
    return nonOperationalCount > 0
      ? `0 operational shops\n${nonOperationalCount} historical/non-operational`
      : "0 operational shops";
  }

  if (shopCodes.length === 1) {
    return nonOperationalCount > 0
      ? `1 operational shop\n${shopCodes[0]}\n${nonOperationalCount} historical/non-operational`
      : `1 operational shop\n${shopCodes[0]}`;
  }

  const visibleCodes = shopCodes.slice(0, 2).join(", ");
  const overflow =
    shopCodes.length > 2 ? `\n+${shopCodes.length - 2} more` : "";
  const historical =
    nonOperationalCount > 0
      ? `\n${nonOperationalCount} historical/non-operational`
      : "";

  return `${shopCodes.length} operational shops\n${visibleCodes}${overflow}${historical}`;
}

function hasAnyShopAccess(account: PlatformUserAccountSummary) {
  return (
    account.totalMembershipCount > 0 ||
    account.membershipCount > 0 ||
    Boolean(account.mobileInventoryData.shopId)
  );
}

function shopAccessFilterLabelForAccount(account: PlatformUserAccountSummary) {
  return hasAnyShopAccess(account) ? "Has shop" : "No shop";
}

function shopAccessTableValueForAccount(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
) {
  return [
    shopAccessFilterLabelForAccount(account),
    shopAdminAccessStateForProfile(account.profileId, readModel),
    shopAccessSummaryForProfile(
      account.profileId,
      readModel.shops,
      readModel.shopMembers,
    ),
  ].join("\n");
}

function accessSummaryForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  const access = new Set<string>();
  const operationalMemberships = operationalMembershipRowsForProfile(
    profileId,
    readModel.shops,
    readModel.shopMembers,
  );

  if (readModel.platformAdminProfileIds.includes(profileId)) {
    access.add("Platform Admin (Master Console)");
  }

  if (
    operationalMemberships.some((member) => member.role_id === "shop_owner")
  ) {
    access.add("Shop owner");
  }

  if (
    operationalMemberships.some((member) => member.role_id === "shop_manager")
  ) {
    access.add("Shop manager");
  }

  for (const member of operationalMemberships) {
    if (member.role_id !== "shop_owner" && member.role_id !== "shop_manager") {
      access.add(formatToken(member.role_id));
    }
  }

  if (operationalMemberships.length === 0) {
    access.add("No shop access");
  }

  return Array.from(access).join("\n");
}

function primaryRoleForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  if (readModel.platformAdminProfileIds.includes(profileId)) {
    return "Platform Admin (Master Console)";
  }

  const operationalMemberships = operationalMembershipRowsForProfile(
    profileId,
    readModel.shops,
    readModel.shopMembers,
  );

  return operationalMemberships[0]?.role_id
    ? formatToken(operationalMemberships[0].role_id)
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

function syncEventsForShop(
  syncEvents: readonly PlatformSyncOverview[],
  mappings: PlatformAdminLiveReadModel["shopOwnerMappings"],
  shopId: string,
) {
  const ownerIds = new Set(
    mappings
      .filter((mapping) => mapping.shopId === shopId && mapping.ownerUserId)
      .map((mapping) => mapping.ownerUserId as string),
  );

  return syncEvents.filter((event) => ownerIds.has(event.owner_user_id));
}

function staffSafeReadIssue(readModel: PlatformAdminLiveReadModel) {
  return readModel.readIssues.find(
    (issue) => issue.area === "staff_accounts_safe",
  );
}

function mobileInventoryDataStatusLabel(
  mobileInventoryData: PlatformUserAccountSummary["mobileInventoryData"],
) {
  switch (mobileInventoryData.status) {
    case "none":
      return "No mobile data";
    case "present":
      if (
        mobileInventoryData.shopInventoryMappingState === "mapped" &&
        mobileInventoryData.shopId
      ) {
        return "Mobile data linked to shop";
      }

      return "Mobile data present";
    case "unavailable":
      return "Data status unavailable";
  }
}

function mobileInventoryInspectorStatus(
  mobileInventoryData: PlatformUserAccountSummary["mobileInventoryData"],
) {
  switch (mobileInventoryData.status) {
    case "none":
      return "No mobile data";
    case "present":
      return "Present";
    case "unavailable":
      return "Not available";
  }
}

function mobileInventoryCountValue(value: number | null) {
  return typeof value === "number" ? String(value) : "Not available";
}

function mobileInventoryShopLinkLabel(
  mobileInventoryData: PlatformUserAccountSummary["mobileInventoryData"],
  readModel: PlatformAdminLiveReadModel,
) {
  if (mobileInventoryData.shopInventoryMappingState === "mapped") {
    return mobileInventoryData.shopId
      ? `Linked to ${shopNameById(readModel.shops, mobileInventoryData.shopId)}`
      : "Linked shop not visible";
  }

  return "Not assigned to a shop yet";
}

function mobileInventoryDataLinkedToShop(
  mobileInventoryData: PlatformUserAccountSummary["mobileInventoryData"],
) {
  return (
    mobileInventoryData.status === "present" &&
    mobileInventoryData.shopInventoryMappingState === "mapped" &&
    Boolean(mobileInventoryData.shopId)
  );
}

function mobileInventoryShopHref(
  mobileInventoryData: PlatformUserAccountSummary["mobileInventoryData"],
) {
  return mobileInventoryData.shopId
    ? `/platform/shops/${mobileInventoryData.shopId}`
    : undefined;
}

function mobileInventoryDataFields(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
): RowDetailField[] {
  const mobileInventoryData = account.mobileInventoryData;

  if (mobileInventoryDataLinkedToShop(mobileInventoryData)) {
    return [
      {
        label: "Status",
        value: mobileInventoryDataStatusLabel(mobileInventoryData),
      },
      {
        label: "Scope",
        value: "Owner-scoped mobile data",
      },
      {
        href: mobileInventoryShopHref(mobileInventoryData),
        label: "Linked shop",
        value: mobileInventoryShopLinkLabel(mobileInventoryData, readModel),
      },
      {
        label: "Mapping state",
        value: formatToken(mobileInventoryData.shopInventoryMappingState),
      },
      {
        href: mobileInventoryShopHref(mobileInventoryData),
        label: "Managed through linked shop",
        value: "Managed through linked shop",
      },
    ];
  }

  return [
    {
      label: "Status",
      value: mobileInventoryInspectorStatus(mobileInventoryData),
    },
    {
      label: "Scope",
      value: "Owner-scoped mobile data",
    },
    {
      label: "Shop link",
      value: mobileInventoryShopLinkLabel(mobileInventoryData, readModel),
    },
    {
      label: "Products",
      value: mobileInventoryCountValue(mobileInventoryData.productsCount),
    },
    {
      label: "Suppliers",
      value: mobileInventoryCountValue(mobileInventoryData.suppliersCount),
    },
    {
      label: "Categories",
      value: mobileInventoryCountValue(mobileInventoryData.categoriesCount),
    },
    {
      label: "Price history rows",
      value: mobileInventoryCountValue(mobileInventoryData.productPricesCount),
    },
    {
      label: "History sessions",
      value: mobileInventoryCountValue(
        mobileInventoryData.sharedSheetSessionsCount,
      ),
    },
    {
      label: "Sync events",
      value: mobileInventoryCountValue(mobileInventoryData.syncEventsCount),
    },
  ];
}

function mobileInventoryDataNotes(
  account: PlatformUserAccountSummary,
): string[] {
  if (mobileInventoryDataLinkedToShop(account.mobileInventoryData)) {
    return ["Managed through linked shop."];
  }

  return [
    "Create a shop and link this account as owner to move this account into the normal Shop Admin flow.",
  ];
}

function userAccountDiagnostics(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
) {
  const duplicateCount = readModel.userAccounts.filter(
    (candidate) =>
      candidate.profileId !== account.profileId &&
      candidate.displayName === account.displayName,
  ).length;

  return [
    {
      label: "Profile sync state",
      value: profileSyncStateLabel(account.profileSyncState),
    },
    {
      label: "Auth identity summary",
      value:
        readModel.authIdentityStatus.status === "ready"
          ? "Available through safe server DTO"
          : (readModel.authIdentityStatus.reason ?? "Unavailable"),
    },
    {
      label: "Duplicate display name",
      value:
        duplicateCount > 0
          ? `${duplicateCount} duplicate visible`
          : "None visible",
    },
    {
      label: "No operational shop access",
      value: account.membershipCount === 0 ? "Yes" : "No",
    },
  ];
}

function accountAccessSummaryFields(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
): RowDetailField[] {
  const canAccessMasterConsole = hasPlatformAdminAccess(
    account.profileId,
    readModel,
  );
  const canAccessShopAdminConsole = canAccessAdminConsole(
    account.profileId,
    readModel,
  );
  const historicalAdminMemberships = historicalShopAdminMembershipsForProfile(
    account.profileId,
    readModel.shops,
    readModel.shopMembers,
  );

  return [
    {
      label: "Classification",
      value: accountTypeLabelForProfile(account.profileId, readModel),
    },
    {
      label: "Can access Master Console",
      value: canAccessMasterConsole ? "Yes" : "No",
    },
    ...(canAccessMasterConsole
      ? [
          {
            href: "/platform/admins",
            label: "Platform Admin grant",
            value: "View Platform Admin grant",
          },
        ]
      : []),
    {
      label: "Can access Admin Console now",
      value: canAccessShopAdminConsole ? "Yes" : "No",
    },
    {
      label: "Historical shop access",
      value:
        historicalAdminMemberships.length > 0
          ? `${historicalAdminMemberships.length} historical shop${historicalAdminMemberships.length === 1 ? "" : "s"}`
          : "None",
    },
    {
      label: "Operational shops",
      value: String(account.membershipCount),
    },
    {
      label: "Historical shops",
      value: String(account.nonOperationalMembershipCount),
    },
  ];
}

function shopDeviceSummary(shop: Shop, readModel: PlatformAdminLiveReadModel) {
  const devices = readModel.shopDevices.filter(
    (device) => device.shop_id === shop.shop_id,
  );

  if (devices.length === 0) {
    return "No devices visible";
  }

  const active = devices.filter((device) => device.status === "active").length;
  const revoked = devices.filter(
    (device) => device.status === "revoked",
  ).length;
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
    latestSync
      ? `Sync ${formatToken(latestSync.event_type)}`
      : "Sync not visible",
    latestAudit
      ? `Audit ${formatToken(latestAudit.result)}`
      : "Audit not visible",
  ].join("\n");
}

function shopInventorySourceMappingForShop(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
) {
  const mappings = readModel.shopOwnerMappings.filter(
    (mapping) => mapping.shopId === shop.shop_id,
  );

  return (
    mappings.find((mapping) => mapping.mappingState === "mapped") ?? mappings[0]
  );
}

function shopInventorySourceAccount(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
) {
  const mapping = shopInventorySourceMappingForShop(shop, readModel);

  if (!mapping?.ownerUserId) {
    return undefined;
  }

  return readModel.userAccounts.find(
    (account) => account.profileId === mapping.ownerUserId,
  );
}

function ownerAccountLabelForInventorySource(
  account: PlatformUserAccountSummary | undefined,
  ownerUserId: string | null | undefined,
) {
  if (!account) {
    return ownerUserId ? `Profile ${shortId(ownerUserId)}` : "Not available";
  }

  return accountSafeEmail(account) || accountPrimaryLabel(account);
}

function shopInventorySourceTableValue(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
) {
  const mapping = shopInventorySourceMappingForShop(shop, readModel);

  if (!mapping) {
    return "No inventory source";
  }

  if (mapping.mappingState === "mapped") {
    return "Inventory source mapped";
  }

  return `Inventory source ${formatToken(mapping.mappingState)}`;
}

function linkedMobileInventorySourceFields(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
): RowDetailField[] {
  const mapping = shopInventorySourceMappingForShop(shop, readModel);

  if (!mapping) {
    return [
      { label: "Status", value: "No inventory source" },
      { label: "Source kind", value: "Not available" },
      { label: "Owner account", value: "Not available" },
      { label: "Mapping state", value: "Not configured" },
    ];
  }

  const account = shopInventorySourceAccount(shop, readModel);
  const mobileInventoryData = account?.mobileInventoryData;
  const ownerAccountHref = account
    ? `/platform/users/${account.profileId}`
    : undefined;
  const ownerProfileId = account?.profileId ?? mapping.ownerUserId ?? undefined;

  return [
    {
      label: "Status",
      value:
        mapping.mappingState === "mapped"
          ? "Mapped"
          : formatToken(mapping.mappingState),
    },
    {
      label: "Source kind",
      value: formatToken(mapping.sourceKind),
    },
    {
      href: ownerAccountHref,
      label: "Owner account",
      value: ownerAccountLabelForInventorySource(account, mapping.ownerUserId),
    },
    {
      label: "Platform Admin overlap",
      value: platformAdminOverlapLabel(ownerProfileId, readModel),
    },
    {
      label: "Products",
      value: mobileInventoryCountValue(
        mobileInventoryData?.productsCount ?? null,
      ),
    },
    {
      label: "Suppliers",
      value: mobileInventoryCountValue(
        mobileInventoryData?.suppliersCount ?? null,
      ),
    },
    {
      label: "Categories",
      value: mobileInventoryCountValue(
        mobileInventoryData?.categoriesCount ?? null,
      ),
    },
    {
      label: "Price history rows",
      value: mobileInventoryCountValue(
        mobileInventoryData?.productPricesCount ?? null,
      ),
    },
    {
      label: "History sessions",
      value: mobileInventoryCountValue(
        mobileInventoryData?.sharedSheetSessionsCount ?? null,
      ),
    },
    {
      label: "Sync events",
      value: mobileInventoryCountValue(
        mobileInventoryData?.syncEventsCount ?? null,
      ),
    },
    {
      label: "Mapping state",
      value: formatToken(mapping.mappingState),
    },
  ];
}

function linkedMobileInventorySourceNotes(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
) {
  const mapping = shopInventorySourceMappingForShop(shop, readModel);

  if (mapping?.mappingState === "mapped") {
    return ["Owner-scoped mobile data mapped to this shop"];
  }

  return [
    "No owner-scoped mobile inventory source is mapped to this shop through the current read boundary.",
  ];
}

function primaryOwnerMemberForShop(shop: Shop, members: readonly ShopMember[]) {
  return (
    operationalMembershipsForShop(shop, members).find(
      (member) => member.role_id === "shop_owner",
    ) ??
    members.find(
      (member) =>
        member.role_id === "shop_owner" &&
        member.membership_status === "active",
    )
  );
}

function primaryOwnerProfileIdForShop(
  shop: Shop,
  members: readonly ShopMember[],
  readModel: PlatformAdminLiveReadModel,
) {
  return (
    primaryOwnerMemberForShop(shop, members)?.profile_id ??
    shopInventorySourceMappingForShop(shop, readModel)?.ownerUserId ??
    undefined
  );
}

function shopOwnerLinkedLabel(
  shop: Shop,
  members: readonly ShopMember[],
  readModel: PlatformAdminLiveReadModel,
) {
  return primaryOwnerProfileIdForShop(shop, members, readModel)
    ? "Owner linked"
    : "Unassigned";
}

function shopInventorySourceStatusLabel(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
) {
  const mapping = shopInventorySourceMappingForShop(shop, readModel);

  if (!mapping) {
    return "No inventory source";
  }

  return mapping.mappingState === "mapped"
    ? "Inventory mapped"
    : formatToken(mapping.mappingState);
}

function platformAdminOverlapLabel(
  profileId: string | undefined,
  readModel: PlatformAdminLiveReadModel,
) {
  if (!profileId) {
    return "No global access";
  }

  return hasPlatformAdminAccess(profileId, readModel)
    ? "Platform Admin\nMaster Console role only"
    : "No global access";
}

function userRowDetail(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
): RowDetailPanel {
  const memberships = membershipsForProfile(
    account.profileId,
    readModel.shops,
    readModel.shopMembers,
  );
  const audits = readModel.auditLogs.filter(
    (log) => log.actor_profile_id === account.profileId,
  );
  const canAccessMasterConsole = hasPlatformAdminAccess(
    account.profileId,
    readModel,
  );
  const canAccessShopAdminConsole = canAccessAdminConsole(
    account.profileId,
    readModel,
  );
  const shopRoles = shopRolesForProfile(
    account.profileId,
    readModel.shops,
    readModel.shopMembers,
  );

  return {
    groups: [
      {
        fields: accountAccessSummaryFields(account, readModel),
        title: "Summary",
      },
      {
        fields: [
          { label: "Display name", value: account.displayName },
          { label: "Profile ID", value: account.profileId },
          {
            label: "Status",
            value: profileSyncStateLabel(account.profileSyncState),
          },
          {
            label: "Profile status",
            value: formatToken(account.profileStatus),
          },
        ],
        title: "Identity",
      },
      {
        fields: [
          { label: "Email", value: account.email },
          { label: "Provider", value: account.provider },
          { label: "Provider type", value: formatToken(account.providerType) },
          {
            label: "Capture state",
            value:
              readModel.authIdentityStatus.status === "ready"
                ? "Auth identity is captured through the safe server DTO."
                : (readModel.authIdentityStatus.reason ??
                  "Auth identity unavailable."),
          },
        ],
        notes: ["No auth secret fields are queried or rendered."],
        title: "Account origin",
      },
      {
        fields: [
          {
            label: "Account type",
            value: accountTypeLabelForProfile(account.profileId, readModel),
          },
          {
            label: "Can access Master Console",
            value: canAccessMasterConsole ? "Yes" : "No",
          },
          {
            label: "Can access Admin Console",
            value: canAccessShopAdminConsole ? "Yes" : "No",
          },
          {
            label: "Admin Console access",
            value: shopAdminAccessSummaryForProfile(
              account.profileId,
              readModel.shops,
              readModel.shopMembers,
            ),
          },
          {
            label: "Global access",
            value: globalAccessSummaryForProfile(account.profileId, readModel),
          },
          {
            label: "Shop roles",
            value: shopRoles.join("\n") || "No operational shop role",
          },
          {
            label: "Join source",
            value: "Not captured in current read model",
          },
          {
            label: "Primary role",
            value: primaryRoleForProfile(account.profileId, readModel),
          },
          {
            label: "Shop access state",
            value: shopAccessStateLabel(account.shopAccessState),
          },
        ],
        notes: [
          "Admin account means a personal account with shop-scoped Admin Console access through shop_members.",
          "platform_admin means global Master Console access; it is not created by linking a shop code.",
          "POS staff and manager 1001 stay in staff/shop-code principals, separate from personal accounts.",
        ],
        title: "Account classification",
      },
      {
        fields: [
          {
            label: "Operational shops",
            value: String(account.membershipCount),
          },
          {
            label: "Historical/non-operational",
            value: String(account.nonOperationalMembershipCount),
          },
          {
            label: "Returned membership records",
            value: String(account.totalMembershipCount),
          },
          {
            label: "Membership summary",
            value: memberships.join("\n") || "None",
          },
        ],
        title: "Shop memberships",
      },
      {
        fields: mobileInventoryDataFields(account, readModel),
        notes: mobileInventoryDataNotes(account),
        title: "Mobile inventory data",
      },
      {
        fields: [
          { label: "Linked events", value: String(audits.length) },
          {
            label: "Latest event",
            value: audits[0]?.event ?? "No visible audit event",
          },
        ],
        title: "Recent audit",
      },
      {
        fields: userAccountDiagnostics(account, readModel),
        title: "Diagnostics",
      },
    ],
    href: `/platform/users/${account.profileId}`,
    notes: [
      "Email and provider are returned only by a minimal server-side Auth identity DTO.",
      "No auth secret fields are queried or rendered.",
    ],
    rowKey: account.profileId,
    subtitle: `Profile ID ${shortId(account.profileId)} / ${profileSyncStateLabel(account.profileSyncState)} / ${shopAccessSummaryForProfile(
      account.profileId,
      readModel.shops,
      readModel.shopMembers,
    ).replace(/\n/g, " ")}`,
    title: accountPrimaryLabel(account),
  };
}

function shopAdminLinkedShopId(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
) {
  if (account.mobileInventoryData.shopId) {
    return account.mobileInventoryData.shopId;
  }

  return currentShopAdminMembershipsForProfile(
    account.profileId,
    readModel.shops,
    readModel.shopMembers,
  )[0]?.shop_id;
}

function shopAdminLinkedShopLabel(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
) {
  const shopId = shopAdminLinkedShopId(account, readModel);

  if (!shopId) {
    return "Not assigned to a shop yet";
  }

  return `Linked to ${shopNameById(readModel.shops, shopId)}`;
}

function shopAdminNavigationFields(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
): RowDetailField[] {
  const shopId = shopAdminLinkedShopId(account, readModel);
  const fields: RowDetailField[] = [];

  if (shopId) {
    fields.push({
      href: `/platform/shops/${shopId}`,
      label: "Open linked shop",
      value: "Open linked shop",
    });
  }

  if (hasPlatformAdminAccess(account.profileId, readModel)) {
    fields.push({
      href: "/platform/admins",
      label: "Open Platform Admin grant",
      value: "Open Platform Admin grant",
    });
  }

  fields.push({
    href: `/platform/users/${account.profileId}`,
    label: "Open account detail",
    value: "Open account detail",
  });

  return fields;
}

function shopAdminMobileInventoryFields(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
): RowDetailField[] {
  const mobileInventoryData = account.mobileInventoryData;
  const shopId = shopAdminLinkedShopId(account, readModel);

  return [
    {
      label: "Data status",
      value: mobileInventoryDataStatusLabel(mobileInventoryData),
    },
    {
      label: "Scope",
      value: "Owner-scoped mobile data",
    },
    {
      href: shopId ? `/platform/shops/${shopId}` : undefined,
      label: "Linked shop",
      value: shopAdminLinkedShopLabel(account, readModel),
    },
    {
      label: "Inventory source",
      value: mobileInventoryDataLinkedToShop(mobileInventoryData)
        ? "Owner-scoped mobile data mapped to this shop"
        : "Not assigned to a shop yet",
    },
    {
      label: "Mapping state",
      value: formatToken(mobileInventoryData.shopInventoryMappingState),
    },
  ];
}

function shopAdminDetailGroups(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
) {
  const audits = readModel.auditLogs.filter(
    (log) => log.actor_profile_id === account.profileId,
  );

  return [
    {
      fields: [
        {
          label: "Current access",
          value: shopAdminAccessSummaryForProfile(
            account.profileId,
            readModel.shops,
            readModel.shopMembers,
          ),
        },
        {
          label: "Roles",
          value: shopAdminRolesSummaryForProfile(account.profileId, readModel),
        },
        {
          label: "Linked shop",
          value: shopAdminLinkedShopLabel(account, readModel),
          href: shopAdminLinkedShopId(account, readModel)
            ? `/platform/shops/${shopAdminLinkedShopId(account, readModel)}`
            : undefined,
        },
        {
          label: "Platform Admin overlap",
          value: globalAccessSummaryForProfile(account.profileId, readModel),
        },
      ],
      title: "Summary",
    },
    {
      fields: [
        { label: "Display name", value: account.displayName },
        { label: "Email", value: account.email },
        { label: "Profile ID", value: account.profileId },
        { label: "Profile status", value: formatToken(account.profileStatus) },
        {
          label: "Profile/Auth state",
          value: profileSyncStateLabel(account.profileSyncState),
        },
      ],
      notes: ["No auth secret fields are queried or rendered."],
      title: "Identity",
    },
    {
      fields: [
        {
          label: "Admin Console access",
          value: shopAdminAccessSummaryForProfile(
            account.profileId,
            readModel.shops,
            readModel.shopMembers,
          ),
        },
        {
          label: "Shop roles",
          value:
            shopRolesForProfile(
              account.profileId,
              readModel.shops,
              readModel.shopMembers,
            ).join("\n") || "No operational shop role",
        },
        ...membershipFieldsForProfile(
          account.profileId,
          readModel.shops,
          readModel.shopMembers,
        ),
      ],
      notes: [
        "Shop Admin access is shop-scoped through shop_members. It is separate from Platform Admin global access.",
      ],
      title: "Shop Admin access",
    },
    {
      fields: shopAdminMobileInventoryFields(account, readModel),
      notes: [
        "Mobile inventory counts are shown on the linked shop record when an owner-scoped source is mapped.",
      ],
      title: "Linked mobile inventory",
    },
    {
      fields: shopAdminNavigationFields(account, readModel),
      title: "Actions",
    },
    {
      fields: [
        { label: "Linked events", value: String(audits.length) },
        {
          label: "Latest event",
          value: audits[0]?.event ?? "No visible audit event",
        },
      ],
      title: "Recent audit",
    },
  ];
}

function shopAdminRowDetail(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
): RowDetailPanel {
  return {
    groups: shopAdminDetailGroups(account, readModel),
    href: `/platform/users/${account.profileId}`,
    notes: [
      "Shop Admin detail stays in the shop_members context. Open the personal account only when identity diagnostics are needed.",
    ],
    rowKey: account.profileId,
    subtitle: `${shopAdminAccessStateForProfile(
      account.profileId,
      readModel,
    )} / ${shopAdminShopsSummaryForProfile(
      account.profileId,
      readModel,
    ).replace(/\n/g, " ")}`,
    title: accountPrimaryLabel(account),
  };
}

function shopRowDetail(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
): RowDetailPanel {
  const owners = activeOwnerNamesForShop(
    shop,
    readModel.profiles,
    readModel.shopMembers,
  );
  const members = readModel.shopMembers.filter(
    (member) => member.shop_id === shop.shop_id,
  );
  const devices = readModel.shopDevices.filter(
    (device) => device.shop_id === shop.shop_id,
  );
  const latestSync = latestSyncForShop(
    readModel.syncEvents,
    readModel.shopOwnerMappings,
    shop.shop_id,
  );
  const audits = readModel.auditLogs.filter(
    (log) => log.shop_id === shop.shop_id,
  );
  const fiscalRows = [
    { label: "Company RUT", value: configuredRut(shop.company_rut) },
    { label: "Giro", value: shop.business_giro ?? "Not configured" },
    { label: "Address", value: shop.business_address ?? "Not configured" },
    { label: "City", value: shop.business_city ?? "Not configured" },
    {
      label: "Legal representative RUT",
      value: configuredRut(shop.legal_representative_rut),
    },
    {
      label: "Managed by",
      value:
        shop.fiscal_identity_locked_by_platform === false
          ? "Unlocked"
          : "Master Console",
    },
  ];

  return {
    groups: [
      {
        fields: [
          { label: "Shop name", value: shop.shop_name },
          { label: "Shop code", value: shop.shop_code },
          { label: "Shop ID", value: shop.shop_id },
          { label: "Status", value: shopStatusLabel(shop.shop_status) },
          {
            label: "Meaning",
            value: shopStatusDescription(shop.shop_status),
          },
          {
            label: "Operational access",
            value: shopOperationalAccessLabel(shop.shop_status),
          },
        ],
        title: "Overview",
      },
      {
        fields: fiscalRows,
        notes: ["Fiscal / Boleta identity is managed by Master Console."],
        title: "Fiscal / Boleta identity",
      },
      {
        fields: [
          { label: "Owners", value: owners.join("\n") || "Unassigned" },
          {
            label: "Members",
            value: memberSummaryForShop(shop, readModel.shopMembers),
          },
          {
            label: "Operational members",
            value: String(operationalMembershipsForShop(shop, members).length),
          },
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
        fields: linkedMobileInventorySourceFields(shop, readModel),
        notes: linkedMobileInventorySourceNotes(shop, readModel),
        title: "Linked mobile inventory source",
      },
      {
        fields: [
          { label: "Summary", value: shopDeviceSummary(shop, readModel) },
          {
            label: "Latest device update",
            value: devices[0]?.updated_at
              ? devices[0].updated_at
              : "No devices visible",
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
          {
            label: "Latest audit",
            value: audits[0]?.event ?? "No audit event visible",
          },
        ],
        notes:
          latestSync || audits.length > 0
            ? [
                "Device and sync values are support signals, not daily device management.",
              ]
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
    subtitle: `Shop code ${shop.shop_code} / ${shopStatusLabel(shop.shop_status)} / ${shopOperationalAccessLabel(shop.shop_status)}`,
    title: shop.shop_name,
  };
}

type AccountDetailContext = "shopAdmins" | "users";

function userDetailSections(
  account: PlatformUserAccountSummary,
  readModel: PlatformAdminLiveReadModel,
  context: AccountDetailContext = "users",
) {
  const audits = readModel.auditLogs.filter(
    (log) => log.actor_profile_id === account.profileId,
  );
  const canAccessMasterConsole = hasPlatformAdminAccess(
    account.profileId,
    readModel,
  );
  const canAccessShopAdminConsole = canAccessAdminConsole(
    account.profileId,
    readModel,
  );
  const shopRoles = shopRolesForProfile(
    account.profileId,
    readModel.shops,
    readModel.shopMembers,
  );
  const shopAdminContextSections =
    context === "shopAdmins"
      ? [
          {
            fields: [
              {
                label: "Current shop access",
                value: shopAdminAccessSummaryForProfile(
                  account.profileId,
                  readModel.shops,
                  readModel.shopMembers,
                ),
              },
              {
                label: "Role",
                value: shopAdminRolesSummaryForProfile(
                  account.profileId,
                  readModel,
                ),
              },
              {
                href: shopAdminLinkedShopId(account, readModel)
                  ? `/platform/shops/${shopAdminLinkedShopId(account, readModel)}`
                  : undefined,
                label: "Linked shop",
                value: shopAdminLinkedShopLabel(account, readModel),
              },
              {
                label: "Admin Console access",
                value: canAccessShopAdminConsole ? "Current" : "Not current",
              },
            ],
            notes: [
              "Filtered Shop Admin view: this account is shown here because it has owner or manager shop_members context.",
            ],
            title: "Shop Admin context",
          },
        ]
      : [];

  return [
    {
      fields: [
        { label: "Account label", value: accountPrimaryLabel(account) },
        { label: "Display name", value: account.displayName },
        { label: "Email", value: account.email },
        { label: "Provider", value: account.provider },
        { label: "Provider type", value: formatToken(account.providerType) },
        { label: "Profile ID", value: account.profileId },
        { label: "Short ID", value: shortId(account.profileId) },
        {
          label: "Status",
          value: profileSyncStateLabel(account.profileSyncState),
        },
        { label: "Profile status", value: formatToken(account.profileStatus) },
        {
          label: "Capture state",
          value:
            readModel.authIdentityStatus.status === "ready"
              ? "Auth identity is captured through the safe server DTO."
              : (readModel.authIdentityStatus.reason ??
                "Auth identity unavailable."),
        },
      ],
      notes: ["No auth secret fields are queried or rendered."],
      title: "Identity",
    },
    ...shopAdminContextSections,
    {
      fields: [
        {
          label: "Account type",
          value: accountTypeLabelForProfile(account.profileId, readModel),
        },
        {
          label: "Can access Master Console",
          value: canAccessMasterConsole ? "Yes" : "No",
        },
        {
          label: "Can access Admin Console",
          value: canAccessShopAdminConsole ? "Yes" : "No",
        },
        {
          label: "Admin Console access",
          value: shopAdminAccessSummaryForProfile(
            account.profileId,
            readModel.shops,
            readModel.shopMembers,
          ),
        },
        {
          label: "Global access",
          value: globalAccessSummaryForProfile(account.profileId, readModel),
        },
      ],
      notes: [
        "platform_admin means global Master Console access; it is not created by linking a shop code.",
      ],
      title: "Global access",
    },
    {
      fields: [
        { label: "Operational shops", value: String(account.membershipCount) },
        {
          label: "Historical/non-operational",
          value: String(account.nonOperationalMembershipCount),
        },
        {
          label: "Returned membership records",
          value: String(account.totalMembershipCount),
        },
        ...membershipFieldsForProfile(
          account.profileId,
          readModel.shops,
          readModel.shopMembers,
        ),
        {
          label: "Shop roles",
          value: shopRoles.join("\n") || "No operational shop role",
        },
        {
          label: "Shop access state",
          value: shopAccessStateLabel(account.shopAccessState),
        },
      ],
      notes: [
        "Admin account means a personal account with shop-scoped Admin Console access through shop_members.",
        "POS staff and manager 1001 stay in staff/shop-code principals, separate from personal accounts.",
      ],
      title: "Shop memberships",
    },
    {
      fields: mobileInventoryDataFields(account, readModel),
      notes: mobileInventoryDataNotes(account),
      title: "Mobile data / linked shop",
    },
    {
      fields: [
        { label: "Linked events", value: String(audits.length) },
        {
          label: "Latest event",
          value: audits[0]?.event ?? "No visible audit event",
        },
      ],
      title: "Audit",
    },
    {
      fields: userAccountDiagnostics(account, readModel),
      title: "Diagnostics",
    },
  ];
}

function shopProfileFiscalFields(shop: Shop) {
  const identityFields = [
    { label: "Shop name", value: shop.shop_name },
    { label: "Shop code", value: shop.shop_code },
    { label: "Shop ID", value: shop.shop_id },
    { label: "Status", value: shopStatusLabel(shop.shop_status) },
    { label: "Created", value: shop.created_at },
    { label: "Updated", value: shop.updated_at ?? "Not configured" },
  ];

  if (!hasConfiguredFiscalIdentity(shop)) {
    return [
      ...identityFields,
      { label: "Fiscal identity", value: "Fiscal identity not configured" },
      {
        label: "Managed by",
        value:
          shop.fiscal_identity_locked_by_platform === false
            ? "Unlocked"
            : "Master Console",
      },
    ];
  }

  return [
    ...identityFields,
    { label: "Fiscal identity", value: "Configured" },
    { label: "Company RUT", value: configuredRut(shop.company_rut) },
    { label: "Giro", value: configuredValue(shop.business_giro) },
    { label: "Address", value: configuredValue(shop.business_address) },
    { label: "City", value: configuredValue(shop.business_city) },
    {
      label: "Legal representative RUT",
      value: configuredRut(shop.legal_representative_rut),
    },
    {
      label: "Managed by",
      value:
        shop.fiscal_identity_locked_by_platform === false
          ? "Unlocked"
          : "Master Console",
    },
  ];
}

function availableLifecycleActionsForShop(shop: Shop) {
  const actions = [
    shop.shop_status === "pending_setup" &&
    canTransitionShopStatus(shop.shop_status, "activate")
      ? "Activate to Active"
      : null,
    shop.shop_status === "suspended" &&
    canTransitionShopStatus(shop.shop_status, "reactivate")
      ? "Reactivate to Active"
      : null,
    shop.shop_status === "archived" &&
    canTransitionShopStatus(shop.shop_status, "restore")
      ? "Restore to Active"
      : null,
    shop.shop_status === "active" &&
    canTransitionShopStatus(shop.shop_status, "suspend")
      ? "Suspend"
      : null,
    shop.shop_status !== "archived" &&
    canTransitionShopStatus(shop.shop_status, "soft_delete")
      ? "Archive"
      : null,
  ].filter((action): action is string => Boolean(action));

  return actions.length > 0
    ? actions.join("\n")
    : "No lifecycle action available";
}

export type PlatformShopAccessMembership = {
  accountState: string;
  canRevoke: boolean;
  displayName: string;
  email: string;
  membershipStatus: string;
  operationalAccess: string;
  profileId: string;
  profileStatus: string;
  roleId: string;
  shopMemberId: string;
};

export type PlatformShopAccessCandidate = {
  accountState: string;
  assignable: boolean;
  disabledReason?: string;
  displayName: string;
  email: string;
  profileId: string;
  profileStatus: string;
};

export type PlatformShopDependencyPreviewItem = {
  label: string;
  managedByForcePurge: boolean;
  value: string;
  blocksPurge: boolean;
};

type PlatformShopPurgePreview = {
  counts: Record<string, number>;
  forceBlockingReasons: readonly string[];
  normalBlockingReasons: readonly string[];
};

export type PlatformShopAccessManagementForRequest =
  | {
      reason: string;
      status:
        | Exclude<PlatformAdminLiveReadModel["status"], "ready">
        | "not_found";
    }
  | {
      candidates: readonly PlatformShopAccessCandidate[];
      dependencies: readonly PlatformShopDependencyPreviewItem[];
      memberships: readonly PlatformShopAccessMembership[];
      purgeBlockedReasons: readonly string[];
      searchQuery: string;
      shop: {
        shopCode: string;
        shopId: string;
        shopName: string;
        shopStatus: Shop["shop_status"];
      };
      status: "ready";
    };

function accountSummaryForProfile(
  profileId: string,
  readModel: PlatformAdminLiveReadModel,
) {
  const account = readModel.userAccounts.find(
    (candidate) => candidate.profileId === profileId,
  );
  const profile = readModel.profiles.find(
    (candidate) => candidate.profile_id === profileId,
  );

  return {
    accountState: account
      ? profileSyncStateLabel(account.profileSyncState)
      : "Profile only",
    displayName:
      account?.displayName ??
      profile?.display_name ??
      `Profile ${shortId(profileId)}`,
    email: account?.email ?? "Auth identity unavailable",
    profileStatus: formatToken(
      account?.profileStatus ?? profile?.profile_status ?? "review",
    ),
  };
}

function shopAccessMemberships(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
): PlatformShopAccessMembership[] {
  return readModel.shopMembers
    .filter((member) => member.shop_id === shop.shop_id)
    .map((member) => {
      const account = accountSummaryForProfile(member.profile_id, readModel);

      return {
        ...account,
        canRevoke: member.membership_status === "active",
        membershipStatus: formatToken(member.membership_status),
        operationalAccess: membershipOperationalLabel(member, shop),
        profileId: member.profile_id,
        roleId: formatToken(member.role_id),
        shopMemberId: member.shop_member_id,
      };
    });
}

function shopAccessCandidates(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
  searchQuery: string,
): PlatformShopAccessCandidate[] {
  if (!searchQuery) {
    return [];
  }

  const memberProfileIds = new Set(
    readModel.shopMembers
      .filter((member) => member.shop_id === shop.shop_id)
      .map((member) => member.profile_id),
  );

  return readModel.userAccounts.slice(0, 8).map((account) => {
    const alreadyLinked = memberProfileIds.has(account.profileId);
    const assignable =
      !alreadyLinked &&
      account.profileSyncState !== "auth_only" &&
      account.profileStatus === "active";

    return {
      accountState: profileSyncStateLabel(account.profileSyncState),
      assignable,
      disabledReason: alreadyLinked
        ? "Already linked to this shop"
        : account.profileSyncState === "auth_only"
          ? "Auth user has no profile row yet"
          : account.profileStatus !== "active"
            ? "Profile is not active"
            : undefined,
      displayName: account.displayName,
      email: account.email,
      profileId: account.profileId,
      profileStatus: formatToken(account.profileStatus),
    };
  });
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parsePurgePreviewCounts(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const counts: Record<string, number> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    const numeric =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number.parseInt(rawValue, 10)
          : Number.NaN;

    if (Number.isFinite(numeric)) {
      counts[key] = numeric;
    }
  }

  return counts;
}

function parsePurgePreview(value: unknown): PlatformShopPurgePreview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const preview = value as {
    counts?: unknown;
    force_blocking_reasons?: unknown;
    normal_blocking_reasons?: unknown;
    ok?: unknown;
  };

  if (preview.ok !== true) {
    return null;
  }

  return {
    counts: parsePurgePreviewCounts(preview.counts),
    forceBlockingReasons: parseStringArray(preview.force_blocking_reasons),
    normalBlockingReasons: parseStringArray(preview.normal_blocking_reasons),
  };
}

async function loadPlatformShopPurgePreview(
  shopId: string,
): Promise<PlatformShopPurgePreview | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("platform_preview_shop_purge", {
    p_shop_id: shopId,
  });

  if (error) {
    return null;
  }

  return parsePurgePreview(data);
}

function sumPreviewCounts(
  counts: Record<string, number> | undefined,
  keys: readonly string[],
) {
  if (!counts) {
    return undefined;
  }

  return keys.reduce((total, key) => total + (counts[key] ?? 0), 0);
}

function dependencyPreviewItem({
  fallbackCount,
  keys,
  label,
  previewCounts,
}: {
  fallbackCount?: number;
  keys: readonly string[];
  label: string;
  previewCounts?: Record<string, number>;
}): PlatformShopDependencyPreviewItem {
  const count = sumPreviewCounts(previewCounts, keys);
  const knownCount = count ?? fallbackCount;
  const value =
    typeof count === "number"
      ? String(count)
      : typeof fallbackCount === "number"
        ? `${fallbackCount} visible / server-side recheck`
        : "Server-side purge RPC recheck";

  return {
    blocksPurge: (knownCount ?? 0) > 0,
    label,
    managedByForcePurge: true,
    value,
  };
}

function shopDependencyPreview(
  shop: Shop,
  readModel: PlatformAdminLiveReadModel,
  previewCounts?: Record<string, number>,
): PlatformShopDependencyPreviewItem[] {
  const shopId = shop.shop_id;
  const members = readModel.shopMembers.filter(
    (member) => member.shop_id === shopId,
  );
  const ownerMembers = members.filter(
    (member) => member.role_id === "shop_owner",
  );
  const managerMembers = members.filter(
    (member) => member.role_id === "shop_manager",
  );
  const devices = readModel.shopDevices.filter(
    (device) => device.shop_id === shopId,
  );
  const syncEvents = syncEventsForShop(
    readModel.syncEvents,
    readModel.shopOwnerMappings,
    shopId,
  );
  const mobileMappings = readModel.shopOwnerMappings.filter(
    (mapping) => mapping.shopId === shopId,
  );
  const auditLogs = readModel.auditLogs.filter((log) => log.shop_id === shopId);
  const staffRows = readModel.staffSafeRows.filter(
    (row) => row.shop_id === shopId,
  );

  return [
    dependencyPreviewItem({
      fallbackCount: members.length,
      keys: ["shop_members"],
      label: "Membership records",
      previewCounts,
    }),
    dependencyPreviewItem({
      fallbackCount: ownerMembers.length,
      keys: [],
      label: "Owner memberships",
    }),
    dependencyPreviewItem({
      fallbackCount: managerMembers.length,
      keys: [],
      label: "Manager memberships",
    }),
    dependencyPreviewItem({
      keys: ["platform_owner_invites"],
      label: "Pending owner invites",
      previewCounts,
    }),
    dependencyPreviewItem({
      keys: ["inventory_products"],
      label: "Products / catalog rows",
      previewCounts,
    }),
    dependencyPreviewItem({
      keys: ["inventory_categories"],
      label: "Categories",
      previewCounts,
    }),
    dependencyPreviewItem({
      keys: ["inventory_suppliers"],
      label: "Suppliers",
      previewCounts,
    }),
    dependencyPreviewItem({
      keys: ["inventory_product_prices"],
      label: "Price history",
      previewCounts,
    }),
    dependencyPreviewItem({
      fallbackCount: devices.length,
      keys: ["shop_devices"],
      label: "Devices",
      previewCounts,
    }),
    dependencyPreviewItem({
      fallbackCount: syncEvents.length,
      keys: ["sync_events", "shared_sheet_sessions"],
      label: "Sync / history rows",
      previewCounts,
    }),
    dependencyPreviewItem({
      fallbackCount: mobileMappings.length,
      keys: ["shop_inventory_sources"],
      label: "Mobile mappings",
      previewCounts,
    }),
    dependencyPreviewItem({
      fallbackCount: staffRows.length,
      keys: ["staff_accounts", "staff_role_permissions", "staff_web_sessions"],
      label: "Staff rows",
      previewCounts,
    }),
    dependencyPreviewItem({
      keys: ["pos_device_credentials", "pos_sessions"],
      label: "POS links",
      previewCounts,
    }),
    dependencyPreviewItem({
      keys: ["pos_sales_sync_batches", "pos_sales", "pos_sale_lines"],
      label: "POS sales / sync rows",
      previewCounts,
    }),
    dependencyPreviewItem({
      fallbackCount: auditLogs.length,
      keys: ["audit_rows_to_snapshot"],
      label: "Audit rows to snapshot",
      previewCounts,
    }),
  ];
}

function isSyntheticPurgeCandidate(shop: Shop) {
  return (
    /^(TASK|TEST|LOCAL|STAGING|DEV)[A-Z0-9_-]*$/.test(shop.shop_code) ||
    shop.shop_code.includes("_TEST_")
  );
}

function purgeBlockedReasonsForShop(
  shop: Shop,
  dependencies: readonly PlatformShopDependencyPreviewItem[],
  serverForceBlockingReasons: readonly string[] = [],
) {
  const reasons = new Set(serverForceBlockingReasons);

  if (shop.shop_status !== "archived") {
    reasons.add("Shop must be archived before purge.");
  }

  if (!isSyntheticPurgeCandidate(shop)) {
    reasons.add("Purge is limited to synthetic test/local/staging shop codes.");
  }

  for (const dependency of dependencies) {
    if (dependency.blocksPurge && !dependency.managedByForcePurge) {
      reasons.add(`${dependency.label} blocks purge: ${dependency.value}.`);
    }
  }

  return Array.from(reasons);
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
  const audits = readModel.auditLogs.filter(
    (log) => log.shop_id === shop.shop_id,
  );
  const relatedRowsVisible =
    devices.length > 0 || Boolean(sync) || audits.length > 0;
  const operationalMembers = operationalMembershipsForShop(shop, members);
  const owners = operationalMembers.filter(
    (member) => member.role_id === "shop_owner",
  );
  const managers = operationalMembers.filter(
    (member) => member.role_id === "shop_manager",
  );
  const activeOwnerRecords = members.filter(
    (member) =>
      member.role_id === "shop_owner" && member.membership_status === "active",
  );
  const activeManagerRecords = members.filter(
    (member) =>
      member.role_id === "shop_manager" &&
      member.membership_status === "active",
  );
  const primaryOwnerMember = primaryOwnerMemberForShop(shop, members);
  const primaryOwnerProfileId = primaryOwnerProfileIdForShop(
    shop,
    members,
    readModel,
  );
  const primaryOwnerHref = primaryOwnerProfileId
    ? `/platform/users/${primaryOwnerProfileId}`
    : undefined;
  const inventorySourceStatus = shopInventorySourceStatusLabel(shop, readModel);

  return [
    {
      fields: [
        { label: "Status", value: shopStatusLabel(shop.shop_status) },
        {
          label: "Operational access",
          value: shopOperationalAccessState(shop),
        },
        {
          href: primaryOwnerHref,
          label: "Owner account",
          value: accountPrimaryLabelForProfile(
            primaryOwnerProfileId,
            readModel,
          ),
        },
        {
          label: "Inventory source",
          value: inventorySourceStatus,
        },
        { label: "Shop code", value: shop.shop_code },
        { label: "Shop ID", value: shop.shop_id },
        { label: "Created", value: configuredTimestamp(shop.created_at) },
        { label: "Updated", value: configuredTimestamp(shop.updated_at) },
        {
          label: "Managed by",
          value:
            shop.fiscal_identity_locked_by_platform === false
              ? "Unlocked"
              : "Master Console",
        },
      ],
      layout: "full" as const,
      notes: [
        shopOwnerLinkedLabel(shop, members, readModel),
        inventorySourceStatus,
        audits.length > 0 ? "Audit available" : "No audit event visible",
      ],
      title: "Header shop",
    },
    {
      description:
        "Key shop signals grouped before operational sections for quick review.",
      fields: [
        { label: "Status", value: shopStatusLabel(shop.shop_status) },
        {
          label: "Operational access",
          value: shopOperationalAccessState(shop),
        },
        {
          href: primaryOwnerHref,
          label: "Owner account",
          value: accountPrimaryLabelForProfile(
            primaryOwnerProfileId,
            readModel,
          ),
        },
        {
          label: "Inventory source",
          value: inventorySourceStatus,
        },
        { label: "Audit count", value: String(audits.length) },
        { label: "Devices visible", value: String(devices.length) },
      ],
      layout: "full" as const,
      title: "Key status cards",
    },
    {
      actionPlacement: "body" as const,
      description:
        "Personal web accounts linked to this shop. POS staff stays in Shop Admin.",
      fields: [
        {
          href: primaryOwnerHref,
          label: "Owner account",
          value: accountPrimaryLabelForProfile(
            primaryOwnerProfileId,
            readModel,
          ),
        },
        {
          label: "Role",
          value: primaryOwnerMember
            ? formatToken(primaryOwnerMember.role_id)
            : "Unassigned",
        },
        {
          label: "Owner status",
          value: primaryOwnerMember
            ? formatToken(primaryOwnerMember.membership_status)
            : "Unassigned",
        },
        {
          label: "Operational access",
          value:
            primaryOwnerMember &&
            isOperationalMembership(primaryOwnerMember, shop)
              ? "Yes"
              : "No",
        },
        {
          label: "Platform Admin overlap",
          value: platformAdminOverlapLabel(primaryOwnerProfileId, readModel),
        },
        { label: "Owners", value: String(activeOwnerRecords.length) },
        { label: "Managers", value: String(activeManagerRecords.length) },
        { label: "Membership records", value: String(members.length) },
      ],
      layout: "full" as const,
      notes: [
        "Owner and manager changes use audited Master Console RPCs. POS staff remains in Shop Admin.",
        "Platform Admin overlap is shown as global context, not as the owner account name.",
      ],
      title: "Admin access / Ownership",
    },
    {
      description: hasConfiguredFiscalIdentity(shop)
        ? "Fiscal / Boleta fields managed by Master Console."
        : "Fiscal identity not configured.",
      fields: shopProfileFiscalFields(shop),
      layout: "full" as const,
      notes: [
        "The edit dialog only changes fields already visible in this read-only card.",
        "Shop code and shop ID remain read-only.",
      ],
      title: "Shop profile & fiscal identity",
    },
    {
      description:
        "Compact membership summary; changes are handled in Admin access / Ownership.",
      fields: [
        {
          label: "Membership records",
          value: String(members.length),
        },
        {
          label: "Operational members",
          value: String(operationalMembers.length),
        },
        {
          label: "Owners",
          value: String(owners.length),
        },
        {
          label: "Managers",
          value: String(managers.length),
        },
      ],
      notes: isOperationalShopStatus(shop.shop_status)
        ? undefined
        : ["Memberships are preserved, but operational access is disabled."],
      layout: "full" as const,
      title: "Members",
    },
    {
      description: "Owner-scoped mobile data mapped to this shop",
      fields: linkedMobileInventorySourceFields(shop, readModel),
      layout: "full" as const,
      notes: linkedMobileInventorySourceNotes(shop, readModel),
      title: "Linked mobile inventory source",
    },
    {
      description: "Support signals from the current Master Console boundary.",
      fields: [
        { label: "Devices visible", value: String(devices.length) },
        {
          label: "Latest device update",
          value: devices[0]?.updated_at ?? "No devices visible",
        },
        {
          label: "Latest sync",
          value: sync
            ? `${formatToken(sync.event_type)} / ${sync.created_at}`
            : "No sync visible",
        },
        {
          label: "Latest audit",
          value: audits[0]?.event ?? "No audit event visible",
        },
        { label: "Audit count", value: String(audits.length) },
      ],
      layout: "full" as const,
      notes: relatedRowsVisible
        ? [
            "Sync & audit rows are compact support signals, not daily device management.",
          ]
        : [
            "Sync & audit rows are compact support signals, not daily device management.",
            "Some related rows are not visible through the current read boundary.",
          ],
      title: "Devices / sync / audit",
    },
    {
      actionPlacement: "body" as const,
      description: "Audited status changes with controlled transitions.",
      fields: [
        {
          label: "Available transition",
          value: availableLifecycleActionsForShop(shop),
        },
      ],
      layout: "full" as const,
      notes: undefined,
      title: "Shop lifecycle management",
    },
    {
      actionPlacement: "body" as const,
      description:
        "Reversible archive and guarded physical delete for synthetic test cleanup.",
      fields: [
        {
          label: "Archive",
          value:
            shop.shop_status === "archived"
              ? "Already archived"
              : "Available with reason and shop code confirmation",
        },
        {
          label: "Purge test shop",
          value:
            "Normal when dependency-free; force mode for managed synthetic test dependencies",
        },
        {
          label: "Permanent delete production shop",
          value: "Not available for production data",
        },
      ],
      layout: "full" as const,
      notes: [
        "The purge RPC repeats dependency checks server-side, snapshots audit globally, and only force-deletes synthetic test data.",
      ],
      title: "Danger Zone",
    },
  ];
}

export type PlatformShopProfileForEdit = {
  businessAddress: string;
  businessCity: string;
  businessGiro: string;
  companyRut: string;
  legalRepresentativeRut: string;
  shopCode: string;
  shopId: string;
  shopName: string;
  shopStatus: Shop["shop_status"];
};

export async function getPlatformShopProfileForRequest(shopId: string): Promise<
  | {
      reason: string;
      shop?: undefined;
      status:
        | Exclude<PlatformAdminLiveReadModel["status"], "ready">
        | "not_found";
    }
  | {
      reason?: undefined;
      shop: PlatformShopProfileForEdit;
      status: "ready";
    }
> {
  const readModel = await getPlatformAdminReadModel();

  if (readModel.status !== "ready") {
    return {
      reason: readModel.reason,
      status: readModel.status,
    };
  }

  const shop = readModel.shops.find(
    (candidate) => candidate.shop_id === shopId,
  );

  if (!shop) {
    return {
      reason:
        "The requested shop was not found in the Platform Admin read boundary.",
      status: "not_found",
    };
  }

  return {
    shop: {
      businessAddress: shop.business_address ?? "",
      businessCity: shop.business_city ?? "",
      businessGiro: shop.business_giro ?? "",
      companyRut: shop.company_rut ?? "",
      legalRepresentativeRut: shop.legal_representative_rut ?? "",
      shopCode: shop.shop_code,
      shopId: shop.shop_id,
      shopName: shop.shop_name,
      shopStatus: shop.shop_status,
    },
    status: "ready",
  };
}

export async function getPlatformShopAccessForRequest(
  shopId: string,
  searchQuery?: string,
): Promise<PlatformShopAccessManagementForRequest> {
  const normalizedSearch = normalizePlatformUserSearchQuery(searchQuery);
  const readModel = await getPlatformAdminReadModel({
    includeAuthIdentities: Boolean(normalizedSearch),
    usersSearchQuery: normalizedSearch,
  });

  if (readModel.status !== "ready") {
    return {
      reason: readModel.reason,
      status: readModel.status,
    };
  }

  const shop = readModel.shops.find(
    (candidate) => candidate.shop_id === shopId,
  );

  if (!shop) {
    return {
      reason:
        "The requested shop was not found in the Platform Admin read boundary.",
      status: "not_found",
    };
  }

  const purgePreview = await loadPlatformShopPurgePreview(shop.shop_id);
  const dependencies = shopDependencyPreview(
    shop,
    readModel,
    purgePreview?.counts,
  );

  return {
    candidates: shopAccessCandidates(shop, readModel, normalizedSearch),
    dependencies,
    memberships: shopAccessMemberships(shop, readModel),
    purgeBlockedReasons: purgeBlockedReasonsForShop(
      shop,
      dependencies,
      purgePreview?.forceBlockingReasons,
    ),
    searchQuery: normalizedSearch,
    shop: {
      shopCode: shop.shop_code,
      shopId: shop.shop_id,
      shopName: shop.shop_name,
      shopStatus: shop.shop_status,
    },
    status: "ready",
  };
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
  const shopsById = shopById(readModel.shops);
  const operationalOwnerMemberships = readModel.shopMembers.filter(
    (member) =>
      member.role_id === "shop_owner" &&
      isOperationalMembership(member, shopsById.get(member.shop_id)),
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
      stat("Global shop records", String(readModel.shops.length), "All states"),
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
        String(operationalOwnerMemberships),
        "Operational owner memberships",
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
  const directoryAccounts = readModel.userAccounts;
  const normalAccounts = directoryAccounts.filter(
    (account) =>
      isNonAdminPersonalAccount(account, readModel) &&
      account.profileSyncState === "profile_ok",
  );
  const incompleteAccounts = directoryAccounts.filter(
    (account) => account.profileSyncState !== "profile_ok",
  );
  const shopAdminAccounts = directoryAccounts.filter((account) =>
    hasShopAdminMembershipHistory(account.profileId, readModel),
  );
  const platformAdminAccounts = directoryAccounts.filter((account) =>
    hasPlatformAdminAccess(account.profileId, readModel),
  );
  const currentShopAdminAccounts = shopAdminAccounts.filter((account) =>
    canAccessAdminConsole(account.profileId, readModel),
  ).length;
  const historicalShopAdminAccounts = shopAdminAccounts.filter(
    (account) =>
      !canAccessAdminConsole(account.profileId, readModel) &&
      historicalShopAdminMembershipsForProfile(
        account.profileId,
        readModel.shops,
        readModel.shopMembers,
      ).length > 0,
  ).length;
  const hasShopAccounts = directoryAccounts.filter(hasAnyShopAccess).length;
  const noShopAccounts = directoryAccounts.length - hasShopAccounts;
  const unlinkedUsers = normalAccounts.filter((account) =>
    accountTypeSegmentsForProfile(account.profileId, readModel).includes(
      "Normal account",
    ),
  ).length;
  const profileOkCount = directoryAccounts.filter(
    (account) => account.profileSyncState === "profile_ok",
  ).length;
  const authOnlyCount = directoryAccounts.filter(
    (account) => account.profileSyncState === "auth_only",
  ).length;
  const profileOnlyCount = directoryAccounts.filter(
    (account) => account.profileSyncState === "profile_only",
  ).length;
  const originUnavailableCount = directoryAccounts.filter(
    (account) => account.profileSyncState === "origin_unavailable",
  ).length;
  const usersWithoutOperationalShop = directoryAccounts.filter(
    (account) => account.membershipCount === 0,
  ).length;
  const nonOperationalMemberships = directoryAccounts.reduce(
    (total, account) => total + account.nonOperationalMembershipCount,
    0,
  );

  return {
    ...base,
    description:
      "Personal Account Directory for every personal/profile account returned by the safe server read model. Dedicated admin views keep grant and membership operations separate.",
    emptyState: {
      title: "No personal accounts visible",
      description:
        "No Auth/Profile personal accounts were returned by the current read model or server search.",
    },
    tableNotice: {
      title: "Personal Account Directory",
      description:
        "Users includes normal, Shop Admin, Platform Admin, and incomplete personal accounts. Use dedicated admin views for grant or membership operations.",
    },
    filters: [
      {
        key: "accountType",
        label: "Account type",
        options: [
          { label: "All account types", value: "" },
          {
            emptyState: {
              title: "No normal accounts match this filter",
              description:
                "No normal accounts match this filter. Platform Admins are hidden by this filter.",
            },
            label: "Normal accounts",
            value: "Normal account",
          },
          { label: "Shop Admins", value: "Shop Admin" },
          {
            label: "Platform Admins",
            value: "Platform Admin / Master Console",
          },
          { label: "Incomplete account", value: "Incomplete account" },
        ],
      },
      {
        key: "shopAccess",
        label: "Shop access",
        options: [
          { label: "All shop access", value: "" },
          { label: "Has shop", value: "Has shop" },
          { label: "No shop", value: "No shop" },
        ],
      },
      {
        key: "state",
        label: "Profile/Auth state",
        options: [
          { label: "All states", value: "" },
          { label: "Profile OK", value: "Profile OK" },
          { label: "Auth only", value: "Auth only" },
          { label: "Profile only", value: "Profile only" },
          { label: "Origin unavailable", value: "Origin unavailable" },
        ],
      },
    ],
    guardrails: [
      "Submitted search is resolved server-side against safe Auth/Profile DTOs before rows render.",
      "Users is the Personal Account Directory: it includes normal, Shop Admin, Platform Admin, and incomplete accounts returned by the read model.",
      "Normal accounts only is an explicit filter, not the default Users view.",
      "An Admin account is a personal account with shop-scoped Admin Console access through shop_members.",
      "platform_admin is global Master Console access and is not created by connecting a shop code.",
      "Shop-code staff and manager 1001 remain separate POS/staff principals, not profiles.",
      "Join source is not captured in the current read model; future self-claim shop_code needs a separate audited flow.",
      "No auth secret fields are queried or rendered.",
      "Profile lifecycle actions are not exposed; Platform Admin grant changes use the dedicated audited admin RPCs.",
    ],
    purposeItems: [
      {
        label: "Account directory",
        detail:
          "Rows are all personal/profile accounts returned by the server read model.",
      },
      {
        label: "Account type",
        detail:
          "Normal account, Shop Admin, Platform Admin / Master Console, and Incomplete account are labels, not duplicated actions.",
      },
      {
        label: "Dedicated admin views",
        detail:
          "Shop Admins and Platform Admins remain the operational views for membership and grant controls.",
      },
      {
        label: "Incomplete accounts",
        detail:
          "Auth-only, profile-only, or origin-unavailable accounts stay visible for review.",
      },
      {
        label: "POS staff separation",
        detail:
          "Shop-code staff, manager 1001, and local credentials stay outside personal account profiles.",
      },
    ],
    nextLinks: [
      {
        description:
          "Review personal accounts that can open the shop-scoped Admin Console.",
        href: "/platform/shop-admins",
        label: "Open Shop Admins",
      },
      {
        description:
          "Review global Master Console grants and exceptional grant/revoke controls.",
        href: "/platform/admins",
        label: "Open Platform Admins",
      },
    ],
    rowDetails: directoryAccounts.map((account) =>
      userRowDetail(account, readModel),
    ),
    rows: directoryAccounts.map(
      (account): TableRow => ({
        accountType: accountTypeLabelForProfile(account.profileId, readModel),
        dataStatus: mobileInventoryDataStatusLabel(account.mobileInventoryData),
        origin: accountOriginForUser(account),
        email: account.email,
        profile: accountProfileCell(account, readModel),
        rowKey: account.profileId,
        shopAccess: shopAccessTableValueForAccount(account, readModel),
        state: `${profileSyncStateLabel(account.profileSyncState)}\n${formatToken(
          account.profileStatus,
        )}`,
      }),
    ),
    searchPlaceholder: "Search email, UID, display name, or provider",
    serverSearch: {
      clearLabel: "Clear",
      helper: readModel.authIdentityStatus.truncated
        ? "Server search scanned a bounded Auth identity page range."
        : "Server search runs before the table filter.",
      paramName: "q",
      submitLabel: "Search",
      value: readModel.usersSearchQuery ?? "",
    },
    stats: [
      stat(
        "Runtime target",
        readModel.runtimeTarget.targetClass,
        `Project ${readModel.runtimeTarget.projectRef} / ${readModel.runtimeTarget.runtimeSource}`,
        readModel.runtimeTarget.targetClass === "cloud" ? "good" : "warning",
      ),
      stat(
        "All personal accounts",
        String(readModel.userAccounts.length),
        "Profiles/Auth accounts returned by the read model",
      ),
      stat(
        "Visible in this table",
        String(directoryAccounts.length),
        "All account types returned by Users",
        "good",
      ),
      stat(
        "Auth users",
        readModel.authIdentityStatus.status === "ready"
          ? String(readModel.authIdentityStatus.scannedCount)
          : "Unavailable",
        readModel.authIdentityStatus.status === "ready"
          ? "Safe server DTO scan"
          : "Auth identity DTO unavailable",
        readModel.authIdentityStatus.status === "ready" ? "good" : "warning",
      ),
      stat(
        "Normal accounts",
        String(normalAccounts.length),
        "No Platform Admin or Shop Admin access",
        normalAccounts.length > 0 ? "good" : "muted",
      ),
      stat(
        "Shop Admin accounts",
        String(shopAdminAccounts.length),
        "Owner/manager memberships in dedicated view",
        shopAdminAccounts.length > 0 ? "good" : "muted",
      ),
      stat(
        "Current Shop Admins",
        String(currentShopAdminAccounts),
        "Can access Admin Console now",
        "good",
      ),
      stat(
        "Historical Shop Admins",
        String(historicalShopAdminAccounts),
        "Archived/non-operational owner or manager history",
        historicalShopAdminAccounts > 0 ? "warning" : "muted",
      ),
      stat(
        "Platform admins",
        String(platformAdminAccounts.length),
        "Also visible in the dedicated Platform Admins view",
        platformAdminAccounts.length > 0 ? "good" : "muted",
      ),
      stat(
        "Has shop",
        String(hasShopAccounts),
        "Any visible shop_members or linked mobile shop",
        hasShopAccounts > 0 ? "good" : "muted",
      ),
      stat(
        "No shop",
        String(noShopAccounts),
        "No visible shop_members or linked mobile shop",
        noShopAccounts > 0 ? "warning" : "good",
      ),
      stat(
        "Normal without admin access",
        String(unlinkedUsers),
        "Profile OK accounts with no admin role",
        unlinkedUsers > 0 ? "warning" : "good",
      ),
      stat(
        "No operational shop",
        String(usersWithoutOperationalShop),
        "Includes users with historical memberships only",
        usersWithoutOperationalShop > 0 ? "warning" : "good",
      ),
      stat(
        "Historical memberships",
        String(nonOperationalMemberships),
        "Non-operational or inactive membership rows",
        nonOperationalMemberships > 0 ? "warning" : "muted",
      ),
      stat(
        "Incomplete accounts",
        String(incompleteAccounts.length),
        "Auth/Profile parity needs review",
        incompleteAccounts.length > 0 ? "warning" : "good",
      ),
      stat(
        "Profile OK",
        String(profileOkCount),
        "Auth user with profile",
        "good",
      ),
      stat(
        "Auth only",
        String(authOnlyCount),
        "Auth user without profile",
        authOnlyCount > 0 ? "warning" : "good",
      ),
      stat(
        "Profile only",
        String(profileOnlyCount),
        "Profile without auth identity",
        profileOnlyCount > 0 ? "warning" : "good",
      ),
      stat(
        "Origin unavailable",
        String(originUnavailableCount),
        "Auth identity summary not available",
        originUnavailableCount > 0 ? "warning" : "muted",
      ),
    ],
    status: "Read-only",
  };
}

function buildShopAdmins(
  readModel: PlatformAdminLiveReadModel,
): PlatformSection {
  const base = platformSections.shopAdmins;
  const shopAdminAccounts = readModel.userAccounts.filter((account) =>
    hasShopAdminMembershipHistory(account.profileId, readModel),
  );
  const currentShopAdminAccounts = shopAdminAccounts.filter((account) =>
    canAccessAdminConsole(account.profileId, readModel),
  ).length;
  const historicalOnlyAccounts = shopAdminAccounts.filter(
    (account) =>
      shopAdminAccessStateForProfile(account.profileId, readModel) ===
      "Historical only",
  ).length;
  const disabledOnlyAccounts = shopAdminAccounts.filter(
    (account) =>
      shopAdminAccessStateForProfile(account.profileId, readModel) ===
      "Disabled",
  ).length;
  const ownerAccounts = shopAdminAccounts.filter((account) =>
    shopAdminAccountMembershipsForProfile(account.profileId, readModel).some(
      (member) => member.role_id === "shop_owner",
    ),
  ).length;
  const managerAccounts = shopAdminAccounts.filter((account) =>
    shopAdminAccountMembershipsForProfile(account.profileId, readModel).some(
      (member) => member.role_id === "shop_manager",
    ),
  ).length;
  const multiShopAccounts = shopAdminAccounts.filter((account) => {
    const shopIds = new Set(
      shopAdminAccountMembershipsForProfile(account.profileId, readModel).map(
        (member) => member.shop_id,
      ),
    );

    return shopIds.size > 1;
  }).length;
  const platformAdminOverlap = shopAdminAccounts.filter((account) =>
    hasPlatformAdminAccess(account.profileId, readModel),
  ).length;
  const historicalMemberships = shopAdminAccounts.reduce(
    (total, account) =>
      total +
      historicalShopAdminMembershipsForProfile(
        account.profileId,
        readModel.shops,
        readModel.shopMembers,
      ).length,
    0,
  );
  const disabledMemberships = shopAdminAccounts.reduce(
    (total, account) =>
      total +
      disabledShopAdminMembershipsForProfile(
        account.profileId,
        readModel.shopMembers,
      ).length,
    0,
  );

  return {
    ...base,
    emptyState: {
      title: "No Shop Admin accounts visible",
      description:
        "No personal account has shop_owner or shop_manager membership visible through shop_members. Future shop_code claim flows should create shop_members rows, not platform_admin grants.",
    },
    filters: [
      {
        key: "roles",
        label: "Role",
        options: [
          { label: "All roles", value: "" },
          { label: "Owner", value: "Owner" },
          { label: "Manager", value: "Manager" },
        ],
      },
      {
        key: "adminAccess",
        label: "Admin Console access",
        options: [
          { label: "All access states", value: "" },
          { label: "Current", value: "Current" },
          { label: "Historical only", value: "Historical only" },
          { label: "Disabled", value: "Disabled" },
        ],
      },
      {
        key: "globalAccess",
        label: "Global access",
        options: [
          { label: "All global access", value: "" },
          { label: "No global access", value: "No global access" },
          { label: "Platform admin", value: "Platform admin" },
        ],
      },
      {
        key: "state",
        label: "Profile/Auth state",
        options: [
          { label: "All states", value: "" },
          { label: "Profile OK", value: "Profile OK" },
          { label: "Auth only", value: "Auth only" },
          { label: "Profile only", value: "Profile only" },
          { label: "Origin unavailable", value: "Origin unavailable" },
        ],
      },
    ],
    guardrails: [
      "Shop Admin accounts are personal accounts with shop_owner or shop_manager membership in shop_members, including historical and disabled contexts.",
      "This view excludes POS staff and shop-code/staff-code principals from staff_accounts.",
      "Connecting or claiming a shop code must create an audited shop_members membership, not a platform_admin grant.",
      "Current means active membership on an operational shop; Historical only means the owner/manager link is retained for audit but cannot open Admin Console now.",
      "Platform admin overlap is shown only as global access context; it is not required for Admin Console access.",
      "No credential, token, raw auth metadata, or service-role key is rendered.",
    ],
    purposeItems: [
      {
        label: "Current and historical",
        detail:
          "Rows include current access plus archived, suspended, pending, or inactive owner/manager history.",
      },
      {
        label: "Multi-shop ready",
        detail:
          "A personal account can be owner or manager of one or more operational shops.",
      },
      {
        label: "Shop code claim target",
        detail:
          "Future claim flows should appear here as membership rows after approval.",
      },
      {
        label: "POS staff separate",
        detail:
          "Staff code, manager 1001, and local credential access stay in the staff model.",
      },
    ],
    rowDetails: shopAdminAccounts.map((account) =>
      shopAdminRowDetail(account, readModel),
    ),
    rows: shopAdminAccounts.map((account): TableRow => {
      const profileSyncState = profileSyncStateLabel(account.profileSyncState);

      return {
        adminAccess: shopAdminAccessStateForProfile(
          account.profileId,
          readModel,
        ),
        email: account.email,
        globalAccess: globalAccessSummaryForProfile(
          account.profileId,
          readModel,
        ),
        origin: accountOriginForUser(account),
        profile: accountProfileCell(account, readModel),
        roles: shopAdminRolesSummaryForProfile(account.profileId, readModel),
        rowKey: account.profileId,
        shops: shopAdminShopsSummaryForProfile(account.profileId, readModel),
        state: `${profileSyncState}\n${formatToken(account.profileStatus)}`,
      };
    }),
    searchPlaceholder:
      "Search Shop Admin by email, UID, display name, or provider",
    serverSearch: {
      clearLabel: "Clear",
      helper: readModel.authIdentityStatus.truncated
        ? "Server search scanned a bounded Auth identity page range."
        : "Server search runs before the table filter.",
      paramName: "q",
      submitLabel: "Search",
      value: readModel.usersSearchQuery ?? "",
    },
    stats: [
      stat(
        "Shop Admin accounts",
        String(shopAdminAccounts.length),
        "Owner/manager memberships",
        "good",
      ),
      stat(
        "Current Shop Admins",
        String(currentShopAdminAccounts),
        "Can access Admin Console now",
        "good",
      ),
      stat(
        "Historical only",
        String(historicalOnlyAccounts),
        "Archived/non-operational owner or manager accounts",
        historicalOnlyAccounts > 0 ? "warning" : "muted",
      ),
      stat(
        "Disabled",
        String(disabledOnlyAccounts),
        "Only inactive owner or manager memberships",
        disabledOnlyAccounts > 0 ? "warning" : "muted",
      ),
      stat(
        "Owner accounts",
        String(ownerAccounts),
        "Has shop_owner membership",
        "good",
      ),
      stat(
        "Manager accounts",
        String(managerAccounts),
        "Has shop_manager membership",
        "good",
      ),
      stat(
        "Multi-shop accounts",
        String(multiShopAccounts),
        "More than one linked shop",
      ),
      stat(
        "Platform admin overlap",
        String(platformAdminOverlap),
        "Also has global Master Console access",
        platformAdminOverlap > 0 ? "warning" : "muted",
      ),
      stat(
        "Historical memberships",
        String(historicalMemberships),
        "Archived or non-operational owner/manager rows",
        historicalMemberships > 0 ? "warning" : "muted",
      ),
      stat(
        "Disabled memberships",
        String(disabledMemberships),
        "Inactive owner/manager rows",
        disabledMemberships > 0 ? "warning" : "muted",
      ),
    ],
    status: "Read-only",
  };
}

function buildShops(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.shops;
  const activeShops = readModel.shops.filter(
    (shop) => shop.shop_status === "active",
  ).length;
  const pendingShops = readModel.shops.filter(
    (shop) => shop.shop_status === "pending_setup",
  ).length;
  const suspendedShops = readModel.shops.filter(
    (shop) => shop.shop_status === "suspended",
  ).length;
  const archivedShops = readModel.shops.filter(
    (shop) => shop.shop_status === "archived",
  ).length;

  return {
    ...base,
    description:
      "Global shop registry. Master Console sees all shop records; only active shops are operational.",
    filters: [
      {
        key: "status",
        label: "State",
        options: [
          { label: "All states", value: "" },
          { label: "Active", value: "Active" },
          { label: "Pending", value: "Pending" },
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
      "All states includes archived and other non-operational records.",
      "Lifecycle controls stay on Controlled Operations with reason and audit.",
      "Device and sync values are support signals, not daily device management.",
      "Open Admin Console for shop-level device management.",
      "Archived shops can be restored only through the audited restore RPC with shop code confirmation.",
    ],
    rowDetails: readModel.shops.map((shop) => shopRowDetail(shop, readModel)),
    rows: readModel.shops.map((shop): TableRow => {
      const shopStatus = shopStatusLabel(shop.shop_status);

      return {
        code: shop.shop_code,
        devices: shopDeviceSummary(shop, readModel),
        health: shopHealthSummary(shop, readModel),
        inventorySource: shopInventorySourceTableValue(shop, readModel),
        members: memberSummaryForShop(shop, readModel.shopMembers),
        operationalAccess: shopOperationalAccessTableValue(shop),
        owners: ownerSummaryForShop(
          shop,
          readModel.profiles,
          readModel.shopMembers,
        ),
        rowKey: shop.shop_id,
        shop: `${shop.shop_name}\nCode ${shop.shop_code}\nID ${shortId(shop.shop_id)}`,
        status: shopStatus,
      };
    }),
    searchPlaceholder: "Search shops by name, code, or ID",
    stats: [
      stat("Global shop records", String(readModel.shops.length), "All states"),
      stat("Active", String(activeShops), "Operational shops", "good"),
      stat("Pending", String(pendingShops), "Not operational", "warning"),
      stat(
        "Suspended",
        String(suspendedShops),
        "Operational access disabled",
        suspendedShops > 0 ? "warning" : "good",
      ),
      stat("Archived", String(archivedShops), "Historical records", "muted"),
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

function buildProvisioning(
  readModel: PlatformAdminLiveReadModel,
): PlatformSection {
  const base = platformSections.provisioning;
  const activeProfiles = readModel.profiles.filter(
    (profile) => profile.profile_status === "active",
  );

  return {
    ...base,
    guardrails: [
      "Shop creation with owner or POS-first bootstrap uses audited Platform Admin RPC boundaries.",
      "Fiscal / Boleta identity is written only by Master Console and displayed read-only in Admin Console.",
      "Owner assignment supports existing active profiles; POS-first shops do not create personal accounts.",
      "Pending owner invites store redacted contact state only; email delivery is not active yet.",
      "Initial POS manager credential is generated server-side and shown once by the provisioning form.",
    ],
    rows: [
      {
        area: "Create shop",
        next: "Use /platform/provisioning",
        signal: "Owner or POS-first bootstrap",
        state: "Available",
      },
      {
        area: "Initial owner",
        next: `${activeProfiles.length} active profiles selectable`,
        signal: "Existing profile",
        state: "Available",
      },
      {
        area: "Fiscal identity",
        next: "Company RUT, giro, address, city, legal representative",
        signal: "Master Console-only",
        state: "Available",
      },
      {
        area: "Pending owner invite",
        next: "Secondary setup, no email delivery",
        signal: "Redacted contact state",
        state: "Available",
      },
    ],
    stats: [
      stat(
        "Active profiles",
        String(activeProfiles.length),
        "Owner candidates",
      ),
      stat("Shop code", "Validated", "Server normalization", "good"),
      stat("Initial staff", "1001", "POS manager default", "good"),
      stat(
        "Invite delivery",
        "Pending",
        "PASS_WITH_NOTES_EMAIL_DELIVERY",
        "warning",
      ),
    ],
    status: "Safe provisioning",
  };
}

function buildAdmins(readModel: PlatformAdminLiveReadModel): PlatformSection {
  const base = platformSections.admins;

  return {
    ...base,
    guardrails: [
      "Platform admin grant/revoke controls only global Master Console access.",
      "Shop admin accounts are personal accounts linked through shop_members, not platform_admins.",
      "Connecting a shop code must create shop_owner or shop_manager membership, not platform_admin.",
      "Existing grants are visible through RLS for review.",
      "Strong confirmation and reason are required for global security operations.",
    ],
    rows: readModel.platformAdmins.map((admin): TableRow => {
      const account = readModel.userAccounts.find(
        (candidate) => candidate.profileId === admin.profile_id,
      );

      return {
        email: account?.email ?? "Auth identity unavailable",
        granted: admin.granted_at,
        origin: account
          ? accountOriginForUser(account)
          : "Auth identity unavailable",
        profile: account
          ? accountProfileCell(account, readModel)
          : `${profileNameById(readModel.profiles, admin.profile_id)}\nProfile ID ${shortId(admin.profile_id)}`,
        review: admin.last_reviewed_at ?? "Grant state visible",
        rowKey: admin.platform_admin_id,
        shopOverlap: shopAdminAccessStateForProfile(
          admin.profile_id,
          readModel,
        ),
        status: formatToken(admin.status),
      };
    }),
    stats: [
      stat(
        "Admin grants",
        String(readModel.platformAdmins.length),
        "Visible grants",
      ),
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
    rows: readModel.auditLogs.map(
      (log): TableRow => ({
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
      }),
    ),
    stats: [
      stat("Audit events", String(readModel.auditLogs.length), "Latest rows"),
      stat(
        "Severity filters",
        "Ready",
        "actor shop area action target severity date",
      ),
      stat("Metadata", "Redacted", "metadata_redacted summaries only", "good"),
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
        signal: readModel.status === "ready" ? "Configured" : "Not configured",
        state:
          readModel.status === "ready"
            ? readableBoundaryStatus("PASS")
            : readableBoundaryStatus("not_configured"),
      },
      {
        area: "Supabase connection health",
        next: readModel.reason,
        signal: `${readModel.profiles.length + readModel.shops.length} primary rows`,
        state: readableBoundaryStatus("PASS"),
      },
      {
        area: "RLS/grants summary",
        next: staffIssue
          ? `${staffIssue.message}\nCode: ${staffIssue.code}`
          : "Selects pass through authenticated RLS only",
        signal: staffIssue
          ? "Permission boundary"
          : "Profiles, shops, audit, devices, sync",
        state: staffIssue
          ? readableBoundaryStatus(staffIssue.code)
          : readableBoundaryStatus("PASS_WITH_NOTES"),
      },
      {
        area: "Staff safe read model",
        next: staffIssue
          ? `${staffIssue.message}\nCode: ${staffIssue.code}`
          : "Safe staff view is readable or empty",
        signal: staffIssue
          ? "Permission boundary"
          : `${readModel.staffSafeRows.length} rows`,
        state: readableBoundaryStatus(readModel.dataHealth.staff_schema_status),
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
        state: readableBoundaryStatus("PASS"),
      },
      {
        area: "Migration drift",
        next: "Verified only by linked Supabase CLI checks",
        signal: "migration drift",
        state: readableBoundaryStatus(
          readModel.dataHealth.migration_drift_status,
        ),
      },
    ],
    stats: [
      stat(
        "Auth SSR",
        readableBoundaryStatus("PASS"),
        "Server session boundary",
        "good",
      ),
      stat(
        "Route protection",
        readableBoundaryStatus("PASS"),
        "Server layout gate",
        "good",
      ),
      stat(
        "Migration drift",
        readableBoundaryStatus("NOT_RUN"),
        "CLI evidence required",
        "warning",
      ),
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
      "Runtime target diagnostics expose only class, redacted project ref, and counts.",
      "Data health is computed from server aggregate inputs only.",
      "Migration drift is NOT_RUN in the UI unless the Supabase CLI gate has been executed.",
      "Blocked and not_configured states are distinct from empty data.",
      "Device/sync data health is read-only and aggregated for support diagnostics.",
    ],
    rows: [
      {
        area: "runtime target",
        next: `Source: ${readModel.runtimeTarget.runtimeSource}`,
        signal: `${readModel.runtimeTarget.targetClass} / ${readModel.runtimeTarget.projectRef}`,
        state: "Server diagnostic",
      },
      {
        area: "auth users count",
        next:
          readModel.authIdentityStatus.status === "ready"
            ? "Counted through server-side Auth identity DTO"
            : (readModel.authIdentityStatus.reason ??
              "Auth identity DTO unavailable"),
        signal:
          readModel.authIdentityStatus.status === "ready"
            ? String(readModel.authIdentityStatus.scannedCount)
            : "Unavailable",
        state: readableBoundaryStatus(readModel.authIdentityStatus.status),
      },
      {
        area: "profiles count",
        next: "Loaded through authenticated RLS",
        signal: String(readModel.profiles.length),
        state: readableBoundaryStatus("PASS"),
      },
      {
        area: "shops without owner",
        next: "Assign owner through safe operations",
        signal: String(health.shops_without_owner),
        state: readableBoundaryStatus(
          health.shops_without_owner > 0 ? "PASS_WITH_NOTES" : "PASS",
        ),
      },
      {
        area: "profiles without membership",
        next: "Review support diagnostics",
        signal: String(health.profiles_without_membership),
        state: readableBoundaryStatus(
          health.profiles_without_membership > 0 ? "PASS_WITH_NOTES" : "PASS",
        ),
      },
      {
        area: "orphaned memberships",
        next: "Investigate referential integrity",
        signal: String(health.orphaned_memberships),
        state: readableBoundaryStatus(
          health.orphaned_memberships > 0 ? "BLOCKED" : "PASS",
        ),
      },
      {
        area: "audit coverage",
        next: "Sensitive operations must write audit",
        signal: String(readModel.auditLogs.length),
        state: readableBoundaryStatus(health.audit_coverage),
      },
      {
        area: "migration drift",
        next: "Run linked Supabase CLI check",
        signal: "CLI-only",
        state: readableBoundaryStatus(health.migration_drift_status),
      },
      {
        area: "inventory mapping status",
        next: "Shop-root mapping summary",
        signal: String(readModel.shopOwnerMappings.length),
        state: readableBoundaryStatus(health.inventory_mapping_status),
      },
      {
        area: "sync/history mapping status",
        next: "Global sync overview",
        signal: String(readModel.syncEvents.length),
        state: readableBoundaryStatus(health.sync_history_mapping_status),
      },
      {
        area: "device schema status",
        next: "Global device overview",
        signal: String(readModel.shopDevices.length),
        state: readableBoundaryStatus(health.device_schema_status),
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
        next: staffIssue
          ? `${staffIssue.message}\nCode: ${staffIssue.code}`
          : "Safe staff view only",
        signal: staffIssue
          ? "Permission boundary"
          : String(readModel.staffSafeRows.length),
        state: readableBoundaryStatus(health.staff_schema_status),
      },
    ],
    stats: [
      stat(
        "Runtime target",
        readModel.runtimeTarget.targetClass,
        `Project ${readModel.runtimeTarget.projectRef}`,
        readModel.runtimeTarget.targetClass === "cloud" ? "good" : "warning",
      ),
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
      stat(
        "Migration drift",
        readableBoundaryStatus(health.migration_drift_status),
        "CLI-only",
        "warning",
      ),
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
      .filter((sourceDeviceId): sourceDeviceId is string =>
        Boolean(sourceDeviceId),
      ),
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
        detail:
          "Review aggregated device coverage and support signals across shops.",
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
      stat(
        "Authorized",
        String(authorized),
        "Active shop_devices rows",
        "good",
      ),
      stat(
        "Revoked",
        String(revoked),
        "Authorization disabled",
        revoked > 0 ? "warning" : "good",
      ),
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
            description:
              "Review aggregate device and sync health in the data diagnostics page.",
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
            description:
              "Use technical sync events when debugging event-level replication.",
            href: "/platform/sync",
            label: "Open Sync",
          },
          {
            description:
              "Use Audit for admin actions, results, actors, and targets.",
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
            detail:
              "Use it when debugging global sync visibility before opening shop-level troubleshooting.",
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
            detail:
              "Use it when Sync feels too technical for a support question.",
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

function buildOperations(
  readModel: PlatformAdminLiveReadModel,
): PlatformSection {
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
        description:
          "Suspend, reactivate, or archive a shop through audited RPCs.",
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
        availability:
          readModel.shopDevices.length > 0 ? "Available" : "No device rows",
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
  const profileRows = readModel.profiles
    .slice(0, 60)
    .map((profile): TableRow => {
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
        activeOwnerForShop(shop, readModel.profiles, readModel.shopMembers) ===
        "Unassigned"
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
        description:
          "Use Operations only for audited emergency or lifecycle actions.",
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
        detail:
          "It does not impersonate users and does not run mutative support actions.",
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
      stat(
        "Impersonation: Out of scope",
        "No",
        "No mutative support action",
        "warning",
      ),
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
      stat(
        "Result",
        event ? formatToken(event.result) : "Unknown",
        "Audit outcome",
      ),
    ],
    status: "Audit detail",
    title: "Audit Detail",
  };
}

function buildUserDetail(
  readModel: PlatformAdminLiveReadModel,
  profileId: string,
  context: AccountDetailContext = "users",
): PlatformSection {
  const base =
    context === "shopAdmins"
      ? platformSections.shopAdmins
      : platformSections.users;
  const account = readModel.userAccounts.find(
    (item) => item.profileId === profileId,
  );
  const audits = readModel.auditLogs.filter(
    (log) => log.actor_profile_id === profileId,
  );

  return {
    ...base,
    description:
      context === "shopAdmins"
        ? "Account detail opened from the filtered Shop Admin view, with shop_members context highlighted."
        : "Account detail with safe Auth identity summary, global access, shop memberships, linked mobile data, and audit.",
    detailSections: account
      ? userDetailSections(account, readModel, context)
      : undefined,
    emptyState: {
      description:
        "The requested account is not visible through the current Platform Admin read boundary.",
      title: "Account not visible",
    },
    guardrails: [
      "Access state is shown from safe profile, Auth identity, and membership summaries only.",
      "Suspend/reactivate profile remains outside this task; Platform role changes use the audited admin RPCs.",
      "No auth secret fields are queried or rendered.",
    ],
    rows: account
      ? [
          {
            access: accessSummaryForProfile(account.profileId, readModel),
            email: account.email,
            origin: accountOriginForUser(account),
            profile: accountProfileCell(account, readModel),
            rowKey: account.profileId,
            shops: shopAccessSummaryForProfile(
              account.profileId,
              readModel.shops,
              readModel.shopMembers,
            ),
            state: `${profileSyncStateLabel(account.profileSyncState)}\n${shopAccessStateLabel(account.shopAccessState)}`,
          },
          {
            access: "Audit",
            email: "No email in audit",
            origin: "Server audit",
            profile: "Recent audit",
            rowKey: `${account.profileId}-audit`,
            shops: `${audits.length} linked events`,
            state: audits[0]?.event ?? "None",
          },
        ]
      : [],
    stats: [
      stat("Account", account ? "Visible" : "Missing", "Server detail lookup"),
      stat(
        "Operational shops",
        String(account?.membershipCount ?? 0),
        "Active membership on active shop",
      ),
      stat(
        "Historical memberships",
        String(account?.nonOperationalMembershipCount ?? 0),
        "Inactive or non-operational shop records",
        (account?.nonOperationalMembershipCount ?? 0) > 0 ? "warning" : "muted",
      ),
      stat("Audit events", String(audits.length), "Actor-linked audit"),
    ],
    status:
      context === "shopAdmins" ? "Shop Admin account detail" : "Account detail",
    title: account ? accountPrimaryLabel(account) : "Account Detail",
  };
}

function buildShopAdminDetail(
  readModel: PlatformAdminLiveReadModel,
  profileId: string,
): PlatformSection {
  const base = platformSections.shopAdmins;
  const account = readModel.userAccounts.find(
    (item) => item.profileId === profileId,
  );
  const memberships = account
    ? shopAdminAccountMembershipsForProfile(account.profileId, readModel)
    : [];
  const audits = readModel.auditLogs.filter(
    (log) => log.actor_profile_id === profileId,
  );

  return {
    ...base,
    description:
      "Account detail opened from the filtered Shop Admin view, with shop_members context highlighted.",
    detailSections: account
      ? userDetailSections(account, readModel, "shopAdmins")
      : undefined,
    emptyState: {
      description:
        "The requested Shop Admin account is not visible through the current Platform Admin read boundary.",
      title: "Shop Admin account not visible",
    },
    guardrails: [
      "Shop Admin access is read from shop_members owner/manager memberships.",
      "Platform Admin overlap is context only; global grants remain in Platform Admins.",
      "Owner-scoped mobile inventory counts are shown on the linked shop record when mapped.",
      "No auth secret fields are queried or rendered.",
    ],
    rows: account
      ? [
          {
            adminAccess: shopAdminAccessStateForProfile(
              account.profileId,
              readModel,
            ),
            email: account.email,
            globalAccess: globalAccessSummaryForProfile(
              account.profileId,
              readModel,
            ),
            origin: accountOriginForUser(account),
            profile: accountProfileCell(account, readModel),
            roles: shopAdminRolesSummaryForProfile(
              account.profileId,
              readModel,
            ),
            rowKey: account.profileId,
            shops: shopAdminShopsSummaryForProfile(
              account.profileId,
              readModel,
            ),
            state: `${profileSyncStateLabel(account.profileSyncState)}\n${formatToken(account.profileStatus)}`,
          },
          ...memberships.map((member) => ({
            adminAccess: membershipOperationalLabel(
              member,
              shopById(readModel.shops).get(member.shop_id),
            ),
            email: account.email,
            globalAccess: globalAccessSummaryForProfile(
              account.profileId,
              readModel,
            ),
            origin: "shop_members",
            profile: profileNameById(readModel.profiles, account.profileId),
            roles: formatToken(member.role_id),
            rowKey: `${account.profileId}-${member.shop_member_id}`,
            shops: shopCodeById(readModel.shops, member.shop_id),
            state: formatToken(member.membership_status),
          })),
        ]
      : [],
    stats: [
      stat(
        "Shop Admin account",
        account ? "Visible" : "Missing",
        "Server detail lookup",
      ),
      stat(
        "Current access",
        account
          ? shopAdminAccessStateForProfile(account.profileId, readModel)
          : "Missing",
        "shop_members owner/manager context",
        account && canAccessAdminConsole(account.profileId, readModel)
          ? "good"
          : "warning",
      ),
      stat(
        "Membership records",
        String(memberships.length),
        "Owner/manager rows",
      ),
      stat(
        "Platform Admin overlap",
        account && hasPlatformAdminAccess(account.profileId, readModel)
          ? "Yes"
          : "No",
        "Global Master Console context",
        account && hasPlatformAdminAccess(account.profileId, readModel)
          ? "warning"
          : "muted",
      ),
      stat("Audit events", String(audits.length), "Actor-linked audit"),
    ],
    status: "Shop Admin account detail",
    title: account ? accountPrimaryLabel(account) : "Shop Admin Detail",
  };
}

function buildShopDetail(
  readModel: PlatformAdminLiveReadModel,
  shopId: string,
): PlatformSection {
  const base = platformSections.shops;
  const shop = readModel.shops.find((item) => item.shop_id === shopId);
  const members = readModel.shopMembers.filter(
    (member) => member.shop_id === shopId,
  );
  const devices = readModel.shopDevices.filter(
    (device) => device.shop_id === shopId,
  );
  const sync = latestSyncForShop(
    readModel.syncEvents,
    readModel.shopOwnerMappings,
    shopId,
  );
  const audits = readModel.auditLogs.filter((log) => log.shop_id === shopId);
  const primaryOwnerProfileId = shop
    ? primaryOwnerProfileIdForShop(shop, members, readModel)
    : undefined;

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
    rowsPresentation: "diagnostics",
    rows: shop
      ? [
          {
            code: shop.shop_code,
            devices: shopDeviceSummary(shop, readModel),
            health: shopHealthSummary(shop, readModel),
            inventorySource: shopInventorySourceTableValue(shop, readModel),
            members: memberSummaryForShop(shop, readModel.shopMembers),
            operationalAccess: shopOperationalAccessTableValue(shop),
            owners: ownerSummaryForShop(
              shop,
              readModel.profiles,
              readModel.shopMembers,
            ),
            rowKey: shop.shop_id,
            shop: `${shop.shop_name}\nCode ${shop.shop_code}\nID ${shortId(shop.shop_id)}`,
            status: shopStatusLabel(shop.shop_status),
          },
          {
            code: "Members",
            devices: "No device change",
            health: `${members.length} memberships`,
            inventorySource: shopInventorySourceTableValue(shop, readModel),
            members: memberSummaryForShop(shop, readModel.shopMembers),
            operationalAccess: shopOperationalAccessTableValue(shop),
            owners: members
              .slice(0, 4)
              .map((member) =>
                profileNameById(readModel.profiles, member.profile_id),
              )
              .join(", "),
            rowKey: `${shop.shop_id}-members`,
            shop: "Owner/members summary",
            status: shopStatusLabel(shop.shop_status),
          },
          {
            code: "Sync",
            devices: `${devices.length} visible devices`,
            health: sync ? sync.metadata_summary : "No sync visible",
            inventorySource: shopInventorySourceTableValue(shop, readModel),
            members: `${audits.length} audit events`,
            operationalAccess: shopOperationalAccessTableValue(shop),
            owners: sync?.source ?? "None",
            rowKey: `${shop.shop_id}-sync`,
            shop: "Sync/history summary",
            status: shopStatusLabel(shop.shop_status),
          },
        ]
      : [],
    stats: [
      stat(
        "Status",
        shop ? shopStatusLabel(shop.shop_status) : "Missing",
        shop ? shopRecordLabel(shop) : "No shop record",
        shop?.shop_status === "active" ? "good" : "warning",
      ),
      stat(
        "Operational access",
        shop ? shopOperationalAccessState(shop) : "Missing",
        shop ? shopRecordLabel(shop) : "No shop record",
        shop?.shop_status === "active" ? "good" : "warning",
      ),
      stat(
        "Owner",
        shop
          ? accountPrimaryLabelForProfile(primaryOwnerProfileId, readModel)
          : "Missing",
        primaryOwnerProfileId ? "Shop Owner" : "Owner not linked",
        primaryOwnerProfileId ? "good" : "warning",
      ),
      stat(
        "Inventory source",
        shop ? shopInventorySourceStatusLabel(shop, readModel) : "Missing",
        "Owner-scoped mobile data",
        shop &&
          shopInventorySourceMappingForShop(shop, readModel)?.mappingState ===
            "mapped"
          ? "good"
          : "muted",
      ),
      stat("Audit events", String(audits.length), "Recent audit rows"),
      stat("Devices", String(devices.length), "Device rows"),
    ],
    status: "Shop detail",
    title: shop ? shop.shop_name : "Shop Detail",
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
    case "shopAdmins":
      return buildShopAdmins(readModel);
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
  options: { usersSearchQuery?: string } = {},
): Promise<PlatformSection> {
  const readModel = await getPlatformAdminReadModel({
    includeAuthIdentities:
      key === "users" ||
      key === "shopAdmins" ||
      key === "shops" ||
      key === "admins" ||
      key === "data",
    usersSearchQuery:
      key === "users" || key === "shopAdmins"
        ? options.usersSearchQuery
        : undefined,
  });

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
  options: { context?: AccountDetailContext } = {},
): Promise<PlatformSection> {
  const readModel = await getPlatformAdminReadModel({
    includeAuthIdentities: true,
    usersSearchQuery: profileId,
  });

  if (readModel.status !== "ready") {
    return fallbackSection("users", readModel);
  }

  return buildUserDetail(readModel, profileId, options.context ?? "users");
}

export async function getPlatformShopAdminDetailForRequest(
  profileId: string,
): Promise<PlatformSection> {
  const readModel = await getPlatformAdminReadModel({
    includeAuthIdentities: true,
    usersSearchQuery: profileId,
  });

  if (readModel.status !== "ready") {
    return fallbackSection("shopAdmins", readModel);
  }

  return buildShopAdminDetail(readModel, profileId);
}

export async function getPlatformShopDetailForRequest(
  shopId: string,
): Promise<PlatformSection> {
  const readModel = await getPlatformAdminReadModel({
    includeAuthIdentities: true,
    mobileInventoryShopIds: [shopId],
  });

  if (readModel.status !== "ready") {
    return fallbackSection("shops", readModel);
  }

  return buildShopDetail(readModel, shopId);
}
