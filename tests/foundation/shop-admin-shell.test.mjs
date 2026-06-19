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
      assert.match(page, /getShopHistoryReadModel/);
      assert.match(page, /buildHistorySection/);
    } else if (key === "devices") {
      assert.match(page, /getShopDeviceReadModel/);
      assert.match(page, /DeviceRegistryView/);
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

test("TASK-008 security scan locks Shop Admin shell artifacts", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /function checkTask008ShopShellArtifacts/);
  assert.match(securityChecks, /checkTask008ShopShellArtifacts\(\)/);
  assert.match(securityChecks, /listFiles\("src\/components\/shop"\)/);
  assert.match(securityChecks, /src\/app\/shop\/overview\/page\.tsx/);
});
