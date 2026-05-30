import type {
  AuditLog,
  Permission,
  Profile,
  Role,
  Shop,
  ShopMember,
  SystemStatus,
} from "./types";

export const mockPlatformProfiles = [
  {
    profile_id: "demo_profile_001",
    display_name: "Platform User A",
    profile_status: "active",
    created_at: "2026-01-10T09:00:00.000Z",
  },
  {
    profile_id: "demo_profile_002",
    display_name: "Platform User B",
    profile_status: "review",
    created_at: "2026-01-11T09:00:00.000Z",
  },
  {
    profile_id: "demo_profile_003",
    display_name: "Platform User C",
    profile_status: "active",
    created_at: "2026-01-12T09:00:00.000Z",
  },
  {
    profile_id: "demo_profile_004",
    display_name: "Platform User D",
    profile_status: "disabled",
    created_at: "2026-01-13T09:00:00.000Z",
  },
] as const satisfies readonly Profile[];

export const mockPlatformShops = [
  {
    shop_id: "demo_shop_001",
    shop_code: "DEMO-001",
    shop_name: "Demo Shop North",
    shop_status: "pending_setup",
    created_at: "2026-01-20T10:00:00.000Z",
  },
  {
    shop_id: "demo_shop_002",
    shop_code: "DEMO-002",
    shop_name: "Demo Shop Central",
    shop_status: "active",
    created_at: "2026-01-21T10:00:00.000Z",
  },
  {
    shop_id: "demo_shop_003",
    shop_code: "DEMO-003",
    shop_name: "Demo Shop South",
    shop_status: "suspended",
    created_at: "2026-01-22T10:00:00.000Z",
  },
] as const satisfies readonly Shop[];

export const mockPlatformPermissions = [
  {
    permission_id: "demo_permission_platform_users_read",
    permission_key: "platform.users.read",
    scope: "global",
    description: "Read synthetic platform profile rows.",
  },
  {
    permission_id: "demo_permission_platform_shops_read",
    permission_key: "platform.shops.read",
    scope: "global",
    description: "Read synthetic platform shop rows.",
  },
  {
    permission_id: "demo_permission_platform_audit_read",
    permission_key: "platform.audit.read",
    scope: "global",
    description: "Read synthetic platform audit rows.",
  },
  {
    permission_id: "demo_permission_shop_members_read",
    permission_key: "shop.members.read",
    scope: "shop",
    description: "Read synthetic shop membership rows.",
  },
  {
    permission_id: "demo_permission_shop_operations_view",
    permission_key: "shop.operations.view",
    scope: "shop",
    description: "View synthetic shop operation placeholders.",
  },
] as const satisfies readonly Permission[];

export const mockPlatformRoles = [
  {
    role_id: "demo_role_platform_admin",
    role_key: "platform_admin",
    scope: "global",
    label: "Platform Admin",
    permission_ids: [
      "demo_permission_platform_users_read",
      "demo_permission_platform_shops_read",
      "demo_permission_platform_audit_read",
    ],
  },
  {
    role_id: "demo_role_shop_owner",
    role_key: "shop_owner",
    scope: "shop",
    label: "Shop Owner",
    permission_ids: [
      "demo_permission_shop_members_read",
      "demo_permission_shop_operations_view",
    ],
  },
  {
    role_id: "demo_role_shop_manager",
    role_key: "shop_manager",
    scope: "shop",
    label: "Shop Manager",
    permission_ids: ["demo_permission_shop_members_read"],
  },
  {
    role_id: "demo_role_cashier",
    role_key: "cashier",
    scope: "shop",
    label: "Cashier",
    permission_ids: [],
  },
  {
    role_id: "demo_role_viewer",
    role_key: "viewer",
    scope: "global",
    label: "Viewer",
    permission_ids: ["demo_permission_platform_users_read"],
  },
] as const satisfies readonly Role[];

export const mockPlatformShopMembers = [
  {
    shop_member_id: "demo_member_001",
    profile_id: "demo_profile_003",
    shop_id: "demo_shop_001",
    role_id: "demo_role_shop_owner",
    membership_status: "active",
  },
  {
    shop_member_id: "demo_member_002",
    profile_id: "demo_profile_004",
    shop_id: "demo_shop_002",
    role_id: "demo_role_shop_manager",
    membership_status: "invited",
  },
  {
    shop_member_id: "demo_member_003",
    profile_id: "demo_profile_002",
    shop_id: "demo_shop_003",
    role_id: "demo_role_viewer",
    membership_status: "suspended",
  },
] as const satisfies readonly ShopMember[];

export const mockPlatformAuditLogs = [
  {
    audit_log_id: "demo_audit_001",
    actor_profile_id: "demo_profile_001",
    scope: "global",
    event: "System Event A",
    severity: "info",
    result: "success",
    created_at: "2026-02-01T08:00:00.000Z",
  },
  {
    audit_log_id: "demo_audit_002",
    actor_profile_id: "demo_profile_002",
    scope: "shop",
    shop_id: "demo_shop_001",
    event: "System Event B",
    severity: "warning",
    result: "simulated",
    created_at: "2026-02-01T08:10:00.000Z",
  },
  {
    audit_log_id: "demo_audit_003",
    scope: "global",
    event: "System Event C",
    severity: "critical",
    result: "blocked",
    created_at: "2026-02-01T08:20:00.000Z",
  },
] as const satisfies readonly AuditLog[];

export const mockPlatformSystemStatuses = [
  {
    system_status_id: "demo_system_status_001",
    area: "ui_shell",
    status: "operational",
    severity: "info",
    message: "Static Platform Admin shell is available.",
  },
  {
    system_status_id: "demo_system_status_002",
    area: "database_planning",
    status: "planned",
    severity: "warning",
    message: "Database schema discovery belongs to TASK-004.",
  },
  {
    system_status_id: "demo_system_status_003",
    area: "audit_surface",
    status: "planned",
    severity: "warning",
    message: "Audit backend planning belongs to TASK-004.",
  },
  {
    system_status_id: "demo_system_status_004",
    area: "access_control_planning",
    status: "blocked",
    severity: "critical",
    message: "Real access control is outside TASK-003.",
  },
] as const satisfies readonly SystemStatus[];
