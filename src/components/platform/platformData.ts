import {
  mockPlatformAuditLogs,
  mockPlatformProfiles,
  mockPlatformRoles,
  mockPlatformShopMembers,
  mockPlatformShops,
  mockPlatformSystemStatuses,
} from "@/domain/platform-admin";

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
  { key: "operations", label: "Controlled Operations", href: "/platform/operations" },
];

const profileNameById = new Map<string, string>(
  mockPlatformProfiles.map((profile) => [
    profile.profile_id,
    profile.display_name,
  ]),
);

const roleById = new Map<string, (typeof mockPlatformRoles)[number]>(
  mockPlatformRoles.map((role) => [role.role_id, role]),
);

const shopById = new Map<string, (typeof mockPlatformShops)[number]>(
  mockPlatformShops.map((shop) => [shop.shop_id, shop]),
);

const formatToken = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getProfileName = (profileId?: string) =>
  profileId ? (profileNameById.get(profileId) ?? "Platform User") : "System Event";

const getShopName = (shopId?: string) =>
  shopId ? (shopById.get(shopId)?.shop_name ?? "Demo Shop") : "Global";

const getRoleKey = (roleId?: string) =>
  roleId ? (roleById.get(roleId)?.role_key ?? "viewer") : "viewer";

const countRolesByScope = (scope: "global" | "shop") =>
  mockPlatformRoles.filter((role) => role.scope === scope).length;

const countShopsByStatus = (status: string) =>
  mockPlatformShops.filter((shop) => shop.shop_status === status).length;

const countSystemStatusesNotOperational = () =>
  mockPlatformSystemStatuses.filter((item) => item.status !== "operational")
    .length;

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
        value: String(mockPlatformShops.length),
        detail: "Synthetic domain mock count",
        tone: "neutral",
      },
      {
        label: "Platform users",
        value: String(mockPlatformProfiles.length),
        detail: "Synthetic profiles, no real accounts",
        tone: "good",
      },
      {
        label: "Audit events",
        value: String(mockPlatformAuditLogs.length),
        detail: "Static activity preview",
        tone: "muted",
      },
      {
        label: "Setup items",
        value: String(countSystemStatusesNotOperational()),
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
        value: String(mockPlatformProfiles.length),
        detail: "Synthetic table preview",
        tone: "neutral",
      },
      {
        label: "Global roles",
        value: String(countRolesByScope("global")),
        detail: "Platform Admin placeholder",
        tone: "good",
      },
      {
        label: "Shop-scoped roles",
        value: String(countRolesByScope("shop")),
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
    rows: mockPlatformProfiles.slice(0, 3).map((profile) => {
      const membership = mockPlatformShopMembers.find(
        (member) => member.profile_id === profile.profile_id,
      );
      const roleKey =
        profile.profile_id === "demo_profile_001"
          ? "platform_admin"
          : getRoleKey(membership?.role_id);

      return {
        profile: profile.display_name,
        role: roleKey,
        scope: membership ? getShopName(membership.shop_id) : "Global",
        state: `Demo ${formatToken(profile.profile_status).toLowerCase()}`,
      };
    }),
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
        value: String(mockPlatformShops.length),
        detail: "Synthetic roots",
        tone: "neutral",
      },
      {
        label: "Pending setup",
        value: String(countShopsByStatus("pending_setup")),
        detail: "Non-operational placeholders",
        tone: "warning",
      },
      {
        label: "Archived",
        value: String(countShopsByStatus("archived")),
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
    rows: mockPlatformShops.map((shop) => {
      const member = mockPlatformShopMembers.find(
        (membership) => membership.shop_id === shop.shop_id,
      );

      return {
        shop: shop.shop_name,
        code: shop.shop_code,
        owner: member
          ? getProfileName(member.profile_id)
          : "Unassigned placeholder",
        state: formatToken(shop.shop_status),
      };
    }),
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
        value: String(mockPlatformAuditLogs.length),
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
    rows: mockPlatformAuditLogs.map((log) => {
      const actorProfileId =
        "actor_profile_id" in log ? log.actor_profile_id : undefined;

      return {
        event: log.event,
        actor: getProfileName(actorProfileId),
        scope: log.scope === "shop" ? getShopName(log.shop_id) : "Global",
        result: `Synthetic ${formatToken(log.result).toLowerCase()}`,
      };
    }),
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
    rows: mockPlatformSystemStatuses.slice(0, 3).map((item) => ({
      service: formatToken(item.area),
      state: formatToken(item.status),
      source: item.area === "ui_shell" ? "TASK-002" : "TASK-004",
      note: item.message,
    })),
  },
  operations: {
    key: "operations",
    title: "Controlled Operations",
    eyebrow: "Controlled actions",
    description:
      "Audited Platform Admin controls for shop creation and lifecycle changes.",
    status: "Controlled actions",
    stats: [
      {
        label: "Available actions",
        value: "4",
        detail: "Create, suspend, reactivate, archive",
        tone: "warning",
      },
      {
        label: "Boundary",
        value: "Server",
        detail: "RPC and audit required",
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
        availability: "Server action",
        requirement: "Server-side authorization",
        task: "TASK-006",
      },
      {
        operation: "Assign owner",
        availability: "Create shop only",
        requirement: "Audit log required",
        task: "TASK-006",
      },
      {
        operation: "Suspend shop",
        availability: "State-scoped action",
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
