import type {
  MembershipStatus,
  Shop,
  ShopMember,
  ShopStatus,
} from "./types";

export type ShopStatusDefinition = {
  description: string;
  label: string;
  operationalAccessEnabled: boolean;
};

export const SHOP_STATUS_DEFINITIONS: Record<
  ShopStatus,
  ShopStatusDefinition
> = {
  active: {
    description:
      "Operational shop: available to Admin Console, shop switcher, POS, and sync flows according to existing permissions.",
    label: "Active",
    operationalAccessEnabled: true,
  },
  archived: {
    description:
      "Archived record: visible in Master Console for history and audit, but not available for operational access.",
    label: "Archived",
    operationalAccessEnabled: false,
  },
  pending_setup: {
    description:
      "Created or provisioned shop that is not operational yet: visible in Master Console, but not available to shop users.",
    label: "Pending",
    operationalAccessEnabled: false,
  },
  suspended: {
    description:
      "Temporarily blocked shop: data and memberships are preserved, while operational access and operational writes are disabled.",
    label: "Suspended",
    operationalAccessEnabled: false,
  },
};

export function shopStatusLabel(status: ShopStatus) {
  return SHOP_STATUS_DEFINITIONS[status].label;
}

export function shopStatusDescription(status: ShopStatus) {
  return SHOP_STATUS_DEFINITIONS[status].description;
}

export function isOperationalShopStatus(status: ShopStatus) {
  return SHOP_STATUS_DEFINITIONS[status].operationalAccessEnabled;
}

export function shopOperationalAccessLabel(status: ShopStatus) {
  if (isOperationalShopStatus(status)) {
    return "Enabled";
  }

  return `Disabled - ${shopStatusLabel(status).toLowerCase()} shop`;
}

export function isActiveMembershipStatus(status: MembershipStatus) {
  return status === "active";
}

export function shopById(shops: readonly Shop[]) {
  return new Map(shops.map((shop) => [shop.shop_id, shop]));
}

export function isOperationalMembership(
  member: ShopMember,
  shop: Shop | undefined,
) {
  return (
    isActiveMembershipStatus(member.membership_status) &&
    Boolean(shop) &&
    isOperationalShopStatus(shop!.shop_status)
  );
}

export function membershipOperationalReason(
  member: ShopMember,
  shop: Shop | undefined,
) {
  if (!shop) {
    return "No - shop not visible through current boundary";
  }

  if (!isActiveMembershipStatus(member.membership_status)) {
    return `No - membership ${member.membership_status}`;
  }

  if (!isOperationalShopStatus(shop.shop_status)) {
    return `No - shop ${shopStatusLabel(shop.shop_status).toLowerCase()}`;
  }

  return "Yes";
}

export function membershipOperationalLabel(
  member: ShopMember,
  shop: Shop | undefined,
) {
  return isOperationalMembership(member, shop)
    ? "Yes"
    : membershipOperationalReason(member, shop);
}

export function operationalMembershipsForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  const shopsById = shopById(shops);

  return members.filter((member) =>
    member.profile_id === profileId &&
    isOperationalMembership(member, shopsById.get(member.shop_id)),
  );
}

export function nonOperationalMembershipsForProfile(
  profileId: string,
  shops: readonly Shop[],
  members: readonly ShopMember[],
) {
  const shopsById = shopById(shops);

  return members.filter(
    (member) =>
      member.profile_id === profileId &&
      !isOperationalMembership(member, shopsById.get(member.shop_id)),
  );
}

export function operationalMembershipsForShop(
  shop: Shop,
  members: readonly ShopMember[],
) {
  return members.filter((member) => isOperationalMembership(member, shop));
}
