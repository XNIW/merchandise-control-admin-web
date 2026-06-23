import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const shopRoutes = [
  { key: "overview", path: "src/app/shop/overview/page.tsx" },
  { key: "products", path: "src/app/shop/products/page.tsx" },
  { key: "categories", path: "src/app/shop/categories/page.tsx" },
  { key: "suppliers", path: "src/app/shop/suppliers/page.tsx" },
  { key: "importExport", path: "src/app/shop/import-export/page.tsx" },
  { key: "members", path: "src/app/shop/members/page.tsx" },
  { key: "roles", path: "src/app/shop/roles/page.tsx" },
  { key: "staff", path: "src/app/shop/staff/page.tsx" },
  { key: "pos", path: "src/app/shop/pos/page.tsx" },
  { key: "devices", path: "src/app/shop/devices/page.tsx" },
  { key: "settings", path: "src/app/shop/settings/page.tsx" },
  { key: "history", path: "src/app/shop/history/page.tsx" },
  { key: "audit", path: "src/app/shop/audit/page.tsx" },
];

test("TASK-008 Shop Admin shell artifacts exist and stay boundary-safe", () => {
  for (const relativePath of [
    "src/app/shop/layout.tsx",
    "src/components/shop/ShopShell.tsx",
    "src/components/shop/ShopSectionPage.tsx",
    "src/components/shop/shopSections.ts",
  ]) {
    assert.equal(
      existsSync(join(root, relativePath)),
      true,
      `${relativePath} is missing`,
    );
  }

  const layout = readProjectFile("src/app/shop/layout.tsx");
  const shell = readProjectFile("src/components/shop/ShopShell.tsx");
  const dictionary = readProjectFile("src/i18n/dictionaries.ts");

  assert.match(layout, /resolveShopAdminDataAccess/);
  assert.match(layout, /access\.status !== "ready"/);
  assert.match(layout, /principal\.kind/);
  assert.match(layout, /<ShopShell/);
  assert.match(layout, /export const dynamic = ["']force-dynamic["']/);

  assert.match(shell, /^"use client";/);
  assert.match(shell, /usePathname/);
  assert.match(shell, /useState/);
  assert.match(shell, /aria-label=\{labels\.navigationAria\}/);
  assert.match(shell, /\{labels\.skipLink\}/);
  assert.match(dictionary, /navigationAria: "Shop sections"/);
  assert.match(dictionary, /skipLink: "Skip to shop content"/);
  assert.doesNotMatch(shell, /@\/server|src\/server|@supabase\//);
});

test("TASK-008 route placeholders cover the Shop Admin sections", () => {
  const rootPage = readProjectFile("src/app/shop/page.tsx");
  const sections = readProjectFile("src/components/shop/shopSections.ts");
  const sectionPage = readProjectFile(
    "src/components/shop/ShopSectionPage.tsx",
  );

  assert.match(rootPage, /getShopSectionForRequest\(\s*"overview"/);
  assert.match(rootPage, /ShopSectionPage/);
  assert.match(sectionPage, /Planned state/);
  assert.match(
    sectionPage,
    /No live shop rows are available in this section yet/,
  );
  assert.doesNotMatch(sectionPage, /TASK-008|TASK-010/);

  for (const { key, path } of shopRoutes) {
    assert.equal(existsSync(join(root, path)), true, `${path} is missing`);

    const page = readProjectFile(path);

    assert.match(page, /export const dynamic = ["']force-dynamic["']/);
    if (key === "history") {
      assert.match(page, /getShopHistoryListReadModel/);
      assert.match(page, /buildHistorySection/);
    } else if (key === "devices") {
      assert.match(page, /getShopDeviceReadModel/);
      assert.match(page, /DeviceRegistryView/);
    } else if (key === "products") {
      assert.match(page, /getShopInventoryProductsPage/);
      assert.match(page, /getShopCatalogOptionsReadModel/);
      assert.match(page, /buildProductsPageSection/);
    } else if (key === "staff") {
      assert.match(page, /resolveStaffPageBundle/);
      assert.match(page, /buildStaffSection/);
    } else if (key === "categories") {
      assert.match(page, /getShopCategoriesPageReadModel/);
      assert.match(page, /getShopSectionForRequest\(\s*"categories"/);
    } else if (key === "suppliers") {
      assert.match(page, /getShopSuppliersPageReadModel/);
      assert.match(page, /getShopSectionForRequest\(\s*"suppliers"/);
    } else if (key === "importExport") {
      assert.match(page, /Moved to Products/);
      assert.match(page, /Open Products/);
      assert.doesNotMatch(page, /getShopSectionForRequest/);
      assert.doesNotMatch(page, /ShopSectionPage/);
    } else if (key === "pos") {
      assert.match(page, /getShopPosRevenueReadModel/);
      assert.match(page, /PosRevenueDashboard/);
    } else {
      assert.match(page, new RegExp(`getShopSectionForRequest\\(\\s*"${key}"`));
    }
    assert.match(sections, new RegExp(`key: "${key}"`));
  }

  for (const href of [
    "/shop/overview",
    "/shop/products",
    "/shop/categories",
    "/shop/suppliers",
    "/shop/import-export",
    "/shop/members",
    "/shop/roles",
    "/shop/staff",
    "/shop/pos",
    "/shop/devices",
    "/shop/settings",
    "/shop/history",
    "/shop/audit",
  ]) {
    assert.match(sections, new RegExp(`href: "${href}"`));
  }
});

test("Shop shell cleanup keeps catalog navigation contextual", () => {
  const sections = readProjectFile("src/components/shop/shopSections.ts");
  const shell = readProjectFile("src/components/shop/ShopShell.tsx");
  const layout = readProjectFile("src/app/shop/layout.tsx");
  const importExportPage = readProjectFile("src/app/shop/import-export/page.tsx");
  const navigationSections = sections.slice(
    sections.indexOf("export const shopNavigationSections"),
    sections.indexOf("export const shopNavigationItems"),
  );

  assert.match(
    navigationSections,
    /key: "catalog"[\s\S]*key: "suppliers"[\s\S]*key: "history"[\s\S]*key: "importExport"[\s\S]*hiddenFromPrimaryNav: true/,
  );
  assert.match(
    navigationSections,
    /key: "data_diagnostics"[\s\S]*key: "sync"[\s\S]*key: "audit"/,
  );
  assert.doesNotMatch(
    navigationSections,
    /key: "data_diagnostics"[\s\S]*key: "history"/,
  );
  assert.match(shell, /filter\(\(item\) => !item\.hiddenFromPrimaryNav\)/);
  assert.match(shell, /id="shop-shell-page-title"/);
  assert.match(shell, /sectionDescriptions/);
  assert.match(shell, /sectionEyebrows/);
  assert.match(shell, /currentPageDescription/);
  assert.match(shell, /currentPageEyebrow/);
  assert.match(shell, /title=\{currentPageDescription \?\? undefined\}/);
  assert.doesNotMatch(
    shell,
    /currentPageDescription \? \([\s\S]*<p className="[^"]*line-clamp-2/,
  );
  assert.doesNotMatch(shell, /labels\.shopCodePrefix/);
  assert.doesNotMatch(shell, /MerchandiseControl/);
  assert.match(layout, /sectionDescriptions=\{sectionDescriptions\}/);
  assert.match(layout, /sectionEyebrows=\{sectionEyebrows\}/);
  assert.match(sections, /Manage products, prices, stock and mapped mobile catalog\./);
  assert.match(sections, /Mobile history sessions and sync-related catalog activity\./);
  assert.match(sections, /Registered Android, iOS, POS and web clients for this shop\./);
  assert.match(importExportPage, /Moved to Products/);
  assert.match(importExportPage, /Open Products/);
  assert.doesNotMatch(importExportPage, /ImportExportActionPanel/);
});

test("TASK-008 security scan locks Shop Admin shell artifacts", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /function checkTask008ShopShellArtifacts/);
  assert.match(securityChecks, /checkTask008ShopShellArtifacts\(\)/);
  assert.match(securityChecks, /listFiles\("src\/components\/shop"\)/);
  assert.match(securityChecks, /src\/app\/shop\/overview\/page\.tsx/);
});
