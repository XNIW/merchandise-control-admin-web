import type { AccountIdentitySummary } from "@/lib/account-identity";

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
  cellVariant?: "code" | "primary" | "state";
  icon?: "archive" | "barcode" | "package";
  key: string;
  label: string;
};

export type ShopSectionTableCellValue = string | AccountIdentitySummary;

export type ShopSectionTableRow = {
  [key: string]: ShopSectionTableCellValue | undefined;
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
  secondaryLiveData?: ShopSectionLiveData[];
};

export type ShopNavigationSection = {
  key: string;
  label: string;
  items: Array<{
    key: ShopSectionKey;
    label: string;
    href: string;
    hiddenFromPrimaryNav?: boolean;
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
      { key: "history", label: "History Entries", href: "/shop/history" },
      {
        key: "importExport",
        label: "Import / Export",
        href: "/shop/import-export",
        hiddenFromPrimaryNav: true,
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
      { key: "pos", label: "Incassi POS", href: "/shop/pos" },
      { key: "devices", label: "Devices", href: "/shop/devices" },
    ],
  },
  {
    key: "data_diagnostics",
    label: "Data",
    items: [
      { key: "sync", label: "Sync Center", href: "/shop/sync" },
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
    eyebrow: "Shop Admin",
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
    description: "Manage products, prices, stock and mapped mobile catalog.",
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
    eyebrow: "Catalog",
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
    eyebrow: "Catalog",
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
    eyebrow: "Catalog",
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
    eyebrow: "Data",
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
    label: "History Entries",
    href: "/shop/history",
    title: "Android / iOS History Entries",
    eyebrow: "Catalog",
    description: "Mobile history sessions and sync-related catalog activity.",
    status: "Read model pending",
    metrics: shellMetrics,
    plannedWork: [
      "Resolve shop_inventory_sources before reading owner-scoped history",
      "Diagnose payload v2 session overlays without mutating cloud rows",
      "Keep mobile sync activity distinct from web audit logs",
    ],
    guardrails: sharedShopGuardrails,
  },
  members: {
    key: "members",
    label: "Members",
    href: "/shop/members",
    title: "Members",
    eyebrow: "Access",
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
    eyebrow: "Access",
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
    eyebrow: "POS / Staff",
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
    label: "Incassi POS",
    href: "/shop/pos",
    title: "Incassi POS",
    eyebrow: "POS / Staff",
    description:
      "Daily, monthly and annual POS revenue from the signed sales ledger.",
    status: "Revenue ledger",
    metrics: shellMetrics,
    plannedWork: [
      "Read signed POS revenue ledger for the selected shop",
      "Show full, documented and verification revenue views",
      "Keep polling bounded to this page",
    ],
    guardrails: sharedShopGuardrails,
  },
  devices: {
    key: "devices",
    label: "Devices",
    href: "/shop/devices",
    title: "Devices",
    eyebrow: "POS / Staff",
    description: "Registered Android, iOS, POS and web clients for this shop.",
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
    eyebrow: "Settings",
    description:
      "Shop profile and fiscal identity are managed by Master Console. Admin Console can view these fields but cannot edit them.",
    status: "Read-only",
    metrics: shellMetrics,
    plannedWork: [
      "Show verified shop profile data",
      "Keep shop profile updates in Master Console",
      "Keep fiscal identity read-only in Admin Console",
    ],
    guardrails: sharedShopGuardrails,
  },
  audit: {
    key: "audit",
    label: "Audit",
    href: "/shop/audit",
    title: "Audit",
    eyebrow: "Data",
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
