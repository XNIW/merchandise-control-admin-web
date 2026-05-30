export type ShopSectionKey =
  | "overview"
  | "products"
  | "categories"
  | "suppliers"
  | "importExport"
  | "members"
  | "roles"
  | "staff"
  | "devices"
  | "settings"
  | "audit";

export type ShopSectionMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warning" | "muted";
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
};

export const shopNavigationItems: Array<{
  key: ShopSectionKey;
  label: string;
  href: string;
}> = [
  { key: "overview", label: "Overview", href: "/shop/overview" },
  { key: "products", label: "Products", href: "/shop/products" },
  { key: "categories", label: "Categories", href: "/shop/categories" },
  { key: "suppliers", label: "Suppliers", href: "/shop/suppliers" },
  { key: "importExport", label: "Import / Export", href: "/shop/import-export" },
  { key: "members", label: "Members", href: "/shop/members" },
  { key: "roles", label: "Roles", href: "/shop/roles" },
  { key: "staff", label: "POS / Staff", href: "/shop/staff" },
  { key: "devices", label: "Devices", href: "/shop/devices" },
  { key: "settings", label: "Settings", href: "/shop/settings" },
  { key: "audit", label: "Audit", href: "/shop/audit" },
];

const shellMetrics: ShopSectionMetric[] = [
  {
    label: "Data source",
    value: "Not connected",
    detail: "Read model starts in a later milestone",
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
    detail: "No shop-scoped mutation exists in TASK-008",
    tone: "muted",
  },
];

const sharedGuardrails = [
  "Every future read must be scoped by shop_id and active membership.",
  "No placeholder rows are presented as live shop data.",
  "Staff POS remains separate from personal auth accounts.",
];

export const shopSections: Record<ShopSectionKey, ShopSection> = {
  overview: {
    key: "overview",
    label: "Overview",
    href: "/shop/overview",
    title: "Shop Overview",
    eyebrow: "Shop Admin Console",
    description:
      "Workspace shell for shop owners and managers. Live shop summaries are intentionally deferred until the shop-scoped read model is implemented.",
    status: "Shell placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Connect shop-scoped read model",
      "Add shop switcher for multi-shop accounts",
      "Surface operational summaries from authorized shop data",
    ],
    guardrails: sharedGuardrails,
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
    guardrails: sharedGuardrails,
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
    guardrails: sharedGuardrails,
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
    guardrails: sharedGuardrails,
  },
  importExport: {
    key: "importExport",
    label: "Import / Export",
    href: "/shop/import-export",
    title: "Import / Export",
    eyebrow: "Catalog transfer",
    description:
      "Import/export placeholder. CSV fallback is preferred if Excel requires unnecessary dependencies.",
    status: "Planning placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Check available spreadsheet libraries before adding dependencies",
      "Prefer CSV export/import fallback if sufficient",
      "Validate imports before any apply step",
    ],
    guardrails: sharedGuardrails,
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
    guardrails: sharedGuardrails,
  },
  roles: {
    key: "roles",
    label: "Roles",
    href: "/shop/roles",
    title: "Roles",
    eyebrow: "Permissions",
    description:
      "Role and permission placeholder for shop_owner, shop_manager and viewer capabilities.",
    status: "Planning placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Verify existing roles and permissions schema",
      "Keep cashier and POS staff separate from personal members",
      "Document granular permissions before expanding scope",
    ],
    guardrails: sharedGuardrails,
  },
  staff: {
    key: "staff",
    label: "POS / Staff",
    href: "/shop/staff",
    title: "POS / Staff",
    eyebrow: "Operations",
    description:
      "POS staff placeholder. Staff accounts remain shop-scoped and separate from personal admin login.",
    status: "Planning placeholder",
    metrics: shellMetrics,
    plannedWork: [
      "Verify staff_accounts schema before any credential work",
      "Never store PIN/password values in plain text",
      "Allow staff records without active credentials if hashing is not ready",
    ],
    guardrails: sharedGuardrails,
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
    guardrails: sharedGuardrails,
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
    guardrails: sharedGuardrails,
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
    guardrails: sharedGuardrails,
  },
};
