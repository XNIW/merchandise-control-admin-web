import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-052 Shop shell has logout, sticky desktop sidebar, and no global read-only chip", () => {
  const layout = readProjectFile("src/app/shop/layout.tsx");
  const shell = readProjectFile("src/components/shop/ShopShell.tsx");

  assert.match(layout, /principalKind=\{principal\.kind\}/);
  assert.match(shell, /principalKind: "personal_account" \| "pos_staff_manager"/);
  assert.match(shell, /principalKind === "pos_staff_manager"/);
  assert.match(shell, /"\/shop\/staff-logout"/);
  assert.match(shell, /"\/auth\/logout"/);
  assert.match(shell, /prefetch=\{false\}/);
  assert.match(shell, />\s*Logout\s*</);
  assert.match(shell, /lg:sticky/);
  assert.match(shell, /lg:top-0/);
  assert.match(shell, /lg:h-screen/);
  assert.match(shell, /lg:overflow-y-auto/);
  assert.match(shell, /lg:flex-1/);
  assert.doesNotMatch(shell, />\s*Read-only\s*</);
  assert.doesNotMatch(shell, /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role/i);
});

test("TASK-052 protected console shells disable auth-breaking prefetch", () => {
  const platformShell = readProjectFile("src/components/platform/AppShell.tsx");
  const platformNav = readProjectFile(
    "src/components/platform/PlatformSidebarNav.tsx",
  );
  const shopShell = readProjectFile("src/components/shop/ShopShell.tsx");

  assert.match(shopShell, /href=\{buildShopHref\(item\.href\)\}[\s\S]{0,120}prefetch=\{false\}/);
  assert.match(
    shopShell,
    /<form[\s\S]*principalKind === "pos_staff_manager"[\s\S]*"\/shop\/staff-logout"[\s\S]*"\/auth\/logout"[\s\S]*method="get"[\s\S]*>\s*<button[\s\S]*type="submit"[\s\S]*>\s*Logout\s*<\/button>/,
  );
  assert.match(platformShell, /<form[\s\S]*action="\/auth\/logout"[\s\S]*method="get"[\s\S]*>\s*<button[\s\S]*type="submit"[\s\S]*>\s*Logout\s*<\/button>/);
  assert.doesNotMatch(platformShell, /href="\/auth\/logout"[\s\S]{0,120}prefetch=\{false\}/);
  assert.match(platformNav, /href=\{item\.href\}[\s\S]{0,120}prefetch=\{false\}/);
});

test("TASK-052 Shop navigation keeps POS and Staff inside Admin Console", () => {
  const sections = readProjectFile("src/components/shop/shopSections.ts");

  assert.match(sections, /label: "POS \/ Staff"/);
  assert.match(sections, /key: "staff", label: "Staff", href: "\/shop\/staff"/);
  assert.match(sections, /key: "pos", label: "POS Live", href: "\/shop\/pos"/);
  assert.match(sections, /key: "devices", label: "Devices", href: "\/shop\/devices"/);
  assert.doesNotMatch(sections, /POS\/Staff console|third console|terza console/i);
  assert.doesNotMatch(sections, /rowKey:\s*["'](?:demo|mock|placeholder)/i);
});

test("TASK-052 Shop diagnostics are centralized in the sidebar instead of repeated per page", () => {
  const sectionPage = readProjectFile("src/components/shop/ShopSectionPage.tsx");
  const shell = readProjectFile("src/components/shop/ShopShell.tsx");

  assert.doesNotMatch(sectionPage, /<details/);
  assert.doesNotMatch(sectionPage, />\s*Diagnostics\s*</);
  assert.doesNotMatch(sectionPage, /GuardrailNotice/);
  assert.doesNotMatch(shell, /GuardrailNotice/);
  assert.match(shell, /sharedShopGuardrails/);
  assert.match(shell, /<details/);
  assert.match(shell, />\s*Shop safety\s*</);
  assert.doesNotMatch(sectionPage, /title="Safety rules"/);
  assert.doesNotMatch(sectionPage, /xl:grid-cols-\[minmax\(0,1fr\)_340px\]/);
});
