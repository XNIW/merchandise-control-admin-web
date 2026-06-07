import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertPathExists(relativePath) {
  assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
}

test("TASK-053 root redirects directly to Admin Console login without public selection", () => {
  const rootPage = readProjectFile("src/app/page.tsx");

  assert.match(rootPage, /redirect\("\/auth\/login\?next=\/shop&mode=admin-account"\)/);
  assert.doesNotMatch(rootPage, /Admin Console access/);
  assert.doesNotMatch(rootPage, /Use Admin account/);
  assert.doesNotMatch(rootPage, /Use Shop code/);
  assert.doesNotMatch(rootPage, /\/auth\/login\?next=\/platform/);
  assert.doesNotMatch(rootPage, /Master Console/);
});

test("TASK-053 auth login shell switches between Master and Admin tab modes", () => {
  const loginPage = readProjectFile("src/app/auth/login/page.tsx");
  const loginAction = readProjectFile("src/app/auth/login/actions.ts");
  const authForm = readProjectFile("src/components/auth/AuthForm.tsx");

  assert.match(loginPage, /type LoginPageSearchParams = Promise/);
  assert.match(loginPage, /const query = await searchParams/);
  assert.match(loginPage, /next === "\/platform"/);
  assert.match(loginPage, /mode === "shop-code"/);
  assert.match(loginPage, /Master Console sign in/);
  assert.match(loginPage, /Master Console credentials/);
  assert.match(loginPage, /Admin Console sign in/);
  assert.match(loginPage, /Admin account credentials/);
  assert.match(loginPage, /Shop code credentials/);
  assert.match(loginPage, /role="tablist"/);
  assert.match(loginPage, /role="tab"/);
  assert.match(loginPage, /aria-selected=\{activeLoginMode === "admin-account"\}/);
  assert.match(loginPage, /aria-selected=\{activeLoginMode === "shop-code"\}/);
  assert.match(loginPage, /\/auth\/login\?next=\/shop&mode=admin-account/);
  assert.match(loginPage, /\/auth\/login\?next=\/shop&mode=shop-code/);
  assert.match(loginPage, /ShopCodeLoginForm/);
  assert.doesNotMatch(loginPage, /Back to console selection/);
  assert.doesNotMatch(loginPage, /Use Shop code sign in/);
  assert.doesNotMatch(loginPage, /href="\/shop\/staff-login"/);

  assert.match(authForm, /isSafeInternalNextPath/);
  assert.match(authForm, /startsWith\("\/\/"\)/);
  assert.match(authForm, /accountSignInAction/);
  assert.match(authForm, /name="next"/);
  assert.match(loginAction, /isSafeInternalNextPath/);
  assert.match(loginAction, /startsWith\("\/\/"\)/);
  assert.match(loginAction, /redirect\(nextPath, RedirectType\.replace\)/);
});

test("TASK-053 Shop code form is shared and keeps staff login server action", () => {
  assertPathExists("src/components/auth/ShopCodeLoginForm.tsx");

  const shopCodeLoginForm = readProjectFile("src/components/auth/ShopCodeLoginForm.tsx");
  const staffLoginAction = readProjectFile(
    "src/app/(staff-auth)/shop/staff-login/actions.ts",
  );
  const staffLoginPage = readProjectFile("src/app/(staff-auth)/shop/staff-login/page.tsx");

  assert.match(shopCodeLoginForm, /staffManagerWebLoginFormAction/);
  assert.match(shopCodeLoginForm, /aria-label="Shop code sign in"/);
  assert.match(shopCodeLoginForm, /name="shopCode"/);
  assert.match(shopCodeLoginForm, /name="staffCode"/);
  assert.match(shopCodeLoginForm, /name="credential"/);
  assert.match(shopCodeLoginForm, /Shop code/);
  assert.match(shopCodeLoginForm, /Staff code/);
  assert.match(shopCodeLoginForm, /PIN \/ password/);
  assert.match(staffLoginAction, /"use server"/);
  assert.match(
    staffLoginAction,
    /\/auth\/login\?next=\/shop&mode=shop-code&result=\$\{encodeURIComponent\(result\)\}/,
  );
  assert.match(staffLoginPage, /redirect\("\/auth\/login\?next=\/shop&mode=shop-code"\)/);
  assert.doesNotMatch(
    `${shopCodeLoginForm}\n${staffLoginAction}\n${staffLoginPage}`,
    /SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash/i,
  );
});
