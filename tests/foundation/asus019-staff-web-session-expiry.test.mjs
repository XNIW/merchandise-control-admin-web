import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const now = Date.parse("2026-11-11T19:00:00.000Z");
class FixedDate extends Date { static now() { return now; } }
const shopId = "10000000-0000-4000-8000-000000003019";
const staffId = "30000000-0000-4000-8000-000000003019";
const sessionId = "40000000-0000-4000-8000-000000003019";
const credential = "synthetic-expiry-regression-only";

// Execute the production login, credential verifier, principal and runtime
// boundary. Only Next request I/O, the RPC transport and unused shop access
// are ports; this unit test does not claim an authenticated database/E2E run.
function fixture(credentialExpiresAt) {
  const cache = new Map(), writes = [], commits = [];
  const shop = { shop_id: shopId, shop_code: "SYNTHETIC019", shop_name: "Synthetic", shop_status: "active", company_rut: null };
  const staff = { staff_id: staffId, shop_id: shopId, staff_code: "S019", display_name: "Synthetic", role_key: "pos_admin", status: "active", credential_status: "active", credential_version: 7, must_change_credential: false, credential_expires_at: credentialExpiresAt, credential_hash: null, failed_attempts: 0, locked_until: null, session_invalidated_at: null, web_access_revoked_at: null };
  const permissions = ["shop_admin.full_access", "payment_history.read"];
  const admin = { async rpc(name, input) {
    let data;
    if (name === "staff_web_login_lookup_v1") data = { status: "ok", shop, staff, permissions, attempt: null };
    else if (name === "staff_web_login_failure_v1") data = { ok: true };
    else if (name === "staff_web_login_commit_v1") {
      commits.push(input);
      data = { ok: true, code: "success", staffWebSessionId: sessionId, expiresAt: input.p_expires_at, attemptKeyHash: input.p_attempt_key_hash, shopId, staffId, credentialVersion: 7 };
    } else if (name === "staff_web_session_resolve_v1") {
      const committed = commits.at(-1);
      data = { status: "ok", shop, staff, permissions, session: { staff_web_session_id: sessionId, shop_id: shopId, staff_id: staffId, staff_credential_version: 7, session_token_hash: input.p_session_token_hash, status: "active", issued_at: new Date(now - 1000).toISOString(), expires_at: committed.p_expires_at } };
    } else throw new Error("Unexpected RPC: " + name);
    return { data, error: null };
  } };
  function load(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file);
    const loaded = { exports: {} }; cache.set(file, loaded.exports);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(code, { module: loaded, exports: loaded.exports, Date: FixedDate, Buffer, require(name) {
      if (name === "server-only") return {};
      if (name === "next/headers") return { cookies: async () => ({ set: (...args) => writes.push(args) }), headers: async () => ({ get: () => null }) };
      if (name === "@/lib/supabase/admin") return { resolveSupabaseAdminConfig: () => ({ status: "configured" }), createSupabaseAdminClient: () => admin };
      if (name === "./shop-access") return { resolveCurrentShopAdminShellAccess() { throw new Error("Unused shop access port"); } };
      if (name.startsWith(".")) return load(resolve(dirname(file), name + ".ts"));
      if (name.startsWith("@/")) return load(resolve("src", name.slice(2) + ".ts"));
      if (name.startsWith("node:")) return require(name);
      throw new Error("Unexpected module: " + name);
    } }, { filename: file });
    return loaded.exports;
  }
  const auth = load("src/server/shop-admin/staff-web-auth.ts");
  const boundary = load("src/server/shop-admin/staff-web-runtime-boundary.ts");
  const credentials = load("src/server/shop-admin/staff-credentials.ts");
  return { admin, auth, boundary, commits, credentials, staff, writes };
}

for (const [label, expiry, expected] of [
  ["credential expiring in one hour", "2026-11-11T20:00:00.000Z", "2026-11-11T20:00:00.000Z"],
  ["database fractional timestamp and offset", "2026-11-11T17:00:00.123456-03:00", "2026-11-11T20:00:00.123Z"],
  ["credential beyond the twelve hour session ceiling", "2026-11-12T19:00:00.000Z", "2026-11-12T07:00:00.000Z"],
  ["credential without an expiry", null, "2026-11-12T07:00:00.000Z"],
]) test("issued session resolves without self-revocation: " + label, async () => {
  const f = fixture(expiry);
  f.staff.credential_hash = await f.credentials.hashStaffCredential(credential);
  const login = await f.auth.authenticateStaffManagerWebLogin({ shopCode: "SYNTHETIC019", staffCode: "S019", credential }, { host: "localhost:3019" });
  assert.equal(login.code, "success");
  assert.equal(f.commits.length, 1);
  assert.equal(f.commits[0].p_expires_at, expected);
  assert.equal(f.writes.length, 1);
  const [name, token, options] = f.writes[0];
  assert.equal(name, f.auth.STAFF_WEB_SESSION_COOKIE);
  assert.equal(options.expires.toISOString(), expected);
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, "/");
  const runtime = await f.boundary.resolveStaffWebRuntimeSession(f.admin, f.auth.hashStaffWebSecret(token));
  assert.equal(runtime.kind, "ok");
});

test("expired credential never creates a session or cookie", async () => {
  const f = fixture(new Date(now).toISOString());
  f.staff.credential_hash = await f.credentials.hashStaffCredential(credential);
  const login = await f.auth.authenticateStaffManagerWebLogin({ shopCode: "SYNTHETIC019", staffCode: "S019", credential });
  assert.equal(login.code, "staff_inactive");
  assert.equal(f.commits.length, 0);
  assert.equal(f.writes.length, 0);
});

test("runtime still denies a session extending beyond the credential", async () => {
  const f = fixture("2026-11-11T20:00:00.000Z");
  f.commits.push({ p_expires_at: "2026-11-12T07:00:00.000Z" });
  const result = await f.boundary.resolveStaffWebRuntimeSession(f.admin, "synthetic-token-hash");
  assert.equal(result.kind, "denied");
});
