import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-052 root page exposes only Admin Console public access", () => {
  const rootPage = readProjectFile("src/app/page.tsx");

  assert.match(rootPage, /redirect\("\/auth\/login\?next=\/shop&mode=admin-account"\)/);
  assert.doesNotMatch(rootPage, /{access\.reason}/);
  assert.doesNotMatch(rootPage, /href="\/auth\/login\?next=\/platform"/);
  assert.doesNotMatch(rootPage, /Open Master Console/);
  assert.doesNotMatch(rootPage, /Platform owner/);
  assert.doesNotMatch(rootPage, /Master Console is for platform owner accounts/);
  assert.doesNotMatch(rootPage, /Admin Console access/);
  assert.doesNotMatch(rootPage, /href="\/shop\/staff-login"/);
});

test("TASK-052 login page labels Master only for exact platform next path", () => {
  const loginPage = readProjectFile("src/app/auth/login/page.tsx");
  const loginAction = readProjectFile("src/app/auth/login/actions.ts");
  const authForm = readProjectFile("src/components/auth/AuthForm.tsx");
  const oauthRedirect = readProjectFile("src/lib/auth/oauth-redirect.ts");
  const dictionary = readProjectFile("src/i18n/dictionaries.ts");
  const loginI18nSource = `${loginPage}\n${dictionary}`;

  assert.match(loginPage, /type LoginPageSearchParams = Promise/);
  assert.match(loginPage, /searchParams: LoginPageSearchParams/);
  assert.match(loginPage, /const query = await searchParams/);
  assert.match(loginPage, /next === "\/platform"/);
  assert.match(loginPage, /mode === "shop-code"/);
  assert.match(loginI18nSource, /Master Console sign in/);
  assert.match(loginI18nSource, /Master Console credentials/);
  assert.match(loginI18nSource, /Admin Console sign in/);
  assert.match(loginI18nSource, /Admin account credentials/);
  assert.match(loginI18nSource, /Shop code credentials/);
  assert.match(loginPage, /aria-label=\{dictionary\.authLogin\.tabAriaLabel\}/);
  assert.doesNotMatch(loginPage, /role="tablist"/);
  assert.doesNotMatch(loginPage, /role="tab"/);
  assert.doesNotMatch(loginPage, /aria-selected=/);
  assert.match(loginPage, /aria-current=\{/);
  assert.doesNotMatch(loginPage, /Back to console selection/);
  assert.doesNotMatch(loginPage, /Use Shop code sign in/);
  assert.match(authForm, /isSafeInternalNextPath/);
  assert.match(authForm, /startsWith\("\/\/"\)/);
  assert.match(authForm, /accountSignInAction/);
  assert.match(authForm, /name="next"/);
  assert.match(loginAction, /safeInternalNextPath/);
  assert.match(oauthRedirect, /isSafeInternalNextPath/);
  assert.match(oauthRedirect, /startsWith\("\/\/"\)/);
  assert.match(loginAction, /redirect\(nextPath, RedirectType\.replace\)/);
});
