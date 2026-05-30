import "server-only";

import type {
  AuditLog,
  AuditResult,
  AuditSeverity,
  MembershipStatus,
  PlatformScope,
  PlatformRoleKey,
  Profile,
  ProfileStatus,
  Shop,
  ShopMember,
  ShopStatus,
} from "@/domain/platform-admin/types";
import type { Database } from "@/lib/supabase/database.types";
import {
  normalizeInventorySourceMappingState,
  type InventorySourceMappingState,
} from "./inventory-sources";

type Tables = Database["public"]["Tables"];

export type ProfileRowCandidate = Tables["profiles"]["Row"];

export type ShopRowCandidate = Tables["shops"]["Row"];

export type ShopMemberRowCandidate = Tables["shop_members"]["Row"] & {
  role_id?: string;
};

export type AuditLogRowCandidate = Tables["audit_logs"]["Row"] & {
  event?: string;
};

export type ShopOwnerMappingRowCandidate =
  Tables["shop_inventory_sources"]["Row"];

export type ShopOwnerMapping = {
  shopId: string | null;
  ownerUserId: string | null;
  mappingState: InventorySourceMappingState;
};

export type ShopOwnerMappingCardinalityIssue =
  | {
      type: "mapped_without_owner";
      shopId: string;
    }
  | {
      type: "duplicate_active_shop";
      shopId: string;
      ownerUserIds: readonly string[];
    }
  | {
      type: "duplicate_active_owner";
      ownerUserId: string;
      shopIds: readonly string[];
    };

export type ShopOwnerMappingCardinalityResult =
  | {
      status: "valid";
      cardinality: "one_active_owner_per_shop_and_one_active_shop_per_owner";
    }
  | {
      status: "ambiguous";
      cardinality: "one_active_owner_per_shop_and_one_active_shop_per_owner";
      issues: readonly ShopOwnerMappingCardinalityIssue[];
    };

const profileStatuses = ["active", "review", "disabled"] as const;
const shopStatuses = [
  "active",
  "pending_setup",
  "suspended",
  "archived",
] as const;
const membershipStatuses = ["active", "invited", "suspended"] as const;
const platformRoleKeys = [
  "platform_admin",
  "shop_owner",
  "shop_manager",
  "cashier",
  "viewer",
] as const;
const platformScopes = ["global", "shop"] as const;
const auditSeverities = ["info", "warning", "critical"] as const;
const auditResults = ["success", "blocked", "simulated", "failure"] as const;

function isKnownValue<T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] {
  return values.includes(value);
}

function normalizeProfileStatus(value: string): ProfileStatus {
  return isKnownValue(profileStatuses, value) ? value : "review";
}

function normalizeShopStatus(value: string): ShopStatus {
  return isKnownValue(shopStatuses, value) ? value : "pending_setup";
}

function normalizeMembershipStatus(value: string): MembershipStatus {
  return isKnownValue(membershipStatuses, value) ? value : "suspended";
}

function normalizePlatformRoleKey(value: string): PlatformRoleKey {
  return isKnownValue(platformRoleKeys, value) ? value : "viewer";
}

function normalizePlatformScope(value: string): PlatformScope {
  return isKnownValue(platformScopes, value) ? value : "global";
}

function normalizeAuditSeverity(value: string): AuditSeverity {
  return isKnownValue(auditSeverities, value) ? value : "warning";
}

function normalizeAuditResult(value: string): AuditResult {
  return isKnownValue(auditResults, value) ? value : "blocked";
}

export function mapProfileRow(row: ProfileRowCandidate): Profile {
  return {
    profile_id: row.profile_id,
    display_name: row.display_name,
    profile_status: normalizeProfileStatus(row.profile_status),
    created_at: row.created_at,
  };
}

export function mapShopRow(row: ShopRowCandidate): Shop {
  return {
    shop_id: row.shop_id,
    shop_code: row.shop_code,
    shop_name: row.shop_name,
    shop_status: normalizeShopStatus(row.shop_status),
    created_at: row.created_at,
  };
}

export function mapShopMemberRow(row: ShopMemberRowCandidate): ShopMember {
  return {
    shop_member_id: row.shop_member_id,
    profile_id: row.profile_id,
    shop_id: row.shop_id,
    role_id: normalizePlatformRoleKey(row.role_id ?? row.role_key),
    membership_status: normalizeMembershipStatus(row.membership_status),
  };
}

export function mapAuditLogRow(row: AuditLogRowCandidate): AuditLog {
  return {
    audit_log_id: row.audit_log_id,
    actor_profile_id: row.actor_profile_id ?? undefined,
    scope: normalizePlatformScope(row.scope),
    shop_id: row.shop_id ?? undefined,
    event: row.event ?? row.event_key,
    severity: normalizeAuditSeverity(row.severity),
    result: normalizeAuditResult(row.result),
    created_at: row.created_at,
  };
}

export function mapShopOwnerMappingRow(
  row: ShopOwnerMappingRowCandidate,
): ShopOwnerMapping {
  return {
    shopId: row.shop_id,
    ownerUserId: row.owner_user_id,
    mappingState: normalizeInventorySourceMappingState(row.mapping_state),
  };
}

export function validateInitialShopOwnerMappingCardinality(
  mappings: readonly ShopOwnerMapping[],
): ShopOwnerMappingCardinalityResult {
  const shopToOwners = new Map<string, Set<string>>();
  const ownerToShops = new Map<string, Set<string>>();
  const issues: ShopOwnerMappingCardinalityIssue[] = [];

  for (const mapping of mappings) {
    if (mapping.mappingState !== "mapped") {
      continue;
    }

    if (!mapping.ownerUserId || !mapping.shopId) {
      issues.push({
        type: "mapped_without_owner",
        shopId: mapping.shopId ?? "missing_shop_id",
      });
      continue;
    }

    const ownerIds = shopToOwners.get(mapping.shopId) ?? new Set<string>();
    ownerIds.add(mapping.ownerUserId);
    shopToOwners.set(mapping.shopId, ownerIds);

    const shopIds = ownerToShops.get(mapping.ownerUserId) ?? new Set<string>();
    shopIds.add(mapping.shopId);
    ownerToShops.set(mapping.ownerUserId, shopIds);
  }

  for (const [shopId, ownerUserIds] of shopToOwners) {
    if (ownerUserIds.size > 1) {
      issues.push({
        type: "duplicate_active_shop",
        shopId,
        ownerUserIds: Array.from(ownerUserIds),
      });
    }
  }

  for (const [ownerUserId, shopIds] of ownerToShops) {
    if (shopIds.size > 1) {
      issues.push({
        type: "duplicate_active_owner",
        ownerUserId,
        shopIds: Array.from(shopIds),
      });
    }
  }

  if (issues.length > 0) {
    return {
      status: "ambiguous",
      cardinality: "one_active_owner_per_shop_and_one_active_shop_per_owner",
      issues,
    };
  }

  return {
    status: "valid",
    cardinality: "one_active_owner_per_shop_and_one_active_shop_per_owner",
  };
}
