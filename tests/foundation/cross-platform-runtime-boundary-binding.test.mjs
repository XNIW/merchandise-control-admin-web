import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const SHOP = "10000000-0000-4000-8000-000000000001";
const OTHER_SHOP = "10000000-0000-4000-8000-000000000002";
const STAFF = "20000000-0000-4000-8000-000000000001";
const DEVICE = "30000000-0000-4000-8000-000000000001";
const CREDENTIAL = "40000000-0000-4000-8000-000000000001";
const SESSION = "50000000-0000-4000-8000-000000000001";
const WEB_SESSION = "60000000-0000-4000-8000-000000000001";
const TOKEN_HASH = `sha256:${"a".repeat(64)}`;

function iso(offsetMilliseconds) {
  return new Date(Date.now() + offsetMilliseconds).toISOString();
}

async function loadModule(relativePath) {
  const source = readFileSync(join(root, relativePath), "utf8").replace(
    /^import "server-only";\r?\n\r?\n/,
    "",
  );
  const tempDir = await mkdtemp(join(tmpdir(), "runtime-boundary-"));
  const modulePath = join(tempDir, "boundary.mjs");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  await writeFile(modulePath, outputText, "utf8");
  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    module: await import(pathToFileURL(modulePath).href),
  };
}

function adminReturning(data, error = null) {
  return {
    async rpc() {
      return { data, error };
    },
  };
}

function posLease(overrides = {}) {
  const issuedAt = iso(-60_000);
  const sessionExpiresAt = iso(30 * 60_000);
  const credentialExpiresAt = iso(60 * 60_000);
  return {
    status: "ok",
    session: {
      expires_at: sessionExpiresAt,
      heartbeat_count: 1,
      issued_at: issuedAt,
      pos_device_credential_id: CREDENTIAL,
      pos_session_id: SESSION,
      revoked_at: null,
      session_token_hash: TOKEN_HASH,
      shop_device_id: DEVICE,
      shop_id: SHOP,
      staff_credential_version: 3,
      staff_id: STAFF,
      status: "active",
    },
    credential: {
      expires_at: credentialExpiresAt,
      pos_device_credential_id: CREDENTIAL,
      revoked_at: null,
      shop_device_id: DEVICE,
      shop_id: SHOP,
      staff_credential_version: 3,
      staff_id: STAFF,
      status: "active",
      token_hash: TOKEN_HASH,
    },
    staff: {
      credential_expires_at: credentialExpiresAt,
      credential_status: "active",
      credential_version: 3,
      display_name: "Manager",
      locked_until: null,
      must_change_credential: false,
      role_key: "manager",
      session_invalidated_at: null,
      shop_id: SHOP,
      staff_code: "STAFF1",
      staff_id: STAFF,
      status: "active",
    },
    device: {
      device_identifier: "device-a",
      shop_device_id: DEVICE,
      shop_id: SHOP,
      status: "active",
      revoked_at: null,
    },
    shop: {
      business_address: null,
      business_city: null,
      business_giro: null,
      company_rut: null,
      fiscal_identity_locked_by_platform: false,
      legal_representative_rut: null,
      shop_code: "SHOP1",
      shop_id: SHOP,
      shop_name: "Shop One",
      shop_status: "active",
      updated_at: issuedAt,
    },
    ...overrides,
  };
}

test("POS runtime boundary binds the complete lease graph and expiry", async () => {
  const { cleanup, module } = await loadModule(
    "src/server/pos-auth/runtime-boundary.ts",
  );
  try {
    const valid = await module.loadPosRuntimeLease(adminReturning(posLease()), {
      posSessionId: SESSION,
      shopDeviceId: DEVICE,
    });
    assert.equal(valid.status, "ok");

    for (const invalid of [
      posLease({ session: { ...posLease().session, pos_session_id: WEB_SESSION } }),
      posLease({ credential: { ...posLease().credential, shop_id: OTHER_SHOP } }),
      posLease({ staff: { ...posLease().staff, credential_version: 4 } }),
    ]) {
      const result = await module.loadPosRuntimeLease(adminReturning(invalid), {
        posSessionId: SESSION,
        shopDeviceId: DEVICE,
      });
      assert.equal(result.status, "db_failure");
    }
    const expired = await module.loadPosRuntimeLease(
      adminReturning(
        posLease({
          session: { ...posLease().session, expires_at: iso(-1_000) },
        }),
      ),
      { posSessionId: SESSION, shopDeviceId: DEVICE },
    );
    assert.equal(expired.status, "denied");

    for (const revoked of [
      posLease({ session: { ...posLease().session, revoked_at: iso(-1_000) } }),
      posLease({ credential: { ...posLease().credential, revoked_at: iso(-1_000) } }),
      posLease({ device: { ...posLease().device, revoked_at: iso(-1_000) } }),
    ]) {
      const result = await module.loadPosRuntimeLease(adminReturning(revoked), {
        posSessionId: SESSION,
        shopDeviceId: DEVICE,
      });
      assert.equal(result.status, "denied");
    }
  } finally {
    await cleanup();
  }
});

test("POS success publication is an explicit final lease boundary", async () => {
  const { cleanup, module } = await loadModule(
    "src/server/pos-auth/runtime-boundary.ts",
  );
  try {
    const calls = [];
    const admin = {
      async rpc(name, args) {
        calls.push({ args, name });
        return { data: { status: "ok" }, error: null };
      },
    };
    const input = {
      catalogPublication: {
        expectedRevision: "42",
        expectedScopeKey: "a".repeat(32),
      },
      posSessionId: SESSION,
      publicationKind: "catalog_pull",
      shopDeviceId: DEVICE,
      shopId: SHOP,
      staffId: STAFF,
    };
    const published = await module.publishPosRuntimeLeaseSuccess(admin, input);
    assert.equal(published.status, "ok");
    assert.deepEqual(calls, [
      {
        args: {
          p_expected_catalog_revision: "42",
          p_expected_catalog_scope_key: "a".repeat(32),
          p_pos_session_id: SESSION,
          p_publication_kind: "catalog_pull",
          p_shop_device_id: DEVICE,
          p_shop_id: SHOP,
          p_staff_id: STAFF,
        },
        name: "pos_runtime_lease_publish_success_v2",
      },
    ]);
    assert.equal(
      (
        await module.publishPosRuntimeLeaseSuccess(
          adminReturning({ status: "denied" }),
          {
            ...input,
            catalogPublication: undefined,
            publicationKind: "heartbeat",
          },
        )
      ).status,
      "denied",
    );
    assert.equal(
      (
        await module.publishPosRuntimeLeaseSuccess(
          adminReturning({ status: "stale_catalog" }),
          input,
        )
      ).status,
      "stale_catalog",
    );
    assert.equal(
      (
        await module.publishPosRuntimeLeaseSuccess(
          adminReturning({ status: "invalid" }),
          input,
        )
      ).status,
      "db_failure",
    );
  } finally {
    await cleanup();
  }
});

test("POS first-login response is fenced by the atomic lease publication RPC", async () => {
  const { cleanup, module } = await loadModule(
    "src/server/pos-auth/runtime-boundary.ts",
  );
  try {
    const calls = [];
    const published = await module.publishPosRuntimeLeaseSuccess(
      {
        async rpc(name, args) {
          calls.push({ args, name });
          return { data: { status: "ok" }, error: null };
        },
      },
      {
        posSessionId: SESSION,
        publicationKind: "first_login",
        shopDeviceId: DEVICE,
        shopId: SHOP,
        staffId: STAFF,
      },
    );
    assert.equal(published.status, "ok");
    assert.equal(calls[0].args.p_publication_kind, "first_login");

    const migration = readFileSync(
      join(
        root,
        "supabase/migrations/20260722022500_task_139_pos_catalog_scope_lease.sql",
      ),
      "utf8",
    );
    assert.match(
      migration,
      /p_publication_kind not in \(\s*'catalog_pull', 'first_login', 'heartbeat'\s*\)/,
    );
    assert.match(migration, /'pos\.auth\.first_login\.success'/);
    assert.match(migration, /'pos\.device\.trusted'/);
  } finally {
    await cleanup();
  }
});

test("POS first-login lookup and commit reject stale response identities", async () => {
  const { cleanup, module } = await loadModule(
    "src/server/pos-auth/runtime-boundary.ts",
  );
  try {
    const base = posLease();
    const lookup = {
      status: "ok",
      device: base.device,
      shop: base.shop,
      staff: {
        ...base.staff,
        credential_hash: "hash",
        failed_attempts: 0,
      },
    };
    assert.equal(
      (
        await module.loadPosFirstLoginIdentity(adminReturning(lookup), {
          deviceIdentifier: "device-a",
          shopCode: "shop1",
          staffCode: "staff1",
        })
      ).status,
      "ok",
    );
    assert.equal(
      (
        await module.loadPosFirstLoginIdentity(
          adminReturning({
            ...lookup,
            staff: { ...lookup.staff, shop_id: OTHER_SHOP },
          }),
          {
            deviceIdentifier: "device-a",
            shopCode: "SHOP1",
            staffCode: "STAFF1",
          },
        )
      ).status,
      "db_failure",
    );

    const expiresAt = iso(30 * 60_000);
    const commitInput = {
      credentialVersion: 3,
      deviceDisplayName: "POS",
      deviceIdentifier: "device-a",
      deviceTokenHash: TOKEN_HASH,
      deviceTtlSeconds: 180 * 24 * 60 * 60,
      metadata: {},
      offlineAuthorizationMaxAgeSeconds: 12 * 60 * 60,
      offlineAuthorizationPolicyVersion: "pos-policy-v1",
      sessionTokenHash: TOKEN_HASH,
      sessionTtlSeconds: 12 * 60 * 60,
      shopId: SHOP,
      staffId: STAFF,
    };
    const commit = {
      code: "success",
      credentialVersion: 3,
      deviceIdentifier: "device-a",
      effectiveOfflineAuthorizationExpiresAt: iso(20 * 60_000),
      ok: true,
      offlineAuthorizationPolicyVersion: "pos-policy-v1",
      posDeviceCredentialId: CREDENTIAL,
      posSessionId: SESSION,
      serverTime: iso(-60_000),
      sessionExpiresAt: expiresAt,
      shopDeviceId: DEVICE,
      shopId: SHOP,
      staffId: STAFF,
    };
    const commitCalls = [];
    assert.equal(
      (
        await module.commitPosFirstLogin(
          {
            async rpc(name, args) {
              commitCalls.push({ args, name });
              return { data: commit, error: null };
            },
          },
          commitInput,
        )
      ).ok,
      true,
    );
    assert.equal(commitCalls[0].name, "pos_runtime_first_login_commit_v3");
    assert.equal(commitCalls[0].args.p_device_ttl_seconds, 180 * 24 * 60 * 60);
    assert.equal(
      commitCalls[0].args.p_offline_authorization_max_age_seconds,
      12 * 60 * 60,
    );
    assert.equal(
      commitCalls[0].args.p_offline_authorization_policy_version,
      "pos-policy-v1",
    );
    assert.equal(commitCalls[0].args.p_session_ttl_seconds, 12 * 60 * 60);
    assert.equal("p_device_expires_at" in commitCalls[0].args, false);
    assert.equal("p_session_expires_at" in commitCalls[0].args, false);
    assert.equal(
      (
        await module.commitPosFirstLogin(
          adminReturning({ ...commit, sessionExpiresAt: iso(-10 * 60_000) }),
          commitInput,
        )
      ).ok,
      false,
    );
  } finally {
    await cleanup();
  }
});

function staffRuntime() {
  const issuedAt = iso(-60_000);
  const expiresAt = iso(30 * 60_000);
  return {
    status: "ok",
    permissions: ["sync.read"],
    session: {
      expires_at: expiresAt,
      issued_at: issuedAt,
      session_token_hash: TOKEN_HASH,
      staff_credential_version: 3,
      staff_id: STAFF,
      staff_web_session_id: WEB_SESSION,
      shop_id: SHOP,
      status: "active",
    },
    shop: {
      company_rut: null,
      shop_code: "SHOP1",
      shop_id: SHOP,
      shop_name: "Shop One",
      shop_status: "active",
    },
    staff: {
      credential_expires_at: iso(60 * 60_000),
      credential_status: "active",
      credential_version: 3,
      display_name: "Manager",
      locked_until: null,
      must_change_credential: false,
      role_key: "manager",
      session_invalidated_at: null,
      shop_id: SHOP,
      staff_code: "STAFF1",
      staff_id: STAFF,
      status: "active",
      web_access_revoked_at: null,
    },
  };
}

test("staff web lookup, session and commit bind requested identities", async () => {
  const { cleanup, module } = await loadModule(
    "src/server/shop-admin/staff-web-runtime-boundary.ts",
  );
  try {
    const runtime = staffRuntime();
    const lookup = {
      attempt: {
        attempt_key_hash: TOKEN_HASH,
        failed_attempts: 0,
        locked_until: null,
      },
      permissions: runtime.permissions,
      shop: runtime.shop,
      staff: {
        ...runtime.staff,
        credential_hash: "hash",
        failed_attempts: 0,
      },
      status: "ok",
    };
    assert.ok(
      await module.lookupStaffWebLogin(adminReturning(lookup), {
        attemptKeyHash: TOKEN_HASH,
        shopCode: "shop1",
        staffCode: "staff1",
      }),
    );
    assert.equal(
      await module.lookupStaffWebLogin(
        adminReturning({
          ...lookup,
          attempt: { ...lookup.attempt, attempt_key_hash: `sha256:${"b".repeat(64)}` },
        }),
        {
          attemptKeyHash: TOKEN_HASH,
          shopCode: "SHOP1",
          staffCode: "STAFF1",
        },
      ),
      null,
    );
    const resolvedRuntime = await module.resolveStaffWebRuntimeSession(
      adminReturning(runtime),
      TOKEN_HASH,
    );
    assert.equal(resolvedRuntime.kind, "ok");
    assert.equal(resolvedRuntime.runtime.shop.shopId, SHOP);

    assert.deepEqual(
      await module.resolveStaffWebRuntimeSession(
        adminReturning({
          ...runtime,
          session: { ...runtime.session, shop_id: OTHER_SHOP },
        }),
        TOKEN_HASH,
      ),
      { kind: "denied" },
      "a cross-shop runtime envelope must not become a usable staff session",
    );
    assert.deepEqual(
      await module.resolveStaffWebRuntimeSession(
        adminReturning({ status: "expired" }),
        TOKEN_HASH,
      ),
      { kind: "expired" },
      "the server's expired lease result stays distinct from denial",
    );
    assert.deepEqual(
      await module.resolveStaffWebRuntimeSession(
        adminReturning(null, { message: "temporary rpc failure" }),
        TOKEN_HASH,
      ),
      { kind: "failed" },
      "a transport or RPC failure must not be misclassified as an expired lease",
    );

    const expiresAt = iso(30 * 60_000);
    const commitInput = {
      attemptKeyHash: TOKEN_HASH,
      expectedCredentialVersion: 3,
      expiresAt,
      metadata: {},
      sessionTokenHash: TOKEN_HASH,
      shopId: SHOP,
      staffId: STAFF,
    };
    assert.equal(
      (
        await module.commitStaffWebLogin(
          adminReturning({
            attemptKeyHash: TOKEN_HASH,
            code: "success",
            credentialVersion: 3,
            expiresAt,
            ok: true,
            shopId: SHOP,
            staffId: STAFF,
            staffWebSessionId: WEB_SESSION,
          }),
          commitInput,
        )
      ).ok,
      true,
    );
    assert.equal(
      await module.commitStaffWebLogin(
        adminReturning({
          attemptKeyHash: TOKEN_HASH,
          code: "success",
          credentialVersion: 3,
          expiresAt: iso(10 * 60_000),
          ok: true,
          shopId: SHOP,
          staffId: STAFF,
          staffWebSessionId: WEB_SESSION,
        }),
        commitInput,
      ),
      null,
    );
  } finally {
    await cleanup();
  }
});
