import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { createContext, Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTest = createRequire(import.meta.url);
const win7PosRoot = resolve(
  process.env.WIN7POS_REPO_PATH || join(root, "..", "Win7POS"),
);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function transpileCommonJs(relativePath, stubs) {
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    createContext({
      Buffer,
      Date,
      Request,
      Response,
      console,
      exports: cjsModule.exports,
      module: cjsModule,
      require(specifier) {
        if (specifier === "server-only") return {};
        if (specifier in stubs) return stubs[specifier];
        return requireForTest(specifier);
      },
    }),
  );

  return cjsModule.exports;
}

function identity() {
  return {
    device: null,
    shop: {
      business_address: null,
      business_city: null,
      business_giro: null,
      company_rut: null,
      fiscal_identity_locked_by_platform: true,
      legal_representative_rut: null,
      shop_code: "TASK144",
      shop_id: "10000000-0000-4000-8000-000000000144",
      shop_name: "Synthetic fixture",
      shop_status: "active",
      updated_at: "2026-07-28T03:00:00.000Z",
    },
    staff: {
      credential_expires_at: "2026-07-29T03:00:00.000Z",
      credential_hash: "redacted-hash",
      credential_status: "active",
      credential_version: 7,
      display_name: "Synthetic operator",
      failed_attempts: 0,
      locked_until: null,
      must_change_credential: false,
      role_key: "pos_admin",
      session_invalidated_at: null,
      shop_id: "10000000-0000-4000-8000-000000000144",
      staff_code: "POS144",
      staff_id: "20000000-0000-4000-8000-000000000144",
      status: "active",
    },
    status: "ok",
  };
}

function loadFirstLogin(commitResult, options = {}) {
  const calls = {
    audit: [],
    commit: [],
    publication: [],
  };
  const supabase = {};
  const runtime = {
    commitPosFirstLogin: async (_client, input) => {
      calls.commit.push(input);
      return commitResult;
    },
    loadPosFirstLoginIdentity: async () => identity(),
    loadPosRuntimeLease: async () => ({ status: "denied" }),
    markPosRuntimeSession: async () => true,
    publishPosRuntimeLeaseSuccess: async (_client, input) => {
      calls.publication.push(input);
      return { status: "ok" };
    },
    recordPosFirstLoginFailure: async () => true,
    touchPosHeartbeat: async () => true,
    writePosRuntimeAudit: async (_client, input) => {
      calls.audit.push(input);
      return true;
    },
  };
  const core = transpileCommonJs("src/server/pos-auth/first-login-core.ts", {
    "@/server/shop-admin/staff-credentials": {
      verifyStaffCredential: async () => {
        if (options.credentialVerificationThrows) {
          throw new Error("test-only credential verification failure");
        }
        return true;
      },
    },
    "./pos-contract": {
      POS_OFFLINE_AUTHORIZATION_MAX_AGE_SECONDS: 43200,
      POS_POLICY_CONTRACT_VERSION: "pos-policy-v1",
    },
    "./runtime-boundary": runtime,
    "./shop-payload": {
      buildPosPolicyPayload: () => ({
        contractVersion: "pos-policy-v1",
        offlinePolicy: { authorizationMaxAgeSeconds: 43200 },
      }),
      buildPosShopPayload: (shop) => ({
        shopCode: shop.shop_code,
        shopId: shop.shop_id,
        shopName: shop.shop_name,
      }),
    },
    "./tokens": {
      generatePosSecret: (kind) => `redacted-${kind}`,
      hashPosSecret: () => `sha256:${"a".repeat(64)}`,
    },
  });
  const service = {
    handlePosFirstLogin(input, meta) {
      return core.handlePosFirstLoginWithClient(supabase, input, meta);
    },
  };

  return { calls, service };
}

function validInput() {
  return {
    credential: "redacted",
    device: {
      appVersion: "1.0-fixture",
      deviceIdentifier: "task144-device",
      displayName: "Synthetic device",
    },
    shopCode: "TASK144",
    staffCode: "POS144",
  };
}

test("TASK-144 first login returns the authoritative bounded UTC expiry", async () => {
  const serverTime = "2026-07-28T03:10:00.123456Z";
  const offlineExpiry = "2026-07-28T15:10:00.123456Z";
  const sessionExpiry = "2026-07-28T15:10:00.123456Z";
  const { calls, service } = loadFirstLogin({
    effectiveOfflineAuthorizationExpiresAt: offlineExpiry,
    ok: true,
    posSessionId: "40000000-0000-4000-8000-000000000144",
    serverTime,
    sessionExpiresAt: sessionExpiry,
    shopDeviceId: "30000000-0000-4000-8000-000000000144",
  });

  const result = await service.handlePosFirstLogin(validInput(), {
    clientRequestId: "posreq_task144",
    requestId: "posreq_server_task144",
    route: "pos.auth.first-login",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.serverTime, serverTime);
  assert.equal(
    result.body.effectiveOfflineAuthorizationExpiresAt,
    offlineExpiry,
  );
  assert.ok(Date.parse(offlineExpiry) > Date.parse(serverTime));
  assert.ok(Date.parse(offlineExpiry) <= Date.parse(sessionExpiry));
  assert.equal(calls.commit.length, 1);
  assert.equal(calls.commit[0].offlineAuthorizationMaxAgeSeconds, 43200);
  assert.equal(
    calls.commit[0].offlineAuthorizationPolicyVersion,
    "pos-policy-v1",
  );
  assert.equal(calls.publication.length, 1);
  assert.equal(calls.publication[0].publicationKind, "first_login");
});

test("TASK-144 exposes every typed offline-authorization failure", async () => {
  const cases = [
    ["offline_authorization_not_permitted", 401],
    ["offline_authorization_expired", 401],
    ["offline_authorization_policy_invalid", 500],
    ["offline_authorization_persistence_failed", 500],
  ];

  for (const [code, status] of cases) {
    const { calls, service } = loadFirstLogin({ code, ok: false });
    const result = await service.handlePosFirstLogin(validInput(), {
      requestId: "posreq_server_task144",
      route: "pos.auth.first-login",
    });

    assert.equal(result.status, status, code);
    assert.equal(result.body.code, code, code);
    assert.equal(result.body.ok, false, code);
    assert.equal(calls.audit.at(-1).code, code, code);
    assert.deepEqual(calls.audit.at(-1).metadata.reason, code, code);
  }
});

test("TASK-144 credential runtime failures fail closed with a bounded audit", async () => {
  const { calls, service } = loadFirstLogin(
    {
      code: "unused",
      ok: false,
    },
    { credentialVerificationThrows: true },
  );
  const result = await service.handlePosFirstLogin(validInput(), {
    requestId: "posreq_server_task144",
    route: "pos.auth.first-login",
  });

  assert.equal(result.status, 500);
  assert.equal(result.body.code, "db_failure");
  assert.equal(calls.commit.length, 0);
  assert.equal(calls.audit.at(-1).code, "credential_verification_failed");
  assert.equal(
    calls.audit.at(-1).metadata.stage,
    "credential_verification",
  );
});

test("TASK-144 runtime boundary calls only V3 and rejects malformed authority", async () => {
  const calls = [];
  const runtime = transpileCommonJs("src/server/pos-auth/runtime-boundary.ts", {});
  const baseResult = {
    code: "success",
    credentialVersion: 7,
    deviceIdentifier: "task144-device",
    effectiveOfflineAuthorizationExpiresAt:
      "2099-01-01T12:00:00.123456Z",
    offlineAuthorizationPolicyVersion: "pos-policy-v1",
    ok: true,
    posDeviceCredentialId: "50000000-0000-4000-8000-000000000144",
    posSessionId: "40000000-0000-4000-8000-000000000144",
    serverTime: "2099-01-01T00:00:00.123456Z",
    sessionExpiresAt: "2099-01-01T12:00:00.123456Z",
    shopDeviceId: "30000000-0000-4000-8000-000000000144",
    shopId: "10000000-0000-4000-8000-000000000144",
    staffId: "20000000-0000-4000-8000-000000000144",
  };
  const supabase = {
    async rpc(name, args) {
      calls.push({ args, name });
      return { data: baseResult, error: null };
    },
  };
  const input = {
    appVersion: "1.0-fixture",
    credentialVersion: 7,
    deviceDisplayName: "Synthetic device",
    deviceIdentifier: "task144-device",
    deviceTokenHash: `sha256:${"a".repeat(64)}`,
    deviceTtlSeconds: 15552000,
    metadata: { source: "TASK-144" },
    offlineAuthorizationMaxAgeSeconds: 43200,
    offlineAuthorizationPolicyVersion: "pos-policy-v1",
    sessionTokenHash: `sha256:${"b".repeat(64)}`,
    sessionTtlSeconds: 43200,
    shopId: "10000000-0000-4000-8000-000000000144",
    staffId: "20000000-0000-4000-8000-000000000144",
  };

  const accepted = await runtime.commitPosFirstLogin(supabase, input);
  assert.equal(accepted.ok, true);
  assert.equal(calls[0].name, "pos_runtime_first_login_commit_v3");
  assert.equal(
    calls[0].args.p_offline_authorization_max_age_seconds,
    43200,
  );
  assert.equal(
    calls[0].args.p_offline_authorization_policy_version,
    "pos-policy-v1",
  );

  baseResult.effectiveOfflineAuthorizationExpiresAt =
    "2099-01-01T12:00:00+00:00";
  const rejected = await runtime.commitPosFirstLogin(supabase, input);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "db_failure");
});

test("TASK-144 migration persists, bounds and revokes the authority privately", () => {
  const migration = read(
    "supabase/migrations/20260728030154_task_144_pos_offline_authorization_attestation.sql",
  );

  for (const required of [
    "offline_authorization_issued_at",
    "offline_authorization_expires_at",
    "offline_authorization_invalidated_at",
    "offline_authorization_policy_version",
    "public.pos_runtime_first_login_commit_v3",
    "p_offline_authorization_max_age_seconds not between 1 and 43200",
    "v_previous_offline_expires_at",
    "offline_authorization_not_permitted",
    "offline_authorization_expired",
    "offline_authorization_policy_invalid",
    "offline_authorization_persistence_failed",
    "set search_path = ''",
    "from public, anon, authenticated",
    "to service_role",
  ]) {
    assert.ok(migration.includes(required), required);
  }

  assert.match(
    migration,
    /v_offline_expires_at := least\([\s\S]*v_session_expires_at[\s\S]*v_device_expires_at/,
  );
  assert.match(
    migration,
    /v_offline_expires_at := least\([\s\S]*v_previous_offline_expires_at/,
  );
  assert.equal(
    (
      migration.match(
        /offline_authorization_invalidated_at is not null\s+or offline_authorization_expires_at <= expires_at/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(
    migration,
    /task144_invalidate_staff_pos_offline_authorization/,
  );
  assert.match(
    migration,
    /task144_invalidate_device_pos_offline_authorization/,
  );
  assert.match(
    migration,
    /task144_invalidate_shop_pos_offline_authorization/,
  );
  assert.doesNotMatch(migration, /credential_hash.*jsonb_build_object/i);
  assert.doesNotMatch(migration, /token_hash.*jsonb_build_object/i);
});

test("TASK-144 fixture matches the exact Win7POS response field", {
  skip: !existsSync(win7PosRoot),
}, () => {
  const fixture = JSON.parse(
    read("contracts/pos/first-login-offline-authorization-v1.response.json"),
  );
  const contracts = readFileSync(
    join(
      win7PosRoot,
      "src/Win7POS.Core/Online/PosOnlineTransportContracts.cs",
    ),
    "utf8",
  );
  const policy = readFileSync(
    join(
      win7PosRoot,
      "src/Win7POS.Core/Online/PosOfflineAuthorizationLeasePolicy.cs",
    ),
    "utf8",
  );

  assert.match(
    contracts,
    /DataMember\(\s*Name\s*=\s*"effectiveOfflineAuthorizationExpiresAt"/,
  );
  assert.match(
    policy,
    /authoritativeOfflineExpiry\s*<\s*effectiveExpiry/,
  );
  assert.equal(fixture.ok, true);
  assert.equal(
    fixture.policy.offlinePolicy.authorizationMaxAgeSeconds,
    43200,
  );
  assert.ok(
    Date.parse(fixture.effectiveOfflineAuthorizationExpiresAt) >
      Date.parse(fixture.serverTime),
  );
  assert.ok(
    Date.parse(fixture.effectiveOfflineAuthorizationExpiresAt) <=
      Date.parse(fixture.session.expiresAt),
  );
  assert.equal(fixture.trustedDeviceToken, "redacted");
  assert.equal(fixture.session.sessionToken, "redacted");
});

test("TASK-144 audit metadata never receives body, credential or authority values", async () => {
  const firstLoginCore = read("src/server/pos-auth/first-login-core.ts");
  const requestMetadataBody = firstLoginCore.slice(
    firstLoginCore.indexOf("function requestMetadata"),
    firstLoginCore.indexOf("async function writePosAudit"),
  );
  const { calls, service: loadedService } = loadFirstLogin({
    code: "offline_authorization_not_permitted",
    ok: false,
  });

  await loadedService.handlePosFirstLogin(validInput(), {
    clientRequestId: "posreq_task144",
    requestId: "posreq_server_task144",
    route: "pos.auth.first-login",
  });
  const emittedMetadata = JSON.stringify(
    calls.audit.map((entry) => entry.metadata),
  );

  assert.doesNotMatch(
    requestMetadataBody,
    /body|credential|pin|password|token|effectiveOfflineAuthorizationExpiresAt/i,
  );
  assert.doesNotMatch(
    firstLoginCore,
    /console\.(log|info|warn|error)\(/,
  );
  assert.doesNotMatch(
    emittedMetadata,
    /"(?:body|credential|pin|password|token|effectiveOfflineAuthorizationExpiresAt)"\s*:/i,
  );
});
