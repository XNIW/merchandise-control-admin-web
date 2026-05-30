import type {
  AuditLog,
  Permission,
  Profile,
  Role,
  Shop,
  ShopMember,
  SystemStatus,
} from "./types";
import {
  mockPlatformAuditLogs,
  mockPlatformPermissions,
  mockPlatformProfiles,
  mockPlatformRoles,
  mockPlatformShopMembers,
  mockPlatformShops,
  mockPlatformSystemStatuses,
} from "./mock";

type Assert<T extends true> = T;
type IsAssignable<TValue, TExpected> = TValue extends TExpected ? true : false;

export type ProfilesAreTyped = Assert<
  IsAssignable<(typeof mockPlatformProfiles)[number], Profile>
>;
export type ShopsAreTyped = Assert<
  IsAssignable<(typeof mockPlatformShops)[number], Shop>
>;
export type ShopMembersAreTyped = Assert<
  IsAssignable<(typeof mockPlatformShopMembers)[number], ShopMember>
>;
export type RolesAreTyped = Assert<
  IsAssignable<(typeof mockPlatformRoles)[number], Role>
>;
export type PermissionsAreTyped = Assert<
  IsAssignable<(typeof mockPlatformPermissions)[number], Permission>
>;
export type AuditLogsAreTyped = Assert<
  IsAssignable<(typeof mockPlatformAuditLogs)[number], AuditLog>
>;
export type SystemStatusesAreTyped = Assert<
  IsAssignable<(typeof mockPlatformSystemStatuses)[number], SystemStatus>
>;

export {};
