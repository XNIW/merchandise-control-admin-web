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
  business_address?: string;
  business_city?: string;
  business_giro?: string;
  company_rut?: string;
  fiscal_identity_locked_by_platform?: boolean;
  legal_representative_rut?: string;
  shop_id: string;
  shop_code: string;
  shop_name: string;
  shop_status: ShopStatus;
  created_at: string;
  updated_at?: string;
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
  target_type?: string;
  target_id?: string;
  metadata_summary?: string;
  created_at: string;
};

export type PlatformAdminRecord = {
  platform_admin_id: string;
  profile_id: string;
  status: "active" | "revoked";
  granted_at: string;
  revoked_at?: string;
  last_reviewed_at?: string;
  reason_redacted?: string;
};

export type PlatformDeviceOverview = {
  shop_device_id: string;
  shop_id: string;
  device_identifier: string;
  display_name: string;
  device_type: string;
  status: string;
  app_version?: string;
  last_seen_at?: string;
  updated_at: string;
};

export type PlatformSyncOverview = {
  sync_event_id: string;
  owner_user_id: string;
  store_id?: string;
  source?: string;
  source_device_id?: string;
  domain: string;
  event_type: string;
  changed_count: number;
  metadata_summary: string;
  created_at: string;
};

export type PlatformHealthStatus =
  | "PASS"
  | "PASS_WITH_NOTES"
  | "NOT_RUN"
  | "BLOCKED"
  | "not_configured";

export type PlatformDataHealth = {
  shops_without_owner: number;
  profiles_without_membership: number;
  orphaned_memberships: number;
  suspended_shops_with_recent_activity: number;
  audit_coverage: PlatformHealthStatus;
  inventory_mapping_status: PlatformHealthStatus;
  sync_history_mapping_status: PlatformHealthStatus;
  device_schema_status: PlatformHealthStatus;
  staff_schema_status: PlatformHealthStatus;
  migration_drift_status: PlatformHealthStatus;
};

export type SystemStatus = {
  system_status_id: string;
  area: SystemStatusArea;
  status: SystemStatusValue;
  severity: SystemStatusSeverity;
  message: string;
};
