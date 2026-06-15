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
  toneLabel?: string;
};

export type TableColumn = {
  key: string;
  label: string;
};

export type TableRow = Record<string, string> & {
  rowKey?: string;
};

export type RowDetailField = {
  label: string;
  value: string;
};

export type RowDetailGroup = {
  title: string;
  fields: RowDetailField[];
  notes?: string[];
};

export type RowDetailPanel = {
  rowKey: string;
  title: string;
  subtitle: string;
  href?: string;
  fields?: RowDetailField[];
  groups?: RowDetailGroup[];
  notes?: string[];
};

export type PlatformFilterOption = {
  label: string;
  value: string;
};

export type PlatformFilter = {
  key: string;
  label: string;
  options: PlatformFilterOption[];
};

export type PlatformDetailSection = {
  title: string;
  description?: string;
  fields: RowDetailField[];
  notes?: string[];
};

export type EmptyStateContent = {
  title: string;
  description: string;
};

export type OperationItem = {
  label: string;
  description: string;
};

export type PlatformPurposeItem = {
  label: string;
  detail: string;
};

export type PlatformNextLink = {
  label: string;
  href: string;
  description: string;
};

export type PlatformSection = {
  key: PlatformSectionKey;
  title: string;
  eyebrow: string;
  description: string;
  status: string;
  backHref?: string;
  backLabel?: string;
  stats: StatItem[];
  columns: TableColumn[];
  rows: TableRow[];
  filters?: PlatformFilter[];
  searchPlaceholder?: string;
  detailSections?: PlatformDetailSection[];
  rowDetails?: RowDetailPanel[];
  emptyState?: EmptyStateContent;
  operations?: OperationItem[];
  guardrails?: string[];
  purposeItems?: PlatformPurposeItem[];
  nextLinks?: PlatformNextLink[];
  diagnosticsPriority?: "primary" | "secondary";
};

export type PlatformNavigationItem = {
  key: PlatformSectionKey;
  label: string;
  href: string;
  showInPrimaryNav?: boolean;
};

export const navigationItems: PlatformNavigationItem[] = [
  { key: "overview", label: "Overview", href: "/platform" },
  { key: "users", label: "Users", href: "/platform/users" },
  { key: "shops", label: "Shops", href: "/platform/shops" },
  { key: "provisioning", label: "Provisioning", href: "/platform/provisioning" },
  { key: "admins", label: "Admins", href: "/platform/admins" },
  { key: "audit", label: "Audit", href: "/platform/audit" },
  { key: "system", label: "System", href: "/platform/system" },
  { key: "data", label: "Data", href: "/platform/data" },
  { key: "devices", label: "Devices", href: "/platform/devices", showInPrimaryNav: false },
  { key: "sync", label: "Sync", href: "/platform/sync", showInPrimaryNav: false },
  { key: "history", label: "History", href: "/platform/history" },
  { key: "operations", label: "Operations", href: "/platform/operations" },
  { key: "support", label: "Support", href: "/platform/support" },
];

export const primaryNavigationItems = navigationItems.filter(
  (item) => item.showInPrimaryNav !== false,
);

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
    title: "No rows visible",
    description:
      "Rows are shown only when the server-side Master Console boundary returns safe DTOs.",
  },
});

export const platformSections: Record<PlatformSectionKey, PlatformSection> = {
  overview: baseSection(
    "overview",
    "Platform Overview",
    "Master Console",
    "Global ecosystem summary for shops, profiles, audit, device/sync diagnostics, and data health.",
  ),
  users: baseSection(
    "users",
    "Users / Profiles",
    "Identity overview",
    "Global profile directory with memberships, platform role state, access status, and recent audit.",
    [
      { key: "profile", label: "Profile" },
      { key: "origin", label: "Origin" },
      { key: "access", label: "Access" },
      { key: "shops", label: "Shops" },
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
      { key: "owners", label: "Owners" },
      { key: "members", label: "Members" },
      { key: "devices", label: "Devices" },
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
    "Device Signals",
    "Internal diagnostic",
    "Read-only diagnostic view for global device coverage and support signals. Daily device management belongs to Admin Console.",
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
    "Sync Signals",
    "Internal diagnostic",
    "Read-only diagnostic view for global sync signals. Shop-level sync troubleshooting belongs to Admin Console.",
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
    "History overview",
    "Read-only history view for mobile/inventory history and high-level sync history.",
    [
      { key: "shop", label: "Shop" },
      { key: "history", label: "History signal" },
      { key: "scope", label: "Scope" },
      { key: "date", label: "Date" },
      { key: "next", label: "Next" },
    ],
  ),
  operations: baseSection(
    "operations",
    "Controlled Operations",
    "Lifecycle operations",
    "Audited Platform Admin controls for shop lifecycle, restore, diagnostics, and emergency device actions.",
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
    "Read-only diagnostic view for access, membership, shop setup, devices, sync, and recent audit signals.",
    [
      { key: "subject", label: "Subject" },
      { key: "signal", label: "Signal" },
      { key: "state", label: "State" },
      { key: "suggestedNextStep", label: "Suggested next step" },
    ],
  ),
};
