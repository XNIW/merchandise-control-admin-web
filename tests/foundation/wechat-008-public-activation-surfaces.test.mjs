import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("WECHAT-008 publishes factual privacy and assisted deletion pages", () => {
  const privacy = source("src/app/privacy/page.tsx");
  const deletion = source("src/app/account-deletion/page.tsx");
  const shared = source("src/app/_components/PublicPolicyPage.tsx");

  assert.match(shared, /subject to owner and legal review/i);
  assert.match(privacy, /Personal accounts and POS staff are separate/);
  assert.match(privacy, /camera or photo-library access/i);
  assert.match(privacy, /memory-only/);
  assert.match(privacy, /No client contains a Supabase service-role key/);
  assert.match(deletion, /There is no self-service deletion endpoint/);
  assert.match(deletion, /established support channel/);
  assert.match(deletion, /does not submit or delete an account/);
  assert.doesNotMatch(
    `${privacy}\n${deletion}`,
    /guarantee|legally required within|all data will be deleted/i,
  );
});

test("WECHAT-008 AASA binds only the verified iOS bundle and staging path", () => {
  const route = source("src/app/.well-known/apple-app-site-association/route.ts");
  const fallback = source("src/app/wechat/ios/page.tsx");
  const nextConfig = source("next.config.ts");

  assert.match(route, /45PJ364B5B\.com\.niwcyber\.iOSMerchandiseControl/);
  assert.match(route, /"\/": "\/wechat\/ios\/"/);
  assert.match(route, /"\/": "\/wechat\/ios\/\*"/);
  assert.doesNotMatch(route, /"\/": "\/\*"/);
  assert.match(route, /application\/json; charset=utf-8/);
  assert.match(fallback, /associated-domain\s+verification/);
  assert.match(nextConfig, /skipTrailingSlashRedirect: true/);
});
