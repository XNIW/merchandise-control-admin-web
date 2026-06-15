#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const inputIndex = process.argv.indexOf("--input");
const inputPath =
  inputIndex >= 0 && process.argv[inputIndex + 1]
    ? process.argv[inputIndex + 1]
    : process.env.I18N_RENDERED_SCAN_INPUT;

if (!inputPath) {
  throw new Error(
    "Rendered i18n scan requires --input <snapshot.json> or I18N_RENDERED_SCAN_INPUT.",
  );
}

const requiredRoutes = [
  "/shop",
  "/shop/products",
  "/shop/categories",
  "/shop/suppliers",
  "/shop/members",
  "/shop/roles",
  "/shop/staff",
  "/shop/pos",
  "/shop/devices",
  "/shop/sync",
  "/shop/history",
  "/shop/audit",
  "/shop/settings",
  "/shop/import-export",
  "/platform",
  "/platform/users",
  "/platform/shops",
  "/platform/shops/new",
  "/platform/admins",
  "/platform/audit",
  "/platform/system",
  "/platform/data",
  "/platform/devices",
  "/platform/sync",
  "/platform/history",
  "/platform/operations",
  "/platform/support",
  "/platform/provisioning",
];

const criticalRenderedUiPhrases = [
  "Overview shop",
  "Overview shop, Data status, Latest events and Latest shop audit are shown together for repeated operations.",
  "Active",
  "Active grants",
  "Active owner memberships",
  "Active shops",
  "Company RUT",
  "Global Platform Admin overview loaded server-side through Supabase RLS.",
  "Provision Shop",
  "Shop onboarding",
  "Create shop with existing owner",
  "Create pending owner invite",
  "Owner email",
  "Data status",
  "Device signals",
  "Device signals appear after POS or mobile registration.",
  "Device signals appear after POS or mobile registration. Sync source ids alone do not authorize a device.",
  "Device signals are aggregated for support.",
  "Device warnings",
  "Device/sync data health",
  "Global registry",
  "Historical shops",
  "Needs provisioning review",
  "Operational shops",
  "Profiles",
  "Profiles checked",
  "Profiles, shops, audit, devices, sync",
  "Read-only diagnostics",
  "Recent sync on suspended shop",
  "Requires review",
  "Membership, owner, or read warnings",
  "RLS/grants summary",
  "Selects pass through authenticated RLS only",
  "Server-side directory",
  "Shop owners",
  "Shops without owner",
  "Sync signals",
  "Sync signals are diagnostic; live Win7POS Sales Sync remains separately verified.",
  "Total shops",
  "Use it when checking device authorization, revoked devices, or suspicious device state for support triage.",
  "Visible through Platform Admin",
  "Visible through RLS",
  "Inventory",
  "Ready",
  "Verified by active membership",
  "Shop-scoped catalog rows loaded server-side for the verified selected shop.",
  "Shop Staff read model loaded server-side through the credential-safe view.",
  "Server registry devices loaded for the verified selected shop, with read-only links to sync activity when available.",
  "No sync event",
  "Shop Staff",
  "Shop-scoped mobile history entries loaded with legacy owner fallback.",
  "legacy owner fallback",
  "Shop catalog products for the verified selected shop. Create, update, archive and restore use audited catalog RPCs.",
  "restore requires confirmation",
  "Read-only member list for the verified selected shop. Profile identifiers are shortened in the UI.",
  "Rows scoped by shop_id",
  "revoked",
  "revoked or suspicious",
  "visible devices",
  "latest events",
  "latest sync/history events",
  "platform admins",
  "orphaned memberships",
  "profiles without membership",
  "shops without owner",
  "suspended shops with recent activity",
  "active",
  "archived",
  "good",
  "muted",
  "neutral",
  "suspended",
  "total",
  "warning",
  "Baseline matrix",
  "Granular editing",
  "Not available yet",
  "Permissions matrix",
  "Staff credential-safe read model",
  "Trusted POS devices, sessions and staff links for the verified selected shop. This view is read-only and does not include sales synchronization.",
  "Device registry",
  "Sync events",
  "History entries are loaded from shared_sheet_sessions. Sync events are technical synchronization logs linked to those entries. Admin audit events are shown separately in Audit.",
  "Shop audit log",
  "Shop profile and fiscal identity",
  "Drop a catalog database .xlsx or .xls workbook here or choose a file.",
];

function readJson(path) {
  const absolutePath = resolve(path);

  if (!existsSync(absolutePath)) {
    throw new Error(
      `Rendered i18n snapshot not found: ${absolutePath}. Capture browser text first or pass --input.`,
    );
  }

  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function collectRecords(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRecords(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if ("locale" in value || "lang" in value || "route" in value || "url" in value) {
    return [value];
  }

  return Object.values(value).flatMap((item) => collectRecords(item));
}

function collectText(value, key = "") {
  if (typeof value === "string") {
    return ["locale", "lang", "route", "title", "url", "pathname", "value"].includes(key)
      ? []
      : [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item, key));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([entryKey, entryValue]) =>
    collectText(entryValue, entryKey),
  );
}

const payload = readJson(inputPath);
const records = collectRecords(payload);
const nonEnglishRecords = records.filter((record) => {
  const locale = String(record.locale ?? record.lang ?? "");

  return locale !== "" && locale !== "en";
});

if (records.length === 0) {
  throw new Error("Rendered i18n snapshot did not contain route records.");
}

if (nonEnglishRecords.length === 0) {
  throw new Error("Rendered i18n snapshot did not contain non-English locale records.");
}

const failures = [];
const locales = [...new Set(nonEnglishRecords.map((record) => String(record.locale ?? record.lang)))];

for (const locale of locales) {
  const localeRoutes = new Set(
    nonEnglishRecords
      .filter((record) => String(record.locale ?? record.lang) === locale)
      .map((record) => {
        if (record.route) {
          return String(record.route);
        }

        if (record.url) {
          return new URL(String(record.url)).pathname;
        }

        return "";
      }),
  );
  const missingRoutes = requiredRoutes.filter((route) => !localeRoutes.has(route));

  if (missingRoutes.length > 0) {
    failures.push(`${locale}: missing required routes ${missingRoutes.join(", ")}`);
  }
}

for (const record of nonEnglishRecords) {
  const locale = String(record.locale ?? record.lang);
  const route = String(record.route ?? record.url ?? "unknown-route");
  const text = collectText(record).join("\n");

  for (const phrase of criticalRenderedUiPhrases) {
    if (text.includes(phrase)) {
      failures.push(`${locale} ${route}: "${phrase}"`);
    }
  }
}

if (failures.length > 0) {
  console.error("Rendered i18n scan failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      inputPath: resolve(inputPath),
      checkedPhrases: criticalRenderedUiPhrases.length,
      checkedRoutes: requiredRoutes.length,
      nonEnglishRecords: nonEnglishRecords.length,
      status: "pass",
    },
    null,
    2,
  ),
);
