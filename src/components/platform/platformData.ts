export type PlatformSectionKey =
  | "overview"
  | "users"
  | "shops"
  | "provisioning"
  | "admins"
  | "audit"
  | "system"
  | "data"
  | "devices"
  | "sync"
  | "history"
  | "operations"
  | "support";

export type StatItem = {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warning" | "muted";
};

export type TableColumn = {
  key: string;
  label: string;
};

export type TableRow = Record<string, string> & {
  rowKey?: string;
};

export type EmptyStateContent = {
  title: string;
  description: string;
};

export type OperationItem = {
  label: string;
  description: string;
};

export type PlatformSection = {
  key: PlatformSectionKey;
  title: string;
  eyebrow: string;
  description: string;
  status: string;
  stats: StatItem[];
  columns: TableColumn[];
  rows: TableRow[];
  emptyState?: EmptyStateContent;
  operations?: OperationItem[];
  guardrails?: string[];
};

export const navigationItems: Array<{
  key: PlatformSectionKey;
  label: string;
  href: string;
}> = [
  { key: "overview", label: "Overview", href: "/platform" },
  { key: "users", label: "Users", href: "/platform/users" },
  { key: "shops", label: "Shops", href: "/platform/shops" },
  { key: "provisioning", label: "Provisioning", href: "/platform/provisioning" },
  { key: "admins", label: "Admins", href: "/platform/admins" },
  { key: "audit", label: "Audit", href: "/platform/audit" },
  { key: "system", label: "System", href: "/platform/system" },
  { key: "data", label: "Data", href: "/platform/data" },
  { key: "devices", label: "Devices", href: "/platform/devices" },
  { key: "sync", label: "Sync", href: "/platform/sync" },
  { key: "history", label: "History", href: "/platform/history" },
  { key: "operations", label: "Operations", href: "/platform/operations" },
  { key: "support", label: "Support", href: "/platform/support" },
];

const baseColumns = [
  { key: "area", label: "Area" },
  { key: "signal", label: "Signal" },
  { key: "state", label: "State" },
  { key: "next", label: "Next" },
];

const baseSection = (
  key: PlatformSectionKey,
  title: string,
  eyebrow: string,
  description: string,
  columns: TableColumn[] = baseColumns,
): PlatformSection => ({
  key,
  title,
  eyebrow,
  description,
  status: "Server boundary",
  stats: [],
  columns,
  rows: [],
  emptyState: {
    title: "No rows returned",
    description:
      "Rows are shown only when the server-side Platform Admin boundary returns safe DTOs.",
  },
});

export const platformSections: Record<PlatformSectionKey, PlatformSection> = {
  overview: baseSection(
    "overview",
    "Platform Overview",
    "Platform Admin Console",
    "Global ecosystem summary for shops, profiles, audit, device, sync, and data health.",
  ),
  users: baseSection(
    "users",
    "Users / Profiles",
    "Identity overview",
    "Global profile directory with memberships, platform role state, access status, and recent audit.",
    [
      { key: "profile", label: "Profile" },
      { key: "platformRole", label: "Platform role" },
      { key: "memberships", label: "Memberships" },
      { key: "state", label: "State" },
    ],
  ),
  shops: baseSection(
    "shops",
    "Shops",
    "Shop root model",
    "Global shop registry with owner, member, data health, device, sync, and audit summaries.",
    [
      { key: "shop", label: "Shop" },
      { key: "code", label: "Code" },
      { key: "owner", label: "Owner" },
      { key: "state", label: "State" },
      { key: "health", label: "Health" },
    ],
  ),
  provisioning: baseSection(
    "provisioning",
    "Provisioning",
    "Shop onboarding",
    "Create a shop with an existing active owner through the audited controlled operation.",
  ),
  admins: baseSection(
    "admins",
    "Platform Admins",
    "Global access",
    "Platform Admin grant visibility with audited grant and revoke actions behind anti-lockout RPCs.",
    [
      { key: "profile", label: "Profile" },
      { key: "status", label: "Status" },
      { key: "granted", label: "Granted" },
      { key: "review", label: "Review" },
    ],
  ),
  audit: baseSection(
    "audit",
    "Audit",
    "Global traceability",
    "Global audit list with actor, shop, action, target, date, severity, result, and redacted metadata.",
    [
      { key: "event", label: "Event" },
      { key: "actor", label: "Actor" },
      { key: "scope", label: "Scope" },
      { key: "target", label: "Target" },
      { key: "severity", label: "Severity" },
      { key: "date", label: "Date" },
    ],
  ),
  system: baseSection(
    "system",
    "System Status",
    "Platform health",
    "Runtime, auth SSR, route protection, RLS/grants, migration, and check status with redacted configuration.",
  ),
  data: baseSection(
    "data",
    "Data Health",
    "Supabase health",
    "Data quality checks for owners, memberships, mappings, audit coverage, devices, staff schema, and sync history.",
  ),
  devices: baseSection(
    "devices",
    "Global Devices",
    "Device security overview",
    "Global read-only device registry and sync source activity, with emergency actions only through audited RPCs.",
    [
      { key: "shop", label: "Shop" },
      { key: "device", label: "Device" },
      { key: "type", label: "Type" },
      { key: "state", label: "State" },
      { key: "lastSeen", label: "Last seen" },
    ],
  ),
  sync: baseSection(
    "sync",
    "Global Sync",
    "Mobile history overview",
    "Global sync/history summary separated from audit logs, with redacted and limited details.",
    [
      { key: "shop", label: "Shop" },
      { key: "source", label: "Source" },
      { key: "domain", label: "Domain" },
      { key: "event", label: "Event" },
      { key: "date", label: "Date" },
    ],
  ),
  history: baseSection(
    "history",
    "Global History",
    "Mobile history overview",
    "Alias view for global sync/history events, distinct from admin audit logs.",
  ),
  operations: baseSection(
    "operations",
    "Controlled Operations",
    "Safe operations",
    "Audited Platform Admin controls for shop provisioning, lifecycle, diagnostics, and emergency device actions.",
    [
      { key: "operation", label: "Operation" },
      { key: "availability", label: "Availability" },
      { key: "requirement", label: "Requirement" },
      { key: "state", label: "State" },
    ],
  ),
  support: baseSection(
    "support",
    "Support Diagnostics",
    "Read-only diagnostics",
    "Search-oriented support view for shop/profile access, memberships, recent audit, devices, sync, and configuration warnings.",
  ),
};
