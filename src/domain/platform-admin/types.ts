export type PlatformRoleKey =
  | "platform_admin"
  | "shop_owner"
  | "shop_manager"
  | "cashier"
  | "viewer";

export type PlatformScope = "global" | "shop";

export type ProfileStatus = "active" | "review" | "disabled";

export type ShopStatus = "active" | "pending_setup" | "suspended" | "archived";

export type MembershipStatus = "active" | "invited" | "suspended";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditResult = "success" | "blocked" | "simulated" | "failure";

export type SystemStatusValue =
  | "operational"
  | "planned"
  | "degraded"
  | "blocked";

export type SystemStatusSeverity = "info" | "warning" | "critical";

export type SystemStatusArea =
  | "database_planning"
  | "audit_surface"
  | "ui_shell"
  | "access_control_planning";

export type Profile = {
  profile_id: string;
  display_name: string;
  profile_status: ProfileStatus;
  created_at: string;
};

export type Shop = {
  shop_id: string;
  shop_code: string;
  shop_name: string;
  shop_status: ShopStatus;
  created_at: string;
};

export type ShopMember = {
  shop_member_id: string;
  profile_id: string;
  shop_id: string;
  role_id: string;
  membership_status: MembershipStatus;
};

export type Role = {
  role_id: string;
  role_key: PlatformRoleKey;
  scope: PlatformScope;
  label: string;
  permission_ids: readonly string[];
};

export type Permission = {
  permission_id: string;
  permission_key: string;
  scope: PlatformScope;
  description: string;
};

export type AuditLog = {
  audit_log_id: string;
  actor_profile_id?: string;
  scope: PlatformScope;
  shop_id?: string;
  event: string;
  severity: AuditSeverity;
  result: AuditResult;
  created_at: string;
};

export type SystemStatus = {
  system_status_id: string;
  area: SystemStatusArea;
  status: SystemStatusValue;
  severity: SystemStatusSeverity;
  message: string;
};
