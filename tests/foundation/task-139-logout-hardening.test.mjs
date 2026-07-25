import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function collectE2eSpecs(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return collectE2eSpecs(path);
    return entry.isFile() && entry.name.endsWith(".spec.ts") ? [path] : [];
  });
}

test("TASK-139 logout is POST-only, same-origin and fail-closed", () => {
  const accountRoute = readProjectFile("src/app/auth/logout/route.ts");
  const staffRoute = readProjectFile("src/app/shop/staff-logout/route.ts");
  const oauthRedirect = readProjectFile("src/lib/auth/oauth-redirect.ts");
  const staffAuth = readProjectFile("src/server/shop-admin/staff-web-auth.ts");
  const runtimeBoundary = readProjectFile(
    "src/server/shop-admin/staff-web-runtime-boundary.ts",
  );

  assert.match(oauthRedirect, /export function isSameOriginPostRequest/);
  assert.match(oauthRedirect, /request\.method\.toUpperCase\(\) !== "POST"/);
  assert.match(oauthRedirect, /fetchSite !== "same-origin"/);
  assert.match(oauthRedirect, /parsedOrigin\.origin === requestOrigin/);

  for (const route of [accountRoute, staffRoute]) {
    assert.match(route, /export async function POST/);
    assert.doesNotMatch(route, /export async function GET/);
    assert.match(route, /isSameOriginPostRequest/);
    assert.match(route, /same_origin_required/);
    assert.match(route, /logout_failed/);
    assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
    assert.match(route, /'"cache", "storage"'/);
  }

  assert.match(accountRoute, /supabase\.auth\.signOut\(\)/);
  assert.match(accountRoute, /NextResponse\.redirect\(loginUrl, 303\)/);
  assert.match(
    staffRoute,
    /if \(!logout\.ok\)\s*\{\s*return noStoreFailure\("logout_failed", 503\);/,
  );
  assert.match(staffRoute, /response\.cookies\.set\(STAFF_WEB_SESSION_COOKIE/);
  assert.match(runtimeBoundary, /\| "failed"/);
  assert.match(runtimeBoundary, /\| "not_found"/);
  assert.match(runtimeBoundary, /\| "revoked"/);
  assert.match(staffAuth, /if \(result === "failed"\)/);
  assert.doesNotMatch(
    staffAuth.slice(staffAuth.indexOf("export async function logoutStaffWebSession")),
    /clearStaffWebCookie/,
  );
});

test("TASK-139 logout controls and E2E consumers use native POST forms", () => {
  const appShell = readProjectFile("src/components/platform/AppShell.tsx");
  const shopShell = readProjectFile("src/components/shop/ShopShell.tsx");
  const profile = readProjectFile("src/app/account/profile/page.tsx");
  const helper = readProjectFile("tests/e2e/logout-helper.ts");
  const specs = collectE2eSpecs(join(root, "tests", "e2e"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  assert.match(appShell, /action="\/auth\/logout\?next=\/platform"[\s\S]*method="post"/);
  assert.match(shopShell, /"\/shop\/staff-logout"[\s\S]*method="post"/);
  assert.match(profile, /<form action="\/auth\/logout" method="post">/);
  assert.match(helper, /form\[action="\$\{action\}"\]\[method="post"\]/);
  assert.match(helper, /button\[type="submit"\]/);
  assert.doesNotMatch(specs, /\.goto\(\s*["']\/(?:auth\/logout|shop\/staff-logout)/);
});
