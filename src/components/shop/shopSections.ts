export type ShopSectionKey =
  | "overview"
  | "products"
  | "categories"
  | "suppliers"
  | "importExport"
  | "sync"
  | "history"
  | "members"
  | "roles"
  | "staff"
  | "pos"
  | "devices"
  | "settings"
  | "audit";

export type ShopSectionMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warning" | "muted";
};

export type ShopSectionTableColumn = {
  key: string;
  label: string;
};

export type ShopSectionTableRow = Record<string, string> & {
  rowKey: string;
};

export type ShopSectionLiveData = {
  title: string;
  description: string;
  columns: ShopSectionTableColumn[];
  rows: ShopSectionTableRow[];
  emptyState: {
    title: string;
    description: string;
  };
};

export type ShopSection = {
  key: ShopSectionKey;
  label: string;
  href: string;
  title: string;
  eyebrow: string;
  description: string;
  status: string;
  metrics: ShopSectionMetric[];
  plannedWork: string[];
  guardrails: string[];
  liveData?: ShopSectionLiveData;
};

export type ShopNavigationSection = {
  key: string;
  label: string;
  items: Array<{
    key: ShopSectionKey;
    label: string;
    href: string;
  }>;
};

export const shopNavigationSections: ShopNavigationSection[] = [
  {
    key: "workspace",
    label: "Workspace",
    items: [{ key: "overview", label: "Overview", href: "/shop/overview" }],
  },
  {
    key: "catalog",
    label: "Catalog",
    items: [
      { key: "products", label: "Products", href: "/shop/products" },
      { key: "categories", label: "Categories", href: "/shop/categories" },
      { key: "suppliers", label: "Suppliers", href: "/shop/suppliers" },
      {
        key: "importExport",
        label: "Import / Export",
        href: "/shop/import-export",
      },
    ],
  },
  {
    key: "access",
    label: "Access",
    items: [
      { key: "members", label: "Members", href: "/shop/members" },
      { key: "roles", label: "Roles", href: "/shop/roles" },
    ],
  },
  {
    key: "pos_staff",
    label: "POS / Staff",
    items: [
      { key: "staff", label: "Staff", href: "/shop/staff" },
      { key: "pos", label: "POS Live", href: "/shop/pos" },
      { key: "devices", label: "Devices", href: "/shop/devices" },
    ],
  },
  {
    key: "data_diagnostics",
    label: "Data",
    items: [
      { key: "sync", label: "Sync Center", href: "/shop/sync" },
      { key: "history", label: "History", href: "/shop/history" },
      { key: "audit", label: "Audit", href: "/shop/audit" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    items: [{ key: "settings", label: "Settings", href: "/shop/settings" }],
  },
];

export const shopNavigationItems = shopNavigationSections.flatMap(
  (section) => section.items,
);

const shellMetrics: ShopSectionMetric[] = [
  {
    label: "Live data",
    value: "Not available",
    detail: "Waiting for a verified shop schema",
    tone: "warning",
  },
  {
    label: "Access",
    value: "Server verified",
    detail: "Rendered only after shop membership authorization",
    tone: "good",
  },
  {
    label: "Writes",
    value: "Unavailable",
    detail: "No changes are available in this section",
    tone: "muted",
  },
];

export const sharedShopGuardrails = [
  "Rows must stay limited to this shop and active membership.",
  "Planned pages do not show placeholder rows as live data.",
  "POS staff stays separate from personal admin accounts.",
  "Credential hashes, PINs, passwords and raw tokens must never be rendered.",
];

export const shopSections: Record<ShopSectionKey, ShopSection> = {
  overview: {
    key: "overview",
    label: "Overview",
    href: "/shop/overview",
    title: "Shop Overview",
    eyebrow: "Admin Console",
    description:
      "Workspace shell for shop owners and managers. Live shop summaries are intentionally deferred until the shop-scoped read model is implemented.",
    status: "Shell placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Connect shop-scoped read model",
      "Add shop switcher for multi-shop accounts",
      "Surface operational summaries from authorized shop data",
    ],
    guardrails: sharedShopGuardrails,
  },
  products: {
    key: "products",
    label: "Products",
    href: "/shop/products",
    title: "Products",
    eyebrow: "Catalog",
    description:
      "Catalog surface reserved for real shop-scoped products after schema discovery and read-model work.",
    status: "Read model pending",
    metrics: shellMetrics,
    plannedWork: [
      "Verify product schema or add documented additive migration",
      "Render authorized product rows only",
      "Add controlled create/update/archive in a later milestone",
    ],
    guardrails: sharedShopGuardrails,
  },
  categories: {
    key: "categories",
    label: "Categories",
    href: "/shop/categories",
    title: "Categories",
    eyebrow: "Catalog taxonomy",
    description:
      "Category management placeholder for the future shop-scoped catalog taxonomy.",
    status: "Read model pending",
    metrics: shellMetrics,
    plannedWork: [
      "Verify or add shop_categories schema",
      "Render empty/error states before CRUD",
      "Audit future category mutations",
    ],
    guardrails: sharedShopGuardrails,
  },
  suppliers: {
    key: "suppliers",
    label: "Suppliers",
    href: "/shop/suppliers",
    title: "Suppliers",
    eyebrow: "Procurement",
    description:
      "Supplier directory placeholder for future shop-scoped purchasing and product source work.",
    status: "Read model pending",
    metrics: shellMetrics,
    plannedWork: [
      "Verify or add shop_suppliers schema",
      "Keep contact fields redacted where needed",
      "Audit future supplier lifecycle changes",
    ],
    guardrails: sharedShopGuardrails,
  },
  importExport: {
    key: "importExport",
    label: "Import / Export",
    href: "/shop/import-export",
    title: "Import / Export",
    eyebrow: "Catalog transfer",
    description:
      "Excel workbook import/export for live catalog transfer with preview before apply, server-only parsing/writing and audited catalog RPCs.",
    status: "Planning placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Preview workbook rows before any apply step",
      "Use the server-only workbook parser/writer already installed",
      "Respect file and row limits before audited catalog RPCs",
    ],
    guardrails: sharedShopGuardrails,
  },
  sync: {
    key: "sync",
    label: "Sync Center",
    href: "/shop/sync",
    title: "Sync Center",
    eyebrow: "Mobile sync",
    description:
      "Administrative view of sync events for the selected shop. No synchronization is started from Admin Web.",
    status: "Read-only pending",
    metrics: shellMetrics,
    plannedWork: [
      "Resolve shop_inventory_sources before reading owner-scoped sync events",
      "Classify pending, success and failed activity without mutating sync state",
      "Keep sync activity separate from shop audit logs",
    ],
    guardrails: sharedShopGuardrails,
  },
  history: {
    key: "history",
    label: "History",
    href: "/shop/history",
    title: "Mobile History",
    eyebrow: "Mobile sync",
    description:
      "Mobile history and sync activity surface for a mapped shop inventory source.",
    status: "Read model pending",
    metrics: shellMetrics,
    plannedWork: [
      "Resolve shop_inventory_sources before reading owner-scoped history",
      "Summarize sync payloads with recursive redaction",
      "Keep mobile sync activity distinct from web audit logs",
    ],
    guardrails: sharedShopGuardrails,
  },
  members: {
    key: "members",
    label: "Members",
    href: "/shop/members",
    title: "Members",
    eyebrow: "Shop access",
    description:
      "Member management placeholder for shop owners and managers, built on active shop_members records.",
    status: "Planning placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "List active members for the selected shop only",
      "Prevent role escalation and unsafe owner changes",
      "Audit member lifecycle actions",
    ],
    guardrails: sharedShopGuardrails,
  },
  roles: {
    key: "roles",
    label: "Roles",
    href: "/shop/roles",
    title: "Roles",
    eyebrow: "Permissions",
    description:
      "Read-only baseline permission matrix for shop_owner, shop_manager and POS staff roles; no granular role editor is implied.",
    status: "Planning placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Verify existing roles and permissions schema",
      "Keep cashier and POS staff separate from personal members",
      "Document granular permissions before expanding scope",
    ],
    guardrails: sharedShopGuardrails,
  },
  staff: {
    key: "staff",
    label: "POS / Staff",
    href: "/shop/staff",
    title: "POS / Staff",
    eyebrow: "Operations",
    description:
      "POS Staff inside Admin Console. Staff accounts remain shop-scoped and separate from personal admin login.",
    status: "Planning placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Verify staff_accounts schema before any credential work",
      "Never store PIN/password values in plain text",
      "Allow staff records without active credentials if hashing is not ready",
    ],
    guardrails: sharedShopGuardrails,
  },
  pos: {
    key: "pos",
    label: "POS Live",
    href: "/shop/pos",
    title: "POS Live",
    eyebrow: "Operations",
    description:
      "Read-only live view for trusted POS devices and sessions registered against this shop.",
    status: "Read model pending",
    metrics: shellMetrics,
    plannedWork: [
      "Read trusted POS devices and sessions for the selected shop",
      "Show staff and heartbeat state without exposing tokens",
      "Keep sales synchronization outside this dashboard",
    ],
    guardrails: sharedShopGuardrails,
  },
  devices: {
    key: "devices",
    label: "Devices",
    href: "/shop/devices",
    title: "Devices",
    eyebrow: "Authorized hardware",
    description:
      "Device management placeholder for future POS and shop hardware authorization.",
    status: "Planning placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Verify devices schema before adding UI state",
      "Redact fingerprints or device tokens",
      "Audit authorize/suspend/archive actions",
    ],
    guardrails: sharedShopGuardrails,
  },
  settings: {
    key: "settings",
    label: "Settings",
    href: "/shop/settings",
    title: "Settings",
    eyebrow: "Shop profile",
    description:
      "Settings placeholder for safe shop profile updates after read-model and mutation planning.",
    status: "Planning placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Show verified shop profile data",
      "Avoid shop_code changes without a dedicated plan",
      "Audit safe settings updates",
    ],
    guardrails: sharedShopGuardrails,
  },
  audit: {
    key: "audit",
    label: "Audit",
    href: "/shop/audit",
    title: "Audit",
    eyebrow: "Shop activity",
    description:
      "Shop audit placeholder for redacted, shop-scoped events once the read model is available.",
    status: "Read model pending",
    metrics: shellMetrics,
    plannedWork: [
      "Read only events for the selected shop",
      "Redact metadata before rendering",
      "Add filters after the base audit list is safe",
    ],
    guardrails: sharedShopGuardrails,
  },
};
