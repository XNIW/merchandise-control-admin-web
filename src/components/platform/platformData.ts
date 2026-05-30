export type PlatformSectionKey =
  | "overview"
  | "users"
  | "shops"
  | "audit"
  | "system"
  | "operations";

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

export type TableRow = Record<string, string>;

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
};

export const navigationItems: Array<{
  key: PlatformSectionKey;
  label: string;
  href: string;
}> = [
  { key: "overview", label: "Overview", href: "/platform" },
  { key: "users", label: "Users / Profiles", href: "/platform/users" },
  { key: "shops", label: "Shops", href: "/platform/shops" },
  { key: "audit", label: "Audit", href: "/platform/audit" },
  { key: "system", label: "System Status", href: "/platform/system" },
  { key: "operations", label: "Safe Operations", href: "/platform/operations" },
];

export const platformSections: Record<PlatformSectionKey, PlatformSection> = {
  overview: {
    key: "overview",
    title: "Platform Overview",
    eyebrow: "Platform Admin Console",
    description:
      "Synthetic overview of the master console for platform health, shops, profiles, audit visibility, and controlled operations.",
    status: "Static shell",
    stats: [
      {
        label: "Demo shops",
        value: "12",
        detail: "Placeholder count for layout validation",
        tone: "neutral",
      },
      {
        label: "Platform users",
        value: "48",
        detail: "Synthetic profiles, no real accounts",
        tone: "good",
      },
      {
        label: "Audit events",
        value: "126",
        detail: "Static activity preview",
        tone: "muted",
      },
      {
        label: "Setup items",
        value: "3",
        detail: "Pending future schema planning",
        tone: "warning",
      },
    ],
    columns: [
      { key: "area", label: "Area" },
      { key: "signal", label: "Signal" },
      { key: "state", label: "State" },
      { key: "next", label: "Next step" },
    ],
    rows: [
      {
        area: "Users / Profiles",
        signal: "Platform User access model",
        state: "Placeholder",
        next: "TASK-003 types",
      },
      {
        area: "Shops",
        signal: "Demo Shop inventory",
        state: "Placeholder",
        next: "TASK-003 mock",
      },
      {
        area: "Audit",
        signal: "Audit Event stream",
        state: "Placeholder",
        next: "TASK-004 planning",
      },
    ],
  },
  users: {
    key: "users",
    title: "Users / Profiles",
    eyebrow: "Identity overview",
    description:
      "Static profile directory preview for future platform-level account visibility. No auth, login, API, or real user data is connected.",
    status: "Placeholder data",
    stats: [
      {
        label: "Profile rows",
        value: "4",
        detail: "Synthetic table preview",
        tone: "neutral",
      },
      {
        label: "Global roles",
        value: "1",
        detail: "Platform Admin placeholder",
        tone: "good",
      },
      {
        label: "Shop-scoped roles",
        value: "3",
        detail: "Reserved for TASK-003",
        tone: "muted",
      },
    ],
    columns: [
      { key: "profile", label: "Profile" },
      { key: "role", label: "Role" },
      { key: "scope", label: "Scope" },
      { key: "state", label: "State" },
    ],
    rows: [
      {
        profile: "Platform User A",
        role: "platform_admin",
        scope: "Global",
        state: "Demo active",
      },
      {
        profile: "Platform User B",
        role: "viewer",
        scope: "Global preview",
        state: "Demo review",
      },
      {
        profile: "Platform User C",
        role: "shop_owner",
        scope: "Demo Shop",
        state: "Shop-scoped",
      },
    ],
  },
  shops: {
    key: "shops",
    title: "Shops",
    eyebrow: "Shop root model",
    description:
      "Static shop registry preview using shops as the business root. No merchant-to-store hierarchy is introduced.",
    status: "Shop root",
    stats: [
      {
        label: "Demo shops",
        value: "12",
        detail: "Synthetic roots",
        tone: "neutral",
      },
      {
        label: "Pending setup",
        value: "2",
        detail: "Non-operational placeholders",
        tone: "warning",
      },
      {
        label: "Archived",
        value: "0",
        detail: "No real lifecycle action",
        tone: "muted",
      },
    ],
    columns: [
      { key: "shop", label: "Shop" },
      { key: "code", label: "Shop code" },
      { key: "owner", label: "Owner placeholder" },
      { key: "state", label: "State" },
    ],
    rows: [
      {
        shop: "Demo Shop North",
        code: "DEMO-001",
        owner: "Platform User C",
        state: "Pending Setup",
      },
      {
        shop: "Demo Shop Central",
        code: "DEMO-002",
        owner: "Platform User D",
        state: "Static active",
      },
      {
        shop: "Demo Shop South",
        code: "DEMO-003",
        owner: "Unassigned placeholder",
        state: "Needs TASK-006",
      },
    ],
  },
  audit: {
    key: "audit",
    title: "Audit",
    eyebrow: "Global traceability",
    description:
      "Static audit surface for future sensitive-action visibility. Events are synthetic and do not represent real activity.",
    status: "Synthetic log",
    stats: [
      {
        label: "Audit events",
        value: "126",
        detail: "Static preview only",
        tone: "neutral",
      },
      {
        label: "Sensitive actions",
        value: "0",
        detail: "No real actions wired",
        tone: "good",
      },
      {
        label: "Retention policy",
        value: "Planned",
        detail: "Future TASK-004 planning",
        tone: "muted",
      },
    ],
    columns: [
      { key: "event", label: "Event" },
      { key: "actor", label: "Actor" },
      { key: "scope", label: "Scope" },
      { key: "result", label: "Result" },
    ],
    rows: [
      {
        event: "Audit Event: profile view",
        actor: "Platform User A",
        scope: "Global",
        result: "Synthetic success",
      },
      {
        event: "Audit Event: shop review",
        actor: "Platform User B",
        scope: "Demo Shop",
        result: "Synthetic recorded",
      },
      {
        event: "Audit Event: system check",
        actor: "System Event",
        scope: "Platform",
        result: "Static preview",
      },
    ],
  },
  system: {
    key: "system",
    title: "System Status",
    eyebrow: "Platform health",
    description:
      "Static health dashboard for operational scanning. No monitoring service, API, or live infrastructure is connected.",
    status: "Static health",
    stats: [
      {
        label: "Web shell",
        value: "Ready",
        detail: "Static App Router page",
        tone: "good",
      },
      {
        label: "Supabase",
        value: "Out",
        detail: "Reserved for TASK-004",
        tone: "muted",
      },
      {
        label: "Actions",
        value: "Off",
        detail: "Reserved for TASK-006",
        tone: "warning",
      },
    ],
    columns: [
      { key: "service", label: "Service" },
      { key: "state", label: "State" },
      { key: "source", label: "Source" },
      { key: "note", label: "Note" },
    ],
    rows: [
      {
        service: "Admin Web",
        state: "Static shell",
        source: "TASK-002",
        note: "No runtime integration",
      },
      {
        service: "Data boundary",
        state: "Not connected",
        source: "TASK-004",
        note: "Schema planning required",
      },
      {
        service: "Audit backend",
        state: "Not connected",
        source: "TASK-004",
        note: "Policy planning required",
      },
    ],
  },
  operations: {
    key: "operations",
    title: "Safe Operations",
    eyebrow: "Controlled actions placeholder",
    description:
      "Disabled preview of future server-side platform actions. These controls are non-operational until authorization and audit logging are implemented.",
    status: "Disabled",
    stats: [
      {
        label: "Available actions",
        value: "0",
        detail: "No real admin actions",
        tone: "good",
      },
      {
        label: "Future actions",
        value: "5",
        detail: "Reserved for TASK-006",
        tone: "warning",
      },
      {
        label: "Audit requirement",
        value: "On",
        detail: "Mandatory before activation",
        tone: "neutral",
      },
    ],
    columns: [
      { key: "operation", label: "Operation" },
      { key: "availability", label: "Availability" },
      { key: "requirement", label: "Requirement" },
      { key: "task", label: "Task" },
    ],
    rows: [
      {
        operation: "Create shop",
        availability: "Disabled placeholder",
        requirement: "Server-side authorization",
        task: "TASK-006",
      },
      {
        operation: "Assign owner",
        availability: "Disabled placeholder",
        requirement: "Audit log required",
        task: "TASK-006",
      },
      {
        operation: "Suspend shop",
        availability: "Disabled placeholder",
        requirement: "Controlled action policy",
        task: "TASK-006",
      },
    ],
    operations: [
      {
        label: "Create shop",
        description:
          "Available in TASK-006 after server-side authorization and audit log.",
      },
      {
        label: "Assign owner",
        description:
          "Available in TASK-006 after ownership rules and audit log.",
      },
      {
        label: "Suspend shop",
        description:
          "Available in TASK-006 after controlled action policy.",
      },
    ],
  },
};
