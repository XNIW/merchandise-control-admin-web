import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({
  screenshot: "off",
  trace: "off",
  video: "off",
});

type ReadyRuntime = {
  appBaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  status: "ready";
  supabaseUrl: string;
  target: "local" | "staging";
};

type BlockedRuntime = {
  reason: string;
  status: "blocked";
};

type StaffFixture = {
  initialCredentialVersion: number;
  initialSessionInvalidatedAt: string;
  pin: string;
  staffCode: string;
  staffId: string;
};

type Task140Fixture = {
  activeReset: StaffFixture;
  cleanup: () => Promise<void>;
  concurrentLockout: StaffFixture;
  createStaffCode: string;
  expiring: StaffFixture;
  guardedPosAdminCode: string;
  legacyFive: StaffFixture;
  legacyEight: StaffFixture;
  managerActor: StaffFixture;
  ownerEmail: string;
  ownerPassword: string;
  posAdminCreateStaffCode: string;
  posDeviceIdentifiers: {
    canonicalSix: string;
    expiring: string;
    legacyEight: string;
    legacyFive: string;
  };
  shopCode: string;
  shopId: string;
  shopManagerEmail: string;
  shopManagerPassword: string;
  suspendedReset: StaffFixture;
};

type StaffState = {
  credential_kind: string | null;
  credential_status: string;
  credential_version: number;
  failed_attempts: number;
  locked_until: string | null;
  must_change_credential: boolean;
  role_key: string;
  session_invalidated_at: string | null;
  staff_id: string;
  status: string;
};

type PosFirstLoginState = {
  deviceToken: string;
  posSessionId: string;
  sessionToken: string;
  shopDeviceId: string;
};

const STAFF_CREDENTIAL_SCHEME = "scrypt-v1";
const STAFF_KEY_LENGTH = 64;
const STAFF_SALT_BYTES = 16;
const STAFF_SCRYPT_PARAMS = {
  N: 16384,
  p: 1,
  r: 8,
};
const STAFF_SCRYPT_MAXMEM = 64 * 1024 * 1024;
const EXPECTED_POS_ADMIN_PERMISSION_KEYS = [
  "audit.read",
  "audit.view",
  "catalog.export",
  "catalog.import",
  "catalog.manage",
  "catalog.price_edit",
  "catalog.read",
  "catalog.view",
  "catalog.write",
  "db.maintenance",
  "devices.read",
  "devices.write",
  "pos.dashboard.read",
  "pos.discount",
  "pos.pay",
  "pos.refund",
  "pos.sell",
  "pos.void",
  "printer.manage",
  "register.manage",
  "register.view",
  "settings.manage",
  "settings.read",
  "settings.view",
  "settings.write",
  "shop_admin.full_access",
  "staff.read",
  "staff.write",
  "sync.manage",
  "sync.read",
  "sync.write",
  "users.manage",
  "users.view",
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
let guardedStagingSupabaseUrl: string | null = null;

function parseTask140Url(value: string, errorCode: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error(errorCode);
  }
}

function task140EnvList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readTask140LinkedProjectRef() {
  let linkedProjectRef = "";
  let linkedProjectMetadata: unknown;

  try {
    linkedProjectRef = readFileSync(
      resolve(process.cwd(), "supabase/.temp/project-ref"),
      "utf8",
    ).trim();
    linkedProjectMetadata = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "supabase/.temp/linked-project.json"),
        "utf8",
      ),
    ) as unknown;
  } catch {
    throw new Error("BLOCKED_TASK140_STAGING_LINKED_PROJECT_REQUIRED");
  }

  const metadata = recordValue(linkedProjectMetadata);
  const metadataRef =
    typeof metadata?.ref === "string" ? metadata.ref.trim() : "";
  const metadataName =
    typeof metadata?.name === "string" ? metadata.name.trim() : "";

  if (
    !SUPABASE_PROJECT_REF_PATTERN.test(linkedProjectRef) ||
    metadataRef !== linkedProjectRef ||
    !/\b(?:dev|staging)\b/i.test(metadataName) ||
    /\b(?:prod|production)\b/i.test(metadataName)
  ) {
    throw new Error("BLOCKED_TASK140_STAGING_LINKED_PROJECT_MISMATCH");
  }

  return linkedProjectRef;
}

function assertTask140StagingRuntime(supabaseUrl: string, appBaseUrl: string) {
  if (
    process.env.ALLOW_STAGING_E2E !== "yes" ||
    process.env.CONFIRM_STAGING_E2E !== "yes" ||
    process.env.CONFIRM_TASK140_STAGING_SQL !== "yes"
  ) {
    throw new Error("BLOCKED_TASK140_STAGING_CONFIRMATION_REQUIRED");
  }

  try {
    execFileSync(
      process.execPath,
      [resolve(process.cwd(), "scripts/db/staging-status.mjs")],
      {
        env: process.env,
        stdio: "ignore",
      },
    );
  } catch {
    throw new Error("BLOCKED_TASK140_STAGING_TARGET_GUARD_FAILED");
  }

  const envProjectRef = process.env.SUPABASE_PROJECT_REF?.trim() ?? "";
  const linkedProjectRef = readTask140LinkedProjectRef();
  const allowedProjectRefs = [
    ...task140EnvList(process.env.ALLOWED_STAGING_SUPABASE_PROJECT_REFS),
    ...task140EnvList(process.env.STAGING_SUPABASE_PROJECT_REF),
  ];

  if (
    !SUPABASE_PROJECT_REF_PATTERN.test(envProjectRef) ||
    envProjectRef !== linkedProjectRef ||
    !allowedProjectRefs.includes(envProjectRef)
  ) {
    throw new Error("BLOCKED_TASK140_STAGING_PROJECT_REF_MISMATCH");
  }

  const supabaseTarget = parseTask140Url(
    supabaseUrl,
    "BLOCKED_TASK140_STAGING_SUPABASE_URL_INVALID",
  );
  const appTarget = parseTask140Url(
    appBaseUrl,
    "BLOCKED_TASK140_STAGING_APP_URL_INVALID",
  );

  if (
    supabaseTarget.protocol !== "https:" ||
    supabaseTarget.hostname !== `${envProjectRef}.supabase.co` ||
    supabaseTarget.username !== "" ||
    supabaseTarget.password !== "" ||
    supabaseTarget.pathname !== "/" ||
    supabaseTarget.search !== "" ||
    supabaseTarget.hash !== ""
  ) {
    throw new Error("BLOCKED_TASK140_STAGING_SUPABASE_URL_MISMATCH");
  }

  if (
    appTarget.protocol !== "https:" ||
    ["127.0.0.1", "localhost", "::1"].includes(appTarget.hostname) ||
    appTarget.username !== "" ||
    appTarget.password !== "" ||
    appTarget.pathname !== "/" ||
    appTarget.search !== "" ||
    appTarget.hash !== "" ||
    /(?:^|[.-])prod(?:[.-]|$)|production/i.test(appTarget.hostname) ||
    !/(?:^|[.-])(?:staging|dev|preview)(?:[.-]|$)|(?:workers\.dev|vercel\.app)$/i.test(
      appTarget.hostname,
    )
  ) {
    throw new Error("BLOCKED_TASK140_STAGING_APP_URL_MISMATCH");
  }

  guardedStagingSupabaseUrl = supabaseTarget.origin;

  return {
    appBaseUrl: appTarget.origin,
    supabaseUrl: supabaseTarget.origin,
  };
}

function runtimeFromEnv(): ReadyRuntime | BlockedRuntime {
  if (process.env.CONFIRM_TASK140_STAFF_PIN_E2E !== "yes") {
    return {
      reason: "TASK-140 staff PIN E2E is opt-in.",
      status: "blocked",
    };
  }

  const requestedTarget = process.env.TEST_TARGET;

  if (requestedTarget !== "local" && requestedTarget !== "staging") {
    throw new Error("BLOCKED_TASK140_REQUIRES_EXPLICIT_TEST_TARGET");
  }

  const target = requestedTarget;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const expectedSupabasePort =
    process.env.TASK140_EXPECTED_SUPABASE_PORT?.trim() ?? "";
  const appBaseUrl =
    process.env.PLAYWRIGHT_BASE_URL?.trim() ??
    (target === "local" ? "http://127.0.0.1:3000" : "");

  if (!publishableKey || !serviceRoleKey) {
    throw new Error("BLOCKED_TASK140_REQUIRES_SUPABASE_KEYS");
  }

  if (target === "staging") {
    const stagingTarget = assertTask140StagingRuntime(supabaseUrl, appBaseUrl);

    return {
      appBaseUrl: stagingTarget.appBaseUrl,
      publishableKey,
      serviceRoleKey,
      status: "ready",
      supabaseUrl: stagingTarget.supabaseUrl,
      target,
    };
  }

  const supabaseTarget = supabaseUrl
    ? parseTask140Url(
        supabaseUrl,
        "BLOCKED_TASK140_REQUIRES_LOCAL_SUPABASE_URL",
      )
    : null;
  const appTarget = parseTask140Url(
    appBaseUrl,
    "BLOCKED_TASK140_REQUIRES_LOCAL_APP_URL",
  );
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

  if (
    !supabaseTarget ||
    supabaseTarget.protocol !== "http:" ||
    !localHosts.has(supabaseTarget.hostname)
  ) {
    throw new Error("BLOCKED_TASK140_REQUIRES_LOCAL_SUPABASE_URL");
  }

  if (!/^\d{2,5}$/.test(expectedSupabasePort)) {
    throw new Error("BLOCKED_TASK140_EXPECTED_SUPABASE_PORT_REQUIRED");
  }

  if (supabaseTarget.port !== expectedSupabasePort) {
    throw new Error("BLOCKED_TASK140_SUPABASE_PORT_MISMATCH");
  }

  if (appTarget.protocol !== "http:" || !localHosts.has(appTarget.hostname)) {
    throw new Error("BLOCKED_TASK140_REQUIRES_LOCAL_APP_URL");
  }

  return {
    appBaseUrl,
    publishableKey,
    serviceRoleKey,
    status: "ready",
    supabaseUrl,
    target,
  };
}

function nonce() {
  return randomBytes(5).toString("hex").toUpperCase();
}

function task140Code(label: string, value: string) {
  return `T140_${label}_${value}`.slice(0, 32);
}

function syntheticNumericCredential(length: 5 | 6 | 8) {
  const limit = 10 ** length;

  return randomInt(0, limit).toString().padStart(length, "0");
}

function hashStaffWebAttemptKey(shopCode: string, staffCode: string) {
  return `sha256:${createHash("sha256")
    .update(`${shopCode}:${staffCode}`, "utf8")
    .digest("hex")}`;
}

function staffHashParams() {
  return [
    `n=${STAFF_SCRYPT_PARAMS.N}`,
    `r=${STAFF_SCRYPT_PARAMS.r}`,
    `p=${STAFF_SCRYPT_PARAMS.p}`,
    `l=${STAFF_KEY_LENGTH}`,
  ].join(",");
}

async function deriveStaffScrypt(plaintext: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      plaintext,
      salt,
      STAFF_KEY_LENGTH,
      {
        ...STAFF_SCRYPT_PARAMS,
        maxmem: STAFF_SCRYPT_MAXMEM,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

async function hashStaffCredentialForFixture(plaintext: string) {
  const salt = randomBytes(STAFF_SALT_BYTES);
  const key = await deriveStaffScrypt(plaintext, salt);

  return [
    "",
    STAFF_CREDENTIAL_SCHEME,
    staffHashParams(),
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function localDatabaseUrl(expectedSupabaseUrl: string) {
  const output = execFileSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const databaseUrl = output.match(/^DB_URL="?([^"\n]+)"?$/m)?.[1];
  const apiUrl = output.match(/^API_URL="?([^"\n]+)"?$/m)?.[1];

  if (!databaseUrl || !apiUrl) {
    throw new Error("TASK140_LOCAL_STACK_STATUS_INCOMPLETE");
  }

  const databaseTarget = new URL(databaseUrl);
  const statusApiTarget = new URL(apiUrl);
  const expectedApiTarget = new URL(expectedSupabaseUrl);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

  if (
    statusApiTarget.origin !== expectedApiTarget.origin ||
    !localHosts.has(databaseTarget.hostname) ||
    !["postgres:", "postgresql:"].includes(databaseTarget.protocol)
  ) {
    throw new Error("TASK140_LOCAL_STACK_STATUS_MISMATCH");
  }

  return databaseUrl;
}

function deleteTask140AuditRows(
  shopId: string,
  ownerProfileId: string,
  expectedSupabaseUrl: string,
) {
  if (!UUID_PATTERN.test(shopId) || !UUID_PATTERN.test(ownerProfileId)) {
    throw new Error("TASK140_AUDIT_CLEANUP_SCOPE_INVALID");
  }

  const sql = [
    "begin",
    "alter table public.audit_logs disable trigger user",
    `delete from public.audit_logs where shop_id = '${shopId}'::uuid or actor_profile_id = '${ownerProfileId}'::uuid`,
    "alter table public.audit_logs enable trigger user",
    "commit",
  ].join(";");

  if (process.env.TEST_TARGET === "staging") {
    executeTask140Sql(expectedSupabaseUrl, "AUDIT_DELETE", sql);
    return;
  }

  execFileSync(
    "psql",
    [localDatabaseUrl(expectedSupabaseUrl), "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: "5",
      },
      stdio: "ignore",
    },
  );
}

function task140AttemptHashAllowlist(hashes: string[]) {
  const uniqueHashes = [...new Set(hashes)];

  if (
    uniqueHashes.length === 0 ||
    uniqueHashes.length !== hashes.length ||
    uniqueHashes.length > 16 ||
    uniqueHashes.some((hash) => !/^sha256:[0-9a-f]{64}$/.test(hash))
  ) {
    throw new Error("TASK140_WEB_ATTEMPT_HASH_ALLOWLIST_INVALID");
  }

  return uniqueHashes.map((hash) => `'${hash}'`).join(",");
}

function task140TimestampLiteral(value: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error("TASK140_WEB_ATTEMPT_TIMESTAMP_INVALID");
  }

  return `'${new Date(timestamp).toISOString()}'::timestamptz`;
}

function assertTask140StagingSqlTarget(expectedSupabaseUrl: string) {
  if (
    process.env.TEST_TARGET !== "staging" ||
    process.env.CONFIRM_TASK140_STAGING_SQL !== "yes" ||
    !guardedStagingSupabaseUrl ||
    guardedStagingSupabaseUrl !== expectedSupabaseUrl
  ) {
    throw new Error("BLOCKED_TASK140_STAGING_SQL_TARGET_MISMATCH");
  }
}

function task140SupabaseCliEnv() {
  const cliEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DO_NOT_TRACK: "1",
    SUPABASE_TELEMETRY_DISABLED: "1",
  };

  delete cliEnv.SUPABASE_SERVICE_ROLE_KEY;

  return cliEnv;
}

function runTask140StagingSql(
  expectedSupabaseUrl: string,
  label: string,
  sql: string,
) {
  assertTask140StagingSqlTarget(expectedSupabaseUrl);

  if (!sql.trim() || sql.length > 256_000) {
    throw new Error(`TASK140_${label}_SQL_INPUT_INVALID`);
  }

  let output: string;

  try {
    output = execFileSync(
      "supabase",
      ["db", "query", "--linked", "--output-format", "json", "--agent", "no"],
      {
        encoding: "utf8",
        env: task140SupabaseCliEnv(),
        input: sql,
        maxBuffer: 512 * 1024,
        stdio: ["pipe", "pipe", "ignore"],
        timeout: task140UiActionTimeout(),
      },
    ).trim();
  } catch {
    throw new Error(`TASK140_${label}_FAILED`);
  }

  try {
    const parsed = JSON.parse(output) as unknown;

    if (
      !Array.isArray(parsed) ||
      parsed.length > 1 ||
      parsed.some((row) => !recordValue(row))
    ) {
      throw new Error("invalid");
    }

    return parsed as Record<string, unknown>[];
  } catch {
    throw new Error(`TASK140_${label}_INVALID`);
  }
}

function parseTask140CountRow(rows: Record<string, unknown>[], label: string) {
  if (rows.length !== 1) {
    throw new Error(`TASK140_${label}_INVALID`);
  }

  const values = Object.values(rows[0]);

  if (values.length !== 1) {
    throw new Error(`TASK140_${label}_INVALID`);
  }

  const rawValue = values[0];
  const count =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string" && /^\d+$/.test(rawValue)
        ? Number(rawValue)
        : Number.NaN;

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`TASK140_${label}_INVALID`);
  }

  return count;
}

function parseTask140JsonRow<T>(
  rows: Record<string, unknown>[],
  label: string,
): T {
  if (rows.length !== 1) {
    throw new Error(`TASK140_${label}_INVALID`);
  }

  const values = Object.values(rows[0]);

  if (values.length !== 1 || !recordValue(values[0])) {
    throw new Error(`TASK140_${label}_INVALID`);
  }

  return values[0] as T;
}

function executeTask140Sql(
  expectedSupabaseUrl: string,
  label: string,
  sql: string,
) {
  if (process.env.TEST_TARGET === "staging") {
    const rows = runTask140StagingSql(expectedSupabaseUrl, label, sql);

    if (rows.length !== 0) {
      throw new Error(`TASK140_${label}_INVALID`);
    }

    return;
  }

  if (process.env.TEST_TARGET !== "local") {
    throw new Error("BLOCKED_TASK140_SQL_TARGET_REQUIRED");
  }

  try {
    execFileSync(
      "psql",
      [
        localDatabaseUrl(expectedSupabaseUrl),
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ],
      {
        env: {
          ...process.env,
          PGCONNECT_TIMEOUT: "5",
        },
        stdio: "ignore",
      },
    );
  } catch {
    throw new Error(`TASK140_${label}_FAILED`);
  }
}

function executeTask140IdempotentSql(
  expectedSupabaseUrl: string,
  label: string,
  sql: string,
) {
  try {
    executeTask140Sql(expectedSupabaseUrl, label, sql);
  } catch {
    console.info(`[task140] WARN retrying idempotent SQL ${label}`);
    executeTask140Sql(expectedSupabaseUrl, label, sql);
  }
}

function countTask140Sql(
  expectedSupabaseUrl: string,
  label: string,
  sql: string,
) {
  if (process.env.TEST_TARGET === "staging") {
    return parseTask140CountRow(
      runTask140StagingSql(expectedSupabaseUrl, label, sql),
      label,
    );
  }

  if (process.env.TEST_TARGET !== "local") {
    throw new Error("BLOCKED_TASK140_SQL_TARGET_REQUIRED");
  }

  let output: string;

  try {
    output = execFileSync(
      "psql",
      [
        localDatabaseUrl(expectedSupabaseUrl),
        "-v",
        "ON_ERROR_STOP=1",
        "-qAt",
        "-c",
        sql,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PGCONNECT_TIMEOUT: "5",
        },
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  } catch {
    throw new Error(`TASK140_${label}_FAILED`);
  }

  if (!/^\d+$/.test(output)) {
    throw new Error(`TASK140_${label}_INVALID`);
  }

  return Number(output);
}

function queryTask140Json<T>(
  expectedSupabaseUrl: string,
  label: string,
  sql: string,
): T {
  if (process.env.TEST_TARGET === "staging") {
    return parseTask140JsonRow<T>(
      runTask140StagingSql(expectedSupabaseUrl, label, sql),
      label,
    );
  }

  if (process.env.TEST_TARGET !== "local") {
    throw new Error("BLOCKED_TASK140_SQL_TARGET_REQUIRED");
  }

  let output: string;

  try {
    output = execFileSync(
      "psql",
      [
        localDatabaseUrl(expectedSupabaseUrl),
        "-v",
        "ON_ERROR_STOP=1",
        "-qAt",
        "-c",
        sql,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PGCONNECT_TIMEOUT: "5",
        },
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  } catch {
    throw new Error(`TASK140_${label}_FAILED`);
  }

  try {
    const parsed = JSON.parse(output) as unknown;

    if (!recordValue(parsed)) {
      throw new Error("invalid");
    }

    return parsed as T;
  } catch {
    throw new Error(`TASK140_${label}_INVALID`);
  }
}

function task140SqlText(
  value: string,
  label: string,
  options: {
    maxLength?: number;
    pattern?: RegExp;
  } = {},
) {
  const maxLength = options.maxLength ?? 512;

  if (
    value.length === 0 ||
    value.length > maxLength ||
    value.includes("\0") ||
    (options.pattern && !options.pattern.test(value))
  ) {
    throw new Error(`TASK140_${label}_SQL_VALUE_INVALID`);
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function task140SqlUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`TASK140_${label}_UUID_INVALID`);
  }

  return `'${value}'::uuid`;
}

function seedTask140WebAttempts(
  expectedSupabaseUrl: string,
  hashes: string[],
  lastFailedAt: string,
  lockedUntil: string,
) {
  const allowlist = task140AttemptHashAllowlist(hashes);
  const failedAtSql = task140TimestampLiteral(lastFailedAt);
  const lockedUntilSql = task140TimestampLiteral(lockedUntil);
  const rows = allowlist
    .split(",")
    .map(
      (hash) =>
        `(${hash}, 5, ${failedAtSql}, ${lockedUntilSql}, '{"fixture":"TASK-140 synthetic local"}'::jsonb)`,
    )
    .join(",");

  executeTask140Sql(
    expectedSupabaseUrl,
    "WEB_ATTEMPT_SETUP",
    [
      "insert into public.staff_web_login_attempts",
      "(attempt_key_hash, failed_attempts, last_failed_at, locked_until, metadata_redacted)",
      `values ${rows}`,
      "on conflict (attempt_key_hash) do update set",
      "failed_attempts = excluded.failed_attempts,",
      "last_failed_at = excluded.last_failed_at,",
      "last_success_at = null,",
      "locked_until = excluded.locked_until,",
      "metadata_redacted = excluded.metadata_redacted,",
      "updated_at = now()",
    ].join(" "),
  );
}

function purgeTask140WebAttempts(
  expectedSupabaseUrl: string,
  hashes: string[],
) {
  const allowlist = task140AttemptHashAllowlist(hashes);

  executeTask140Sql(
    expectedSupabaseUrl,
    "WEB_ATTEMPT_PURGE",
    `delete from public.staff_web_login_attempts where attempt_key_hash in (${allowlist})`,
  );
}

function countTask140WebAttempts(
  expectedSupabaseUrl: string,
  hashes: string[],
) {
  const allowlist = task140AttemptHashAllowlist(hashes);

  return countTask140Sql(
    expectedSupabaseUrl,
    "WEB_ATTEMPT_COUNT",
    `select count(*) from public.staff_web_login_attempts where attempt_key_hash in (${allowlist})`,
  );
}

function countTask140Profiles(expectedSupabaseUrl: string, profileId: string) {
  if (!UUID_PATTERN.test(profileId)) {
    throw new Error("TASK140_PROFILE_COUNT_SCOPE_INVALID");
  }

  return countTask140Sql(
    expectedSupabaseUrl,
    "PROFILE_COUNT",
    `select count(*) from public.profiles where profile_id = '${profileId}'::uuid`,
  );
}

async function createTask140Fixture(
  runtime: ReadyRuntime,
): Promise<Task140Fixture> {
  const supabase = createClient<Database>(
    runtime.supabaseUrl,
    runtime.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const value = nonce();
  const ownerEmail = `task140-${value.toLowerCase()}@example.invalid`;
  const ownerPassword = `Task140-${randomBytes(24).toString("base64url")}`;
  const shopManagerEmail = `task140-manager-${value.toLowerCase()}@example.invalid`;
  const shopManagerPassword = `Task140-Manager-${randomBytes(24).toString("base64url")}`;
  const shopCode = task140Code("SHOP", value);
  const createStaffCode = task140Code("CREATE", value);
  const posAdminCreateStaffCode = task140Code("POSADMIN", value);
  const guardedPosAdminCode = task140Code("GUARDED", value);
  const activeResetCode = task140Code("RESET", value);
  const concurrentLockoutCode = task140Code("LOCK", value);
  const expiringCode = task140Code("EXP", value);
  const suspendedResetCode = task140Code("SUSP", value);
  const legacyFiveCode = task140Code("LEG5", value);
  const legacyEightCode = task140Code("LEG8", value);
  const managerActorCode = task140Code("ACTOR", value);
  const posDeviceIdentifiers = {
    canonicalSix: task140Code("POS6", value),
    expiring: task140Code("POSEXP", value),
    legacyEight: task140Code("POS8", value),
    legacyFive: task140Code("POS5", value),
  };
  const attemptKeyHashes = [
    createStaffCode,
    activeResetCode,
    concurrentLockoutCode,
    expiringCode,
    suspendedResetCode,
    legacyFiveCode,
    legacyEightCode,
    managerActorCode,
    posAdminCreateStaffCode,
  ].map((staffCode) => hashStaffWebAttemptKey(shopCode, staffCode));
  const initialSessionInvalidatedAt = "2020-01-01T00:00:00.000Z";
  const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  let ownerProfileId = "";
  let shopManagerProfileId = "";
  let shopId = "";

  async function cleanup() {
    const errors: string[] = [];

    function recordSql(label: string, sql: string) {
      try {
        executeTask140Sql(runtime.supabaseUrl, label, sql);
      } catch {
        errors.push(label);
      }
    }

    if (shopId) {
      const shopIdSql = task140SqlUuid(shopId, "CLEANUP_SHOP");

      recordSql(
        "POS_SESSIONS_DELETE",
        `delete from public.pos_sessions where shop_id = ${shopIdSql}`,
      );
      recordSql(
        "POS_DEVICE_CREDENTIALS_DELETE",
        `delete from public.pos_device_credentials where shop_id = ${shopIdSql}`,
      );
      recordSql(
        "STAFF_WEB_SESSIONS_DELETE",
        `delete from public.staff_web_sessions where shop_id = ${shopIdSql}`,
      );

      if (ownerProfileId) {
        try {
          deleteTask140AuditRows(shopId, ownerProfileId, runtime.supabaseUrl);
        } catch {
          errors.push("AUDIT_DELETE");
        }
      }

      recordSql(
        "SHOP_DEVICES_DELETE",
        `delete from public.shop_devices where shop_id = ${shopIdSql}`,
      );
      recordSql(
        "STAFF_ROLE_PERMISSIONS_DELETE",
        `delete from public.staff_role_permissions where shop_id = ${shopIdSql} and role_key <> 'pos_admin'`,
      );
      recordSql(
        "STAFF_ACCOUNTS_DELETE",
        `delete from public.staff_accounts where shop_id = ${shopIdSql}`,
      );
      recordSql(
        "SHOP_MEMBERS_DELETE",
        `delete from public.shop_members where shop_id = ${shopIdSql}`,
      );
    }

    try {
      purgeTask140WebAttempts(runtime.supabaseUrl, attemptKeyHashes);
    } catch {
      errors.push("STAFF_WEB_LOGIN_ATTEMPTS_DELETE");
    }

    if (shopId) {
      recordSql(
        "SHOP_DELETE",
        `delete from public.shops where shop_id = ${task140SqlUuid(
          shopId,
          "CLEANUP_SHOP",
        )}`,
      );
    }

    for (const profileId of [shopManagerProfileId, ownerProfileId]) {
      if (!profileId) {
        continue;
      }

      try {
        const deletedUser = await supabase.auth.admin.deleteUser(profileId);

        if (deletedUser.error) {
          errors.push("AUTH_USER_DELETE");
        }
      } catch {
        errors.push("AUTH_USER_DELETE");
      }
    }

    if (shopId) {
      try {
        const shopIdSql = task140SqlUuid(shopId, "RESIDUE_SHOP");
        const residue = queryTask140Json<Record<string, number>>(
          runtime.supabaseUrl,
          "SHOP_RESIDUE_COUNT",
          [
            "select json_build_object(",
            `'pos_sessions', (select count(*) from public.pos_sessions where shop_id = ${shopIdSql}),`,
            `'pos_device_credentials', (select count(*) from public.pos_device_credentials where shop_id = ${shopIdSql}),`,
            `'shop_devices', (select count(*) from public.shop_devices where shop_id = ${shopIdSql}),`,
            `'staff_web_sessions', (select count(*) from public.staff_web_sessions where shop_id = ${shopIdSql}),`,
            `'staff_role_permissions', (select count(*) from public.staff_role_permissions where shop_id = ${shopIdSql}),`,
            `'staff_accounts', (select count(*) from public.staff_accounts where shop_id = ${shopIdSql}),`,
            `'shop_members', (select count(*) from public.shop_members where shop_id = ${shopIdSql}),`,
            `'audit_logs', (select count(*) from public.audit_logs where shop_id = ${shopIdSql}),`,
            `'shops', (select count(*) from public.shops where shop_id = ${shopIdSql})`,
            ")",
          ].join(" "),
        );

        if (
          Object.values(residue).some(
            (count) => !Number.isInteger(count) || count !== 0,
          )
        ) {
          errors.push("SHOP_RESIDUE");
        }
      } catch {
        errors.push("SHOP_RESIDUE");
      }
    }

    try {
      if (
        countTask140WebAttempts(runtime.supabaseUrl, attemptKeyHashes) !== 0
      ) {
        errors.push("STAFF_WEB_LOGIN_ATTEMPTS_RESIDUE");
      }
    } catch {
      errors.push("STAFF_WEB_LOGIN_ATTEMPTS_RESIDUE");
    }

    for (const profileId of [shopManagerProfileId, ownerProfileId]) {
      if (!profileId) {
        continue;
      }

      try {
        if (countTask140Profiles(runtime.supabaseUrl, profileId) !== 0) {
          errors.push("PROFILE_RESIDUE");
        }
      } catch {
        errors.push("PROFILE_RESIDUE");
      }
    }

    if (errors.length > 0) {
      throw new Error(`TASK140_FIXTURE_CLEANUP_FAILED:${errors.join(",")}`);
    }
  }

  try {
    const createdUser = await supabase.auth.admin.createUser({
      email: ownerEmail,
      email_confirm: true,
      password: ownerPassword,
    });
    const userId = createdUser.data.user?.id;

    if (createdUser.error || !userId) {
      throw new Error("TASK140_OWNER_AUTH_CREATE_FAILED");
    }

    ownerProfileId = userId;
    const createdShopManager = await supabase.auth.admin.createUser({
      email: shopManagerEmail,
      email_confirm: true,
      password: shopManagerPassword,
    });
    const shopManagerUserId = createdShopManager.data.user?.id;

    if (createdShopManager.error || !shopManagerUserId) {
      throw new Error("TASK140_SHOP_MANAGER_AUTH_CREATE_FAILED");
    }

    shopManagerProfileId = shopManagerUserId;
    shopId = randomUUID();
    const ownerProfileSql = task140SqlUuid(ownerProfileId, "OWNER_PROFILE");
    const shopManagerProfileSql = task140SqlUuid(
      shopManagerProfileId,
      "SHOP_MANAGER_PROFILE",
    );
    const shopIdSql = task140SqlUuid(shopId, "SHOP");
    const ownerDisplayNameSql = task140SqlText(
      `TASK140 Synthetic Owner ${value}`,
      "OWNER_DISPLAY_NAME",
      { maxLength: 128 },
    );
    const shopCodeSql = task140SqlText(shopCode, "SHOP_CODE", {
      maxLength: 32,
      pattern: /^[A-Z0-9_]+$/,
    });

    executeTask140Sql(
      runtime.supabaseUrl,
      "OWNER_PROFILE_CREATE",
      [
        "insert into public.profiles (profile_id, display_name, profile_status)",
        `values (${ownerProfileSql}, ${ownerDisplayNameSql}, 'active')`,
        "on conflict (profile_id) do update set",
        "display_name = excluded.display_name, profile_status = 'active',",
        "disabled_at = null, disabled_by_profile_id = null, updated_at = now()",
      ].join(" "),
    );
    executeTask140Sql(
      runtime.supabaseUrl,
      "SHOP_MANAGER_PROFILE_CREATE",
      [
        "insert into public.profiles (profile_id, display_name, profile_status)",
        `values (${shopManagerProfileSql}, ${task140SqlText(
          `TASK140 Synthetic Shop Manager ${value}`,
          "SHOP_MANAGER_DISPLAY_NAME",
          { maxLength: 128 },
        )}, 'active')`,
        "on conflict (profile_id) do update set",
        "display_name = excluded.display_name, profile_status = 'active',",
        "disabled_at = null, disabled_by_profile_id = null, updated_at = now()",
      ].join(" "),
    );

    executeTask140Sql(
      runtime.supabaseUrl,
      "SHOP_CREATE",
      [
        "insert into public.shops",
        "(shop_id, created_by_profile_id, shop_code, shop_name, shop_status, status_changed_by_profile_id)",
        `values (${shopIdSql}, ${ownerProfileSql}, ${shopCodeSql}, ${task140SqlText(
          `TASK140 Synthetic Shop ${value}`,
          "SHOP_NAME",
          { maxLength: 160 },
        )}, 'active', ${ownerProfileSql})`,
      ].join(" "),
    );

    executeTask140Sql(
      runtime.supabaseUrl,
      "OWNER_MEMBERSHIP_CREATE",
      [
        "insert into public.shop_members",
        "(invited_by_profile_id, membership_status, profile_id, role_key, shop_id)",
        `values (${ownerProfileSql}, 'active', ${ownerProfileSql}, 'shop_owner', ${shopIdSql})`,
      ].join(" "),
    );
    executeTask140Sql(
      runtime.supabaseUrl,
      "SHOP_MANAGER_MEMBERSHIP_CREATE",
      [
        "insert into public.shop_members",
        "(invited_by_profile_id, membership_status, profile_id, role_key, shop_id)",
        `values (${ownerProfileSql}, 'active', ${shopManagerProfileSql}, 'shop_manager', ${shopIdSql})`,
      ].join(" "),
    );
    executeTask140Sql(
      runtime.supabaseUrl,
      "MANAGER_PERMISSION_CREATE",
      [
        "insert into public.staff_role_permissions",
        "(enabled, permission_key, role_key, shop_id, updated_by_profile_id)",
        `values (true, 'staff.read', 'manager', ${shopIdSql}, ${ownerProfileSql}),`,
        `(true, 'staff.write', 'manager', ${shopIdSql}, ${ownerProfileSql})`,
      ].join(" "),
    );
    expectExactPosAdminPermissions(runtime.supabaseUrl, shopId);

    async function insertStaff(input: {
      credentialExpiresAt?: string;
      credentialStatus?: "active" | "locked";
      credentialVersion: number;
      failedAttempts?: number;
      lockedUntil?: string | null;
      pin: string;
      staffCode: string;
      status: "active" | "suspended";
    }): Promise<StaffFixture> {
      const credentialStatus = input.credentialStatus ?? "active";
      const failedAttempts = input.failedAttempts ?? 0;

      if (
        !Number.isInteger(input.credentialVersion) ||
        input.credentialVersion < 1 ||
        (input.credentialExpiresAt !== undefined &&
          !Number.isFinite(Date.parse(input.credentialExpiresAt))) ||
        !Number.isInteger(failedAttempts) ||
        failedAttempts < 0 ||
        !["active", "locked"].includes(credentialStatus) ||
        !["active", "suspended"].includes(input.status)
      ) {
        throw new Error("TASK140_STAFF_FIXTURE_INPUT_INVALID");
      }

      const credentialHash = await hashStaffCredentialForFixture(input.pin);
      const row = queryTask140Json<{
        credential_version: number;
        session_invalidated_at: string | null;
        staff_id: string;
      }>(
        runtime.supabaseUrl,
        `STAFF_${input.staffCode}_CREATE`,
        [
          "insert into public.staff_accounts",
          "(created_by_profile_id, credential_hash, credential_kind, credential_status, credential_updated_at, credential_expires_at, credential_version, display_name, failed_attempts, locked_until, must_change_credential, role_key, session_invalidated_at, shop_id, staff_code, status, updated_by_profile_id)",
          `values (${ownerProfileSql}, ${task140SqlText(
            credentialHash,
            "STAFF_CREDENTIAL_HASH",
            { maxLength: 512 },
          )}, 'pin', ${task140SqlText(credentialStatus, "CREDENTIAL_STATUS", {
            maxLength: 16,
            pattern: /^(active|locked)$/,
          })}, ${task140TimestampLiteral(now)}, ${
            input.credentialExpiresAt
              ? task140TimestampLiteral(input.credentialExpiresAt)
              : "null"
          }, ${input.credentialVersion}, ${task140SqlText(
            `TASK140 ${input.staffCode}`,
            "STAFF_DISPLAY_NAME",
            { maxLength: 160 },
          )}, ${failedAttempts}, ${
            input.lockedUntil
              ? task140TimestampLiteral(input.lockedUntil)
              : "null"
          }, false, 'manager', ${task140TimestampLiteral(
            initialSessionInvalidatedAt,
          )}, ${shopIdSql}, ${task140SqlText(input.staffCode, "STAFF_CODE", {
            maxLength: 32,
            pattern: /^[A-Z0-9_]+$/,
          })}, ${task140SqlText(input.status, "STAFF_STATUS", {
            maxLength: 16,
            pattern: /^(active|suspended)$/,
          })}, ${ownerProfileSql})`,
          "returning json_build_object('credential_version', credential_version, 'session_invalidated_at', session_invalidated_at, 'staff_id', staff_id)",
        ].join(" "),
      );

      if (
        !UUID_PATTERN.test(row.staff_id) ||
        !Number.isInteger(row.credential_version)
      ) {
        throw new Error("TASK140_STAFF_FIXTURE_OUTPUT_INVALID");
      }

      return {
        initialCredentialVersion: row.credential_version,
        initialSessionInvalidatedAt:
          row.session_invalidated_at ?? initialSessionInvalidatedAt,
        pin: input.pin,
        staffCode: input.staffCode,
        staffId: row.staff_id,
      };
    }

    const activeReset = await insertStaff({
      credentialStatus: "locked",
      credentialVersion: 7,
      failedAttempts: 5,
      lockedUntil,
      pin: syntheticNumericCredential(8),
      staffCode: activeResetCode,
      status: "active",
    });
    const concurrentLockout = await insertStaff({
      credentialVersion: 9,
      pin: syntheticNumericCredential(6),
      staffCode: concurrentLockoutCode,
      status: "active",
    });
    const expiring = await insertStaff({
      credentialExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      credentialVersion: 6,
      pin: syntheticNumericCredential(6),
      staffCode: expiringCode,
      status: "active",
    });
    const managerActor = await insertStaff({
      credentialVersion: 5,
      pin: syntheticNumericCredential(6),
      staffCode: managerActorCode,
      status: "active",
    });
    const suspendedReset = await insertStaff({
      credentialStatus: "locked",
      credentialVersion: 11,
      failedAttempts: 5,
      lockedUntil,
      pin: syntheticNumericCredential(5),
      staffCode: suspendedResetCode,
      status: "suspended",
    });
    const legacyFive = await insertStaff({
      credentialVersion: 3,
      pin: syntheticNumericCredential(5),
      staffCode: legacyFiveCode,
      status: "active",
    });
    const legacyEight = await insertStaff({
      credentialVersion: 4,
      pin: syntheticNumericCredential(8),
      staffCode: legacyEightCode,
      status: "active",
    });

    seedTask140WebAttempts(
      runtime.supabaseUrl,
      [
        createStaffCode,
        posAdminCreateStaffCode,
        activeResetCode,
        suspendedResetCode,
      ].map((staffCode) => hashStaffWebAttemptKey(shopCode, staffCode)),
      now,
      lockedUntil,
    );

    return {
      activeReset,
      cleanup,
      concurrentLockout,
      createStaffCode,
      expiring,
      guardedPosAdminCode,
      legacyEight,
      legacyFive,
      managerActor,
      ownerEmail,
      ownerPassword,
      posAdminCreateStaffCode,
      posDeviceIdentifiers,
      shopCode,
      shopId,
      shopManagerEmail,
      shopManagerPassword,
      suspendedReset,
    };
  } catch (error) {
    const setupError =
      error instanceof Error && /^TASK140_[A-Z0-9_]+$/.test(error.message)
        ? error
        : new Error("TASK140_FIXTURE_SETUP_FAILED");

    try {
      await cleanup();
    } catch {
      // Preserve the original redacted setup failure.
    }

    throw setupError;
  }
}

function assertCanonicalGeneratedPin(label: string, value: string) {
  if (!/^\d{6}$/.test(value)) {
    throw new Error(`TASK140_${label}_PIN_FORMAT_INVALID`);
  }
}

function task140UiActionTimeout() {
  return process.env.TEST_TARGET === "staging" ? 60_000 : 20_000;
}

async function closeTask140Context(context: BrowserContext | null) {
  if (!context) {
    return;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const closed = await Promise.race([
    context
      .close()
      .then(() => true)
      .catch(() => false),
    new Promise<boolean>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(false), 10_000);
    }),
  ]);

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  if (!closed) {
    console.info("[task140] WARN bounded browser context close");
  }
}

async function gotoTask140Page(page: Page, url: string) {
  page.setDefaultTimeout(task140UiActionTimeout());
  page.setDefaultNavigationTimeout(task140UiActionTimeout());

  await page.goto(url, {
    timeout: task140UiActionTimeout(),
    waitUntil: "domcontentloaded",
  });

  if ((await page.locator("form").count()) > 0) {
    await waitForTask140FormHydration(page);
  }
}

async function waitForTask140FormHydration(page: Page) {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("form")).some((form) =>
        Object.keys(form).some((key) => key.startsWith("__reactProps$")),
      ),
    undefined,
    { timeout: task140UiActionTimeout() },
  );
}

async function performShopStaffServerAction(
  page: Page,
  action: () => Promise<unknown>,
) {
  await waitForTask140FormHydration(page);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/shop/staff" &&
      Boolean(response.request().headers()["next-action"]),
    { timeout: task140UiActionTimeout() },
  );
  const [response] = await Promise.all([responsePromise, action()]);

  expect(response.status()).toBe(200);
}

function sectionByHeading(page: Page, heading: string) {
  return page.locator("section").filter({
    has: page.getByRole("heading", {
      exact: true,
      level: 2,
      name: heading,
    }),
  });
}

async function signInOwner(page: Page, fixture: Task140Fixture) {
  await gotoTask140Page(page, "/auth/login?next=/shop");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(fixture.ownerEmail);
  await page.getByLabel("Password").fill(fixture.ownerPassword);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/shop", {
      timeout: task140UiActionTimeout(),
    }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function createPinStaffViaUi(
  page: Page,
  fixture: Task140Fixture,
  input: {
    displayName: string;
    roleKey: "manager" | "pos_admin";
    staffCode: string;
  },
) {
  await gotoTask140Page(page, `/shop/staff?shop_id=${fixture.shopId}`);
  const section = sectionByHeading(page, "Create staff");

  await expect(section).toBeVisible();
  await section.getByLabel("Staff code").fill(input.staffCode);
  await section.getByLabel("Display name").fill(input.displayName);
  await section.getByLabel("Credential type").selectOption("pin");
  if (input.roleKey === "pos_admin") {
    await expect(
      section.getByLabel("Role").locator('option[value="pos_admin"]'),
    ).toHaveCount(1);
  }
  await section.getByLabel("Role").selectOption(input.roleKey);
  await performShopStaffServerAction(page, () =>
    section.getByRole("button", { name: "Create staff" }).click(),
  );

  const actionResult = section.getByTestId("staff-create-result");
  const oneTimeValue = section.locator("code");

  await expect(actionResult).toHaveAttribute("role", "status", {
    timeout: task140UiActionTimeout(),
  });
  await oneTimeValue.waitFor({
    state: "visible",
    timeout: task140UiActionTimeout(),
  });
  await expect(section).toContainText(
    `Target: ${input.staffCode} · ${input.displayName}`,
  );
  const pin = (await oneTimeValue.textContent())?.trim() ?? "";

  assertCanonicalGeneratedPin("CREATE", pin);

  return pin;
}

async function resetPinViaUi(
  page: Page,
  runtime: ReadyRuntime,
  fixture: Task140Fixture,
  staffCode: string,
  reasonLabel: string,
) {
  const initialState = loadStaffStateByCode(
    runtime.supabaseUrl,
    fixture.shopId,
    staffCode,
  );
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await gotoTask140Page(page, `/shop/staff?shop_id=${fixture.shopId}`);
      const managementCard = page.getByTestId("staff-management-card");
      const search = managementCard.getByTestId("staff-target-search");
      const resetForm = managementCard.getByTestId(
        "reset-staff-credential-form",
      );

      await expect(managementCard).toBeVisible();
      await search.fill(staffCode);
      const option = managementCard
        .getByTestId("staff-target-option")
        .filter({ hasText: staffCode })
        .first();

      await expect(option).toBeVisible();
      await option.getByTestId("staff-target-select-button").click();
      await expect(resetForm).toContainText(`Target: ${staffCode}`);
      await resetForm
        .locator('select[name="credentialKind"]')
        .selectOption("pin");
      await resetForm
        .locator('input[name="reason"]')
        .fill(`TASK140 ${reasonLabel}`);
      await resetForm.locator('input[name="confirmation"]').fill("RESET");
      await performShopStaffServerAction(page, () =>
        resetForm.getByRole("button", { name: "Reset credential" }).click(),
      );

      const actionResult = page.getByTestId("staff-reset-result");
      const oneTimeValue = page
        .getByTestId("staff-reset-temporary-credential")
        .locator("code");

      await expect(actionResult).toHaveAttribute("role", "status", {
        timeout: task140UiActionTimeout(),
      });
      await oneTimeValue.waitFor({
        state: "visible",
        timeout: task140UiActionTimeout(),
      });
      await expect(
        page.getByTestId("staff-reset-temporary-credential"),
      ).toContainText(`Target: ${staffCode}`);
      const pin = (await oneTimeValue.textContent())?.trim() ?? "";

      assertCanonicalGeneratedPin(reasonLabel, pin);

      return pin;
    } catch (error) {
      lastError = error;
      const observedState = loadStaffStateByCode(
        runtime.supabaseUrl,
        fixture.shopId,
        staffCode,
      );

      if (
        observedState.credential_version !== initialState.credential_version
      ) {
        throw new Error("TASK140_RESET_COMMITTED_WITHOUT_UI_RESULT");
      }

      if (attempt === 1) {
        console.info("[task140] WARN retrying uncommitted UI reset");
      }
    }
  }

  throw lastError;
}

async function expectStaffManagerProtectedActionsHidden(
  page: Page,
  fixture: Task140Fixture,
  staffCode: string,
) {
  await gotoTask140Page(page, `/shop/staff?shop_id=${fixture.shopId}`);
  const managementCard = page.getByTestId("staff-management-card");
  const search = managementCard.getByTestId("staff-target-search");

  await expect(managementCard).toBeVisible();
  await search.fill(staffCode);
  const option = managementCard
    .getByTestId("staff-target-option")
    .filter({ hasText: staffCode })
    .first();

  await expect(option).toHaveCount(0);
}

async function expectOwnerOnlySharedRoleControlsHidden(
  page: Page,
  fixture: Task140Fixture,
) {
  await gotoTask140Page(page, `/shop/staff?shop_id=${fixture.shopId}`);
  const advanced = page.getByTestId("staff-role-permissions-advanced");

  await expect(advanced).toBeVisible();
  await advanced.locator("summary").click();
  await expect(
    advanced.locator('select[name="roleKey"] option[value="pos_admin"]'),
  ).toHaveCount(0);
  await expect(
    advanced.locator('input[name="templateKey"][value="shop_manager_full"]'),
  ).toHaveCount(0);

  for (const permission of [
    "shop_admin.full_access",
    "devices.write",
    "settings.write",
  ]) {
    await expect(
      advanced.locator(`input[name="permissions"][value="${permission}"]`),
    ).toHaveCount(0);
  }

  await expect(
    advanced.locator('input[name="templateKey"][value="staff_manager"]'),
  ).toHaveCount(1);
  await expect(
    advanced.locator('input[name="permissions"][value="staff.write"]'),
  ).toHaveCount(1);
}

async function expectResetCredentialBoundToSelectedTarget(
  page: Page,
  expectedTargetCode: string,
  otherTargetCode: string,
) {
  const managementCard = page.getByTestId("staff-management-card");
  const search = managementCard.getByTestId("staff-target-search");

  await search.fill(otherTargetCode);
  const otherOption = managementCard
    .getByTestId("staff-target-option")
    .filter({ hasText: otherTargetCode })
    .first();
  await expect(otherOption).toBeVisible();
  await otherOption.getByTestId("staff-target-select-button").click();
  await expect(
    page.getByTestId("staff-reset-temporary-credential"),
  ).toHaveCount(0);

  await search.fill(expectedTargetCode);
  const expectedOption = managementCard
    .getByTestId("staff-target-option")
    .filter({ hasText: expectedTargetCode })
    .first();
  await expect(expectedOption).toBeVisible();
  await expectedOption.getByTestId("staff-target-select-button").click();
  await expect(
    page.getByTestId("staff-reset-temporary-credential"),
  ).toContainText(`Target: ${expectedTargetCode}`);
}

async function suspendThenResetSelectedStaffViaUi(
  page: Page,
  fixture: Task140Fixture,
  staff: Pick<StaffState, "staff_id"> & { staff_code: string },
) {
  await gotoTask140Page(page, `/shop/staff?shop_id=${fixture.shopId}`);
  const managementCard = page.getByTestId("staff-management-card");
  const search = managementCard.getByTestId("staff-target-search");

  await expect(managementCard).toBeVisible();
  await search.fill(staff.staff_code);
  const option = managementCard
    .getByTestId("staff-target-option")
    .filter({ hasText: staff.staff_code })
    .first();

  await expect(option).toBeVisible();
  await option.getByTestId("staff-target-select-button").click();
  await managementCard
    .getByRole("button", { exact: true, name: "Staff status" })
    .click();

  const suspendForm = managementCard.locator("form").filter({
    has: page.getByRole("button", { exact: true, name: "Suspend" }),
  });

  await expect(suspendForm).toHaveCount(1);
  await expect(suspendForm.locator('input[name="staffId"]')).toHaveValue(
    staff.staff_id,
  );
  await suspendForm
    .locator('input[name="reason"]')
    .fill("TASK140 suspended reset selection preservation");
  await suspendForm.locator('input[name="confirmation"]').fill("SUSPEND");
  const selectedUrl = page.url();
  await performShopStaffServerAction(page, () =>
    suspendForm.getByRole("button", { name: "Suspend" }).click(),
  );

  await expect(page.getByTestId("staff-suspend-result")).toBeVisible({
    timeout: task140UiActionTimeout(),
  });
  await expect(page).toHaveURL(selectedUrl);
  const selectedSummary = managementCard.getByTestId("selected-staff-summary");
  await expect(selectedSummary).toContainText(staff.staff_code);
  await expect(selectedSummary).toContainText("Suspended");

  await managementCard
    .getByRole("button", { exact: true, name: "Credentials" })
    .click();
  const resetForm = managementCard.getByTestId("reset-staff-credential-form");
  const credentialKind = resetForm.locator('select[name="credentialKind"]');
  const reason = resetForm.locator('input[name="reason"]');
  const confirmation = resetForm.locator('input[name="confirmation"]');
  const resetButton = resetForm.getByRole("button", {
    name: "Reset credential",
  });

  await expect(resetForm).toContainText(`Target: ${staff.staff_code}`);
  await expect(resetForm.locator('input[name="staffId"]')).toHaveValue(
    staff.staff_id,
  );
  await expect(credentialKind).toBeEnabled();
  await expect(reason).toBeEnabled();
  await expect(confirmation).toBeEnabled();
  await expect(resetButton).toBeEnabled();
  await credentialKind.selectOption("pin");
  await reason.fill("TASK140 reset while suspended");
  await confirmation.fill("RESET");
  await performShopStaffServerAction(page, () => resetButton.click());

  const oneTimeValue = page
    .getByTestId("staff-reset-temporary-credential")
    .locator("code");

  await oneTimeValue.waitFor({
    state: "visible",
    timeout: task140UiActionTimeout(),
  });
  await expect(
    page.getByTestId("staff-reset-temporary-credential"),
  ).toContainText(`Target: ${staff.staff_code}`);
  const pin = (await oneTimeValue.textContent())?.trim() ?? "";

  assertCanonicalGeneratedPin("SUSPENDED_UI_RESET", pin);

  return pin;
}

async function reactivateSelectedStaffViaUi(page: Page, staffId: string) {
  const managementCard = page.getByTestId("staff-management-card");

  await managementCard
    .getByRole("button", { exact: true, name: "Staff status" })
    .click();
  const reactivateForm = managementCard.locator("form").filter({
    has: page.getByRole("button", { exact: true, name: "Reactivate" }),
  });

  await expect(reactivateForm).toHaveCount(1);
  await expect(reactivateForm.locator('input[name="staffId"]')).toHaveValue(
    staffId,
  );
  await reactivateForm
    .locator('input[name="reason"]')
    .fill("TASK140 reactivate after suspended reset");
  await reactivateForm.locator('input[name="confirmation"]').fill("REACTIVATE");
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/shop/staff" &&
        url.searchParams.get("action") === "success",
      { timeout: task140UiActionTimeout() },
    ),
    reactivateForm.getByRole("button", { name: "Reactivate" }).click(),
  ]);
}

function loadStaffState(expectedSupabaseUrl: string, staffId: string) {
  const staffIdSql = task140SqlUuid(staffId, "STAFF_STATE");

  return queryTask140Json<StaffState>(
    expectedSupabaseUrl,
    "STAFF_POST_STATE_READ",
    [
      "select json_build_object(",
      "'credential_kind', credential_kind, 'credential_status', credential_status,",
      "'credential_version', credential_version, 'failed_attempts', failed_attempts,",
      "'locked_until', locked_until, 'must_change_credential', must_change_credential,",
      "'role_key', role_key, 'session_invalidated_at', session_invalidated_at,",
      "'staff_id', staff_id, 'status', status",
      `) from public.staff_accounts where staff_id = ${staffIdSql}`,
    ].join(" "),
  );
}

function loadStaffStateByCode(
  expectedSupabaseUrl: string,
  shopId: string,
  staffCode: string,
) {
  return queryTask140Json<StaffState>(
    expectedSupabaseUrl,
    "STAFF_POST_STATE_READ_BY_CODE",
    [
      "select json_build_object(",
      "'credential_kind', credential_kind, 'credential_status', credential_status,",
      "'credential_version', credential_version, 'failed_attempts', failed_attempts,",
      "'locked_until', locked_until, 'must_change_credential', must_change_credential,",
      "'role_key', role_key, 'session_invalidated_at', session_invalidated_at,",
      "'staff_id', staff_id, 'status', status",
      ") from public.staff_accounts",
      `where shop_id = ${task140SqlUuid(shopId, "STAFF_STATE_SHOP")}`,
      `and staff_code = ${task140SqlText(staffCode, "STAFF_STATE_CODE", {
        maxLength: 32,
        pattern: /^[A-Z0-9_]+$/,
      })}`,
    ].join(" "),
  );
}

function loadActiveStaffWebSessionId(
  expectedSupabaseUrl: string,
  shopId: string,
  staffId: string,
) {
  const state = queryTask140Json<{ staff_web_session_id: string }>(
    expectedSupabaseUrl,
    "STAFF_WEB_SESSION_READ",
    [
      "select json_build_object('staff_web_session_id', staff_web_session_id)",
      "from public.staff_web_sessions",
      `where shop_id = ${task140SqlUuid(shopId, "STAFF_WEB_SESSION_SHOP")}`,
      `and staff_id = ${task140SqlUuid(staffId, "STAFF_WEB_SESSION_STAFF")}`,
      "and status = 'active' and revoked_at is null and expires_at > now()",
      "order by issued_at desc limit 1",
    ].join(" "),
  );

  if (!UUID_PATTERN.test(state.staff_web_session_id)) {
    throw new Error("TASK140_STAFF_WEB_SESSION_ID_INVALID");
  }

  return state.staff_web_session_id;
}

function loadActiveStaffWebSessionIdByCode(
  expectedSupabaseUrl: string,
  shopCode: string,
  staffCode: string,
) {
  const state = queryTask140Json<{ staff_web_session_id: string }>(
    expectedSupabaseUrl,
    "STAFF_WEB_SESSION_READ_BY_CODE",
    [
      "select json_build_object(",
      "'staff_web_session_id', session.staff_web_session_id)",
      "from public.staff_web_sessions session",
      "join public.staff_accounts staff on staff.staff_id = session.staff_id",
      "join public.shops shop on shop.shop_id = session.shop_id",
      `where shop.shop_code = ${task140SqlText(
        shopCode,
        "STAFF_WEB_SESSION_SHOP_CODE",
        { maxLength: 32, pattern: /^[A-Z0-9_-]+$/ },
      )}`,
      `and staff.staff_code = ${task140SqlText(
        staffCode,
        "STAFF_WEB_SESSION_STAFF_CODE",
        { maxLength: 32, pattern: /^[A-Z0-9_]+$/ },
      )}`,
      "and session.status = 'active' and session.revoked_at is null",
      "and session.expires_at > now()",
      "order by session.issued_at desc limit 1",
    ].join(" "),
  );

  if (!UUID_PATTERN.test(state.staff_web_session_id)) {
    throw new Error("TASK140_STAFF_WEB_SESSION_ID_BY_CODE_INVALID");
  }

  return state.staff_web_session_id;
}

function expectExactPosAdminPermissions(
  expectedSupabaseUrl: string,
  shopId: string,
) {
  const state = queryTask140Json<{ permission_keys: string[] }>(
    expectedSupabaseUrl,
    "POS_ADMIN_PERMISSION_READ",
    [
      "select json_build_object(",
      "'permission_keys', coalesce(",
      "json_agg(permission_key order by permission_key) filter (where enabled),",
      "'[]'::json",
      ")) from public.staff_role_permissions",
      `where shop_id = ${task140SqlUuid(shopId, "POS_ADMIN_PERMISSION_SHOP")}`,
      "and role_key = 'pos_admin'",
    ].join(" "),
  );

  expect(state.permission_keys).toEqual(EXPECTED_POS_ADMIN_PERMISSION_KEYS);
}

function expectUnauthorizedShopAdminResult(value: unknown, label: string) {
  const result = recordValue(value);

  if (result?.ok !== false || result.code !== "unauthorized") {
    throw new Error(`TASK140_${label}_OWNER_GUARD_FAILED`);
  }
}

async function assertShopManagerCannotManagePosAdmin(
  runtime: ReadyRuntime,
  fixture: Task140Fixture,
  posAdmin: StaffState,
) {
  const shopManagerClient = createClient<Database>(
    runtime.supabaseUrl,
    runtime.publishableKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  let authenticated = false;

  try {
    const signedIn = await shopManagerClient.auth.signInWithPassword({
      email: fixture.shopManagerEmail,
      password: fixture.shopManagerPassword,
    });

    if (signedIn.error || !signedIn.data.session) {
      throw new Error("TASK140_SHOP_MANAGER_GUARD_LOGIN_FAILED");
    }
    authenticated = true;

    const createAttempt = await shopManagerClient.rpc("shop_staff_create", {
      p_credential_hash: await hashStaffCredentialForFixture(
        syntheticNumericCredential(6),
      ),
      p_credential_kind: "pin",
      p_display_name: "TASK140 Guarded POS Admin",
      p_role_key: "pos_admin",
      p_shop_id: fixture.shopId,
      p_staff_code: fixture.guardedPosAdminCode,
    });

    if (createAttempt.error) {
      throw new Error("TASK140_POS_ADMIN_CREATE_GUARD_RPC_FAILED");
    }

    expectUnauthorizedShopAdminResult(createAttempt.data, "POS_ADMIN_CREATE");

    const guardedStaffCount = countTask140Sql(
      runtime.supabaseUrl,
      "POS_ADMIN_CREATE_GUARD_COUNT",
      [
        "select count(*) from public.staff_accounts",
        `where shop_id = ${task140SqlUuid(fixture.shopId, "GUARD_SHOP")}`,
        `and staff_code = ${task140SqlText(
          fixture.guardedPosAdminCode,
          "GUARD_STAFF_CODE",
          { maxLength: 32, pattern: /^[A-Z0-9_]+$/ },
        )}`,
      ].join(" "),
    );

    if (guardedStaffCount !== 0) {
      throw new Error("TASK140_POS_ADMIN_CREATE_GUARD_INSERTED_STAFF");
    }

    const resetAttempt = await shopManagerClient.rpc(
      "shop_staff_reset_credential",
      {
        p_credential_hash: await hashStaffCredentialForFixture(
          syntheticNumericCredential(6),
        ),
        p_credential_kind: "pin",
        p_reason: "TASK140 shop manager POS Admin guard acceptance",
        p_shop_id: fixture.shopId,
        p_staff_id: posAdmin.staff_id,
      },
    );

    if (resetAttempt.error) {
      throw new Error("TASK140_POS_ADMIN_RESET_GUARD_RPC_FAILED");
    }

    expectUnauthorizedShopAdminResult(resetAttempt.data, "POS_ADMIN_RESET");

    const unchangedPosAdmin = loadStaffState(
      runtime.supabaseUrl,
      posAdmin.staff_id,
    );

    expect(unchangedPosAdmin.credential_version).toBe(
      posAdmin.credential_version,
    );
    expect(unchangedPosAdmin.session_invalidated_at).toBe(
      posAdmin.session_invalidated_at,
    );
    expect(unchangedPosAdmin.role_key).toBe("pos_admin");
  } finally {
    if (authenticated) {
      const signedOut = await shopManagerClient.auth.signOut();

      if (signedOut.error) {
        throw new Error("TASK140_SHOP_MANAGER_GUARD_LOGOUT_FAILED");
      }
    }
  }
}

async function assertStaffManagerRpcCannotManagePosAdmin(
  runtime: ReadyRuntime,
  fixture: Task140Fixture,
  posAdmin: StaffState,
  actorStaffWebSessionId: string,
) {
  const supabase = createClient<Database>(
    runtime.supabaseUrl,
    runtime.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const before = loadStaffState(runtime.supabaseUrl, posAdmin.staff_id);
  const resetAttempt = await supabase.rpc("shop_staff_mutate_as_staff_web", {
    p_action: "reset_credential",
    p_actor_staff_id: fixture.managerActor.staffId,
    p_actor_staff_web_session_id: actorStaffWebSessionId,
    p_credential_expires_at: null,
    p_credential_hash: await hashStaffCredentialForFixture(
      syntheticNumericCredential(6),
    ),
    p_credential_kind: "pin",
    p_display_name: null,
    p_reason: "TASK140 staff RPC protected reset guard",
    p_role_key: null,
    p_shop_id: fixture.shopId,
    p_staff_code: null,
    p_target_staff_id: posAdmin.staff_id,
  });

  if (resetAttempt.error) {
    throw new Error("TASK140_STAFF_RPC_POS_ADMIN_RESET_FAILED");
  }

  expectUnauthorizedShopAdminResult(
    resetAttempt.data,
    "STAFF_RPC_POS_ADMIN_RESET",
  );

  const lifecycleAttempt = await supabase.rpc(
    "shop_staff_lifecycle_as_staff_web",
    {
      p_action: "suspend",
      p_actor_staff_id: fixture.managerActor.staffId,
      p_actor_staff_web_session_id: actorStaffWebSessionId,
      p_reason: "TASK140 staff RPC protected lifecycle guard",
      p_shop_id: fixture.shopId,
      p_target_staff_id: posAdmin.staff_id,
    },
  );

  if (lifecycleAttempt.error) {
    throw new Error("TASK140_STAFF_RPC_POS_ADMIN_LIFECYCLE_FAILED");
  }

  expectUnauthorizedShopAdminResult(
    lifecycleAttempt.data,
    "STAFF_RPC_POS_ADMIN_LIFECYCLE",
  );

  const after = loadStaffState(runtime.supabaseUrl, posAdmin.staff_id);

  expect(after.credential_version).toBe(before.credential_version);
  expect(after.session_invalidated_at).toBe(before.session_invalidated_at);
  expect(after.status).toBe(before.status);
  expect(after.role_key).toBe("pos_admin");
}

async function expectCredentialResetState(
  expectedSupabaseUrl: string,
  fixture: StaffFixture,
  expectedStatus: "active" | "suspended",
) {
  const state = loadStaffState(expectedSupabaseUrl, fixture.staffId);

  expect(state.status).toBe(expectedStatus);
  expect(state.credential_kind).toBe("pin");
  expect(state.credential_status).toBe("active");
  expect(state.must_change_credential).toBe(false);
  expect(state.credential_version).toBe(fixture.initialCredentialVersion + 1);
  expect(state.failed_attempts).toBe(0);
  expect(state.locked_until).toBeNull();

  if (
    !state.session_invalidated_at ||
    Date.parse(state.session_invalidated_at) <=
      Date.parse(fixture.initialSessionInvalidatedAt)
  ) {
    throw new Error("TASK140_SESSION_INVALIDATION_NOT_ADVANCED");
  }
}

function expectWebAttemptCleared(
  expectedSupabaseUrl: string,
  shopCode: string,
  staffCode: string,
) {
  const allowlist = task140AttemptHashAllowlist([
    hashStaffWebAttemptKey(shopCode, staffCode),
  ]);
  const clearedCount = countTask140Sql(
    expectedSupabaseUrl,
    "WEB_ATTEMPT_CLEARED_COUNT",
    [
      "select count(*) from public.staff_web_login_attempts",
      `where attempt_key_hash in (${allowlist})`,
      "and failed_attempts = 0 and locked_until is null",
    ].join(" "),
  );

  if (clearedCount !== 1) {
    throw new Error("TASK140_WEB_ATTEMPT_POST_STATE_INVALID");
  }
}

async function expectAtomicConcurrentLockout(
  runtime: ReadyRuntime,
  fixture: Task140Fixture,
) {
  const supabase = createClient<Database>(
    runtime.supabaseUrl,
    runtime.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const target = fixture.concurrentLockout;
  const shopCodeArgs = {
    p_channel: "shop_code",
    p_expected_credential_version: target.initialCredentialVersion,
    p_metadata_redacted: { source: "TASK-140 E2E concurrent Shop Code" },
    p_shop_code: fixture.shopCode,
    p_shop_id: fixture.shopId,
    p_staff_code: target.staffCode,
    p_staff_id: target.staffId,
  };
  const shopCodeResults = await Promise.all(
    Array.from({ length: 5 }, () =>
      supabase.rpc("staff_record_login_failure", shopCodeArgs),
    ),
  );

  if (
    shopCodeResults.some(
      (result) => result.error || recordValue(result.data)?.ok !== true,
    )
  ) {
    throw new Error("TASK140_CONCURRENT_SHOP_CODE_RPC_FAILED");
  }

  const shopCodeStaffState = loadStaffState(
    runtime.supabaseUrl,
    target.staffId,
  );
  const webState = queryTask140Json<{
    failed_attempts: number;
    locked: boolean;
  }>(
    runtime.supabaseUrl,
    "CONCURRENT_SHOP_CODE_STATE",
    [
      "select json_build_object(",
      "'failed_attempts', failed_attempts,",
      "'locked', locked_until > now()",
      ") from public.staff_web_login_attempts",
      `where attempt_key_hash = ${task140SqlText(
        hashStaffWebAttemptKey(fixture.shopCode, target.staffCode),
        "CONCURRENT_ATTEMPT_HASH",
        { maxLength: 80, pattern: /^sha256:[0-9a-f]{64}$/ },
      )}`,
    ].join(" "),
  );

  expect(shopCodeStaffState.failed_attempts).toBe(5);
  expect(shopCodeStaffState.credential_status).toBe("locked");
  expect(Date.parse(shopCodeStaffState.locked_until ?? "")).toBeGreaterThan(
    Date.now(),
  );
  expect(webState).toEqual({ failed_attempts: 5, locked: true });

  executeTask140Sql(
    runtime.supabaseUrl,
    "CONCURRENT_RESET_TRANSITION",
    [
      "update public.staff_accounts set",
      `credential_version = ${target.initialCredentialVersion + 1},`,
      "credential_status = 'active', failed_attempts = 0, locked_until = null,",
      "session_invalidated_at = now(), updated_at = now()",
      `where staff_id = ${task140SqlUuid(target.staffId, "CONCURRENT_STAFF")}`,
      `and credential_version = ${target.initialCredentialVersion}`,
      "; delete from public.staff_web_login_attempts",
      `where attempt_key_hash = ${task140SqlText(
        hashStaffWebAttemptKey(fixture.shopCode, target.staffCode),
        "CONCURRENT_RESET_ATTEMPT_HASH",
        { maxLength: 80, pattern: /^sha256:[0-9a-f]{64}$/ },
      )}`,
    ].join(" "),
  );

  const staleResult = await supabase.rpc("staff_record_login_failure", {
    ...shopCodeArgs,
    p_metadata_redacted: { source: "TASK-140 E2E stale Shop Code" },
  });

  if (
    staleResult.error ||
    recordValue(staleResult.data)?.code !== "stale_or_ineligible"
  ) {
    throw new Error("TASK140_STALE_FAILURE_NOT_REJECTED");
  }

  const resetState = loadStaffState(runtime.supabaseUrl, target.staffId);
  expect(resetState.credential_version).toBe(
    target.initialCredentialVersion + 1,
  );
  expect(resetState.credential_status).toBe("active");
  expect(resetState.failed_attempts).toBe(0);
  expect(resetState.locked_until).toBeNull();
  expect(
    countTask140WebAttempts(runtime.supabaseUrl, [
      hashStaffWebAttemptKey(fixture.shopCode, target.staffCode),
    ]),
  ).toBe(0);

  const posResults = await Promise.all(
    Array.from({ length: 5 }, () =>
      supabase.rpc("staff_record_login_failure", {
        p_channel: "pos",
        p_expected_credential_version: target.initialCredentialVersion + 1,
        p_metadata_redacted: { source: "TASK-140 E2E concurrent POS" },
        p_shop_code: null,
        p_shop_id: fixture.shopId,
        p_staff_code: null,
        p_staff_id: target.staffId,
      }),
    ),
  );

  if (
    posResults.some(
      (result) => result.error || recordValue(result.data)?.ok !== true,
    )
  ) {
    throw new Error("TASK140_CONCURRENT_POS_RPC_FAILED");
  }

  const posStaffState = loadStaffState(runtime.supabaseUrl, target.staffId);
  expect(posStaffState.failed_attempts).toBe(5);
  expect(posStaffState.credential_status).toBe("locked");
  expect(Date.parse(posStaffState.locked_until ?? "")).toBeGreaterThan(
    Date.now(),
  );
  expect(
    countTask140WebAttempts(runtime.supabaseUrl, [
      hashStaffWebAttemptKey(fixture.shopCode, target.staffCode),
    ]),
  ).toBe(0);
}

async function openShopCodeLogin(browser: Browser, appBaseUrl: string) {
  const context = await browser.newContext({
    baseURL: appBaseUrl,
    locale: "en-US",
  });
  const page = await context.newPage();

  await gotoTask140Page(page, "/auth/login?next=/shop&mode=shop-code");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin Console sign in" }),
  ).toBeVisible();

  return { context, page };
}

async function expectShopCodeLoginBlockedWhileSuspended(
  browser: Browser,
  runtime: ReadyRuntime,
  input: {
    credential: string;
    shopCode: string;
    staffCode: string;
  },
) {
  const { context, page } = await openShopCodeLogin(
    browser,
    runtime.appBaseUrl,
  );

  try {
    await page.getByRole("textbox", { name: "Shop code" }).fill(input.shopCode);
    await page
      .getByRole("textbox", { name: "Staff code" })
      .fill(input.staffCode);
    await page.getByLabel("PIN / password").fill(input.credential);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText(
        "Sign-in was blocked. Check the credentials or try again later.",
      ),
    ).toBeVisible({ timeout: task140UiActionTimeout() });
    await expect(page).toHaveURL((url) => url.pathname === "/auth/login");
    await expect(page.getByLabel("PIN / password")).toHaveValue("");
  } finally {
    await closeTask140Context(context);
  }
}

async function expectShopCodeLockExpiry(
  browser: Browser,
  runtime: ReadyRuntime,
  fixture: Task140Fixture,
) {
  const target = fixture.concurrentLockout;
  const attemptHash = hashStaffWebAttemptKey(
    fixture.shopCode,
    target.staffCode,
  );
  const staffIdSql = task140SqlUuid(target.staffId, "LOCK_EXPIRY_STAFF");
  const futureLock = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const elapsedLock = new Date(Date.now() - 60 * 1000).toISOString();

  executeTask140Sql(
    runtime.supabaseUrl,
    "LOCK_EXPIRY_SESSION_PRECONDITION",
    [
      "update public.staff_accounts set credential_status = 'active',",
      "failed_attempts = 0, locked_until = null, updated_at = now()",
      `where staff_id = ${staffIdSql}`,
      `and credential_version = ${target.initialCredentialVersion + 1}`,
    ].join(" "),
  );
  purgeTask140WebAttempts(runtime.supabaseUrl, [attemptHash]);

  const { context, page } = await openShopCodeLogin(
    browser,
    runtime.appBaseUrl,
  );

  try {
    await page
      .getByRole("textbox", { name: "Shop code" })
      .fill(fixture.shopCode);
    await page
      .getByRole("textbox", { name: "Staff code" })
      .fill(target.staffCode);
    await page.getByLabel("PIN / password").fill(target.pin);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/shop", {
        timeout: task140UiActionTimeout(),
      }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    const invalidatedSessionId = loadActiveStaffWebSessionId(
      runtime.supabaseUrl,
      fixture.shopId,
      target.staffId,
    );

    executeTask140Sql(
      runtime.supabaseUrl,
      "LOCK_EXPIRY_FUTURE_STAFF_LOCK",
      [
        "update public.staff_accounts set credential_status = 'locked',",
        `failed_attempts = 5, locked_until = ${task140TimestampLiteral(futureLock)},`,
        "updated_at = now()",
        `where staff_id = ${staffIdSql}`,
        `and credential_version = ${target.initialCredentialVersion + 1}`,
      ].join(" "),
    );
    seedTask140WebAttempts(
      runtime.supabaseUrl,
      [attemptHash],
      new Date(Date.now() - 60 * 1000).toISOString(),
      futureLock,
    );

    await gotoTask140Page(page, "/shop");
    await expect(page).toHaveURL((url) => url.pathname === "/shop");
    await expect(
      page.getByRole("heading", { level: 1, name: /access required/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Shop Overview" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Shop sections" }),
    ).toHaveCount(0);
    await expectShopCodeLoginBlockedWhileSuspended(browser, runtime, {
      credential: target.pin,
      shopCode: fixture.shopCode,
      staffCode: target.staffCode,
    });

    executeTask140Sql(
      runtime.supabaseUrl,
      "LOCK_EXPIRY_ELAPSED_STAFF_LOCK",
      [
        `update public.staff_accounts set locked_until = ${task140TimestampLiteral(elapsedLock)},`,
        "updated_at = now()",
        `where staff_id = ${staffIdSql}`,
        "and credential_status = 'locked' and failed_attempts = 5",
      ].join(" "),
    );
    seedTask140WebAttempts(
      runtime.supabaseUrl,
      [attemptHash],
      new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      elapsedLock,
    );

    await gotoTask140Page(page, "/shop");
    await expect(
      page.getByRole("heading", { level: 1, name: /access required/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Shop Overview" }),
    ).toHaveCount(0);
    const elapsedSessionState = loadStaffState(
      runtime.supabaseUrl,
      target.staffId,
    );
    expect(elapsedSessionState.credential_status).toBe("locked");
    expect(
      Date.parse(elapsedSessionState.locked_until ?? ""),
    ).toBeLessThanOrEqual(Date.now());

    const replacementSessionId = await loginShopCodeSuccessfully(
      browser,
      runtime,
      {
        credential: target.pin,
        shopCode: fixture.shopCode,
        staffCode: target.staffCode,
      },
    );
    expect(replacementSessionId).not.toBe(invalidatedSessionId);
    await gotoTask140Page(page, "/shop");
    await expect(
      page.getByRole("heading", { level: 1, name: /access required/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Shop Overview" }),
    ).toHaveCount(0);
    const normalizedState = loadStaffState(runtime.supabaseUrl, target.staffId);
    expect(normalizedState.credential_status).toBe("active");
    expect(normalizedState.failed_attempts).toBe(0);
    expect(normalizedState.locked_until).toBeNull();
    await expectWebAttemptCleared(
      runtime.supabaseUrl,
      fixture.shopCode,
      target.staffCode,
    );

    executeTask140IdempotentSql(
      runtime.supabaseUrl,
      "LOCK_EXPIRY_NO_DEADLINE",
      [
        "update public.staff_accounts set credential_status = 'locked',",
        "failed_attempts = 5, locked_until = null, updated_at = now()",
        `where staff_id = ${staffIdSql}`,
        `and credential_version = ${target.initialCredentialVersion + 1}`,
        "; update public.staff_web_login_attempts set failed_attempts = 0,",
        "locked_until = null, updated_at = now()",
        `where attempt_key_hash = ${task140SqlText(
          attemptHash,
          "LOCK_EXPIRY_ATTEMPT_HASH",
          { maxLength: 80, pattern: /^sha256:[0-9a-f]{64}$/ },
        )}`,
      ].join(" "),
    );
    await expectShopCodeLoginBlockedWhileSuspended(browser, runtime, {
      credential: target.pin,
      shopCode: fixture.shopCode,
      staffCode: target.staffCode,
    });

    const noDeadlineState = loadStaffState(runtime.supabaseUrl, target.staffId);
    expect(noDeadlineState.credential_status).toBe("locked");
    expect(noDeadlineState.failed_attempts).toBe(5);
    expect(noDeadlineState.locked_until).toBeNull();
    const noDeadlineWebState = queryTask140Json<{
      failed_attempts: number;
      locked_until: string | null;
    }>(
      runtime.supabaseUrl,
      "LOCK_EXPIRY_NO_DEADLINE_STATE",
      [
        "select json_build_object('failed_attempts', failed_attempts,",
        "'locked_until', locked_until)",
        "from public.staff_web_login_attempts",
        `where attempt_key_hash = ${task140SqlText(
          attemptHash,
          "LOCK_EXPIRY_STATE_HASH",
          { maxLength: 80, pattern: /^sha256:[0-9a-f]{64}$/ },
        )}`,
      ].join(" "),
    );
    expect(noDeadlineWebState).toEqual({
      failed_attempts: 0,
      locked_until: null,
    });
  } finally {
    await closeTask140Context(context);
  }
}

async function signInStaffManager(
  browser: Browser,
  runtime: ReadyRuntime,
  fixture: Task140Fixture,
) {
  const managerReadyCount = countTask140Sql(
    runtime.supabaseUrl,
    "MANAGER_ACTOR_PRECONDITION",
    [
      "select count(*) from public.staff_accounts staff",
      `where staff.staff_id = ${task140SqlUuid(
        fixture.managerActor.staffId,
        "MANAGER_ACTOR",
      )}`,
      `and staff.shop_id = ${task140SqlUuid(fixture.shopId, "MANAGER_SHOP")}`,
      "and staff.role_key = 'manager'",
      "and staff.status = 'active' and staff.credential_status = 'active'",
      "and exists (select 1 from public.staff_role_permissions permission",
      "where permission.shop_id = staff.shop_id",
      "and permission.role_key = staff.role_key",
      "and permission.permission_key = 'staff.read'",
      "and permission.enabled = true)",
      "and exists (select 1 from public.staff_role_permissions permission",
      "where permission.shop_id = staff.shop_id",
      "and permission.role_key = staff.role_key",
      "and permission.permission_key = 'staff.write'",
      "and permission.enabled = true)",
    ].join(" "),
  );

  if (managerReadyCount !== 1) {
    throw new Error("TASK140_MANAGER_ACTOR_PRECONDITION_INVALID");
  }

  const { context, page } = await openShopCodeLogin(
    browser,
    runtime.appBaseUrl,
  );

  try {
    await page
      .getByRole("textbox", { name: "Shop code" })
      .fill(fixture.shopCode);
    await page
      .getByRole("textbox", { name: "Staff code" })
      .fill(fixture.managerActor.staffCode);
    await page.getByLabel("PIN / password").fill(fixture.managerActor.pin);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/shop", {
        timeout: task140UiActionTimeout(),
      }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    await expect(
      page.getByRole("heading", { level: 1, name: "Shop Overview" }),
    ).toBeVisible();
    await gotoTask140Page(page, `/shop/staff?shop_id=${fixture.shopId}`);
    await expect(
      sectionByHeading(page, "Create staff")
        .getByLabel("Role")
        .locator('option[value="pos_admin"]'),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("owner-only-create-staff-warning"),
    ).toBeVisible();
    await expect(
      sectionByHeading(page, "Create staff").getByLabel("Staff code"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("staff-role-permissions-advanced"),
    ).toHaveCount(0);

    return {
      context,
      page,
      staffWebSessionId: loadActiveStaffWebSessionId(
        runtime.supabaseUrl,
        fixture.shopId,
        fixture.managerActor.staffId,
      ),
    };
  } catch {
    await closeTask140Context(context);
    throw new Error("TASK140_MANAGER_ACTOR_LOGIN_FAILED");
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function firstLoginPos(
  runtime: ReadyRuntime,
  input: {
    credential: string;
    deviceIdentifier: string;
    shopCode: string;
    staffCode: string;
  },
): Promise<PosFirstLoginState> {
  let response: Response;

  try {
    response = await fetch(
      new URL("/api/pos/auth/first-login", runtime.appBaseUrl),
      {
        body: JSON.stringify({
          credential: input.credential,
          device: {
            appVersion: "TASK140-e2e",
            deviceIdentifier: input.deviceIdentifier,
            displayName: "TASK140 synthetic POS",
          },
          shopCode: input.shopCode,
          staffCode: input.staffCode,
        }),
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TASK140 E2E",
        },
        method: "POST",
        signal: AbortSignal.timeout(task140UiActionTimeout()),
      },
    );
  } catch {
    throw new Error("TASK140_POS_FIRST_LOGIN_REQUEST_FAILED");
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new Error("TASK140_POS_FIRST_LOGIN_RESPONSE_INVALID");
  }

  const result = recordValue(body);
  const device = recordValue(result?.device);
  const session = recordValue(result?.session);
  const shopDeviceId = device?.shopDeviceId;
  const posSessionId = session?.posSessionId;
  const sessionToken = session?.sessionToken;
  const trustedDeviceToken = result?.trustedDeviceToken;

  if (
    response.status !== 200 ||
    result?.ok !== true ||
    result.code !== "success" ||
    typeof shopDeviceId !== "string" ||
    !UUID_PATTERN.test(shopDeviceId) ||
    typeof posSessionId !== "string" ||
    !UUID_PATTERN.test(posSessionId) ||
    typeof sessionToken !== "string" ||
    sessionToken.length === 0 ||
    typeof trustedDeviceToken !== "string" ||
    trustedDeviceToken.length === 0
  ) {
    throw new Error("TASK140_POS_FIRST_LOGIN_DENIED_OR_MALFORMED");
  }

  return {
    deviceToken: trustedDeviceToken,
    posSessionId,
    sessionToken,
    shopDeviceId,
  };
}

async function expectPosFirstLoginDenied(
  runtime: ReadyRuntime,
  input: {
    credential: string;
    deviceIdentifier: string;
    shopCode: string;
    staffCode: string;
  },
) {
  const response = await fetch(
    new URL("/api/pos/auth/first-login", runtime.appBaseUrl),
    {
      body: JSON.stringify({
        credential: input.credential,
        device: {
          appVersion: "TASK140-expiry-e2e",
          deviceIdentifier: input.deviceIdentifier,
          displayName: "TASK140 expired synthetic POS",
        },
        shopCode: input.shopCode,
        staffCode: input.staffCode,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(task140UiActionTimeout()),
    },
  );
  const result = recordValue(await response.json());

  expect(response.status).toBe(401);
  expect(result?.ok).toBe(false);
}

async function expectPosHeartbeatDenied(
  runtime: ReadyRuntime,
  session: PosFirstLoginState,
) {
  const response = await fetch(
    new URL("/api/pos/session/heartbeat", runtime.appBaseUrl),
    {
      body: JSON.stringify({
        appVersion: "TASK140-expiry-e2e",
        deviceToken: session.deviceToken,
        posSessionId: session.posSessionId,
        sessionToken: session.sessionToken,
        shopDeviceId: session.shopDeviceId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(task140UiActionTimeout()),
    },
  );
  const result = recordValue(await response.json());

  expect(response.status).toBe(401);
  expect(result?.ok).toBe(false);
}

async function expectPosFirstLoginState(
  expectedSupabaseUrl: string,
  fixture: Task140Fixture,
  input: {
    auth: PosFirstLoginState;
    credentialVersion: number;
    deviceIdentifier: string;
    staffId: string;
  },
) {
  const shopIdSql = task140SqlUuid(fixture.shopId, "POS_SHOP");
  const deviceIdSql = task140SqlUuid(input.auth.shopDeviceId, "POS_DEVICE");
  const sessionIdSql = task140SqlUuid(input.auth.posSessionId, "POS_SESSION");
  const state = queryTask140Json<{
    credential: Record<string, unknown> | null;
    device: Record<string, unknown> | null;
    session: Record<string, unknown> | null;
  }>(
    expectedSupabaseUrl,
    "POS_FIRST_LOGIN_STATE_READ",
    [
      "select json_build_object(",
      "'device', (select json_build_object('device_identifier', device_identifier, 'last_seen_staff_id', last_seen_staff_id, 'status', status)",
      `from public.shop_devices where shop_device_id = ${deviceIdSql} and shop_id = ${shopIdSql}),`,
      "'credential', (select json_build_object('pos_device_credential_id', pos_device_credential_id, 'staff_credential_version', staff_credential_version, 'staff_id', staff_id, 'status', status, 'token_hash', token_hash)",
      `from public.pos_device_credentials where shop_device_id = ${deviceIdSql} and shop_id = ${shopIdSql} and status = 'active'),`,
      "'session', (select json_build_object('pos_device_credential_id', pos_device_credential_id, 'staff_credential_version', staff_credential_version, 'staff_id', staff_id, 'status', status, 'session_token_hash', session_token_hash)",
      `from public.pos_sessions where pos_session_id = ${sessionIdSql} and shop_id = ${shopIdSql})`,
      ")",
    ].join(" "),
  );
  const device = recordValue(state.device);
  const credential = recordValue(state.credential);
  const session = recordValue(state.session);

  if (
    !device ||
    !credential ||
    !session ||
    device.device_identifier !== input.deviceIdentifier ||
    device.last_seen_staff_id !== input.staffId ||
    device.status !== "active" ||
    credential.staff_id !== input.staffId ||
    credential.staff_credential_version !== input.credentialVersion ||
    credential.status !== "active" ||
    typeof credential.token_hash !== "string" ||
    !credential.token_hash.startsWith("sha256:") ||
    session.pos_device_credential_id !== credential.pos_device_credential_id ||
    session.staff_id !== input.staffId ||
    session.staff_credential_version !== input.credentialVersion ||
    session.status !== "active" ||
    typeof session.session_token_hash !== "string" ||
    !session.session_token_hash.startsWith("sha256:")
  ) {
    throw new Error("TASK140_POS_FIRST_LOGIN_DATABASE_STATE_INVALID");
  }
}

async function loginShopCodeSuccessfully(
  browser: Browser,
  runtime: ReadyRuntime,
  input: {
    credential: string;
    shopCode: string;
    staffCode: string;
  },
) {
  const { context, page } = await openShopCodeLogin(
    browser,
    runtime.appBaseUrl,
  );

  try {
    await page.getByRole("textbox", { name: "Shop code" }).fill(input.shopCode);
    await page
      .getByRole("textbox", { name: "Staff code" })
      .fill(input.staffCode);
    await page.getByLabel("PIN / password").fill(input.credential);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/shop", {
        timeout: task140UiActionTimeout(),
      }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    await expect(
      page.getByRole("heading", { level: 1, name: "Shop Overview" }),
    ).toBeVisible();
    const staffWebSessionId = loadActiveStaffWebSessionIdByCode(
      runtime.supabaseUrl,
      input.shopCode,
      input.staffCode,
    );
    const logoutResponse = await page.request.post("/shop/staff-logout", {
      headers: {
        origin: runtime.appBaseUrl,
        "sec-fetch-site": "same-origin",
      },
      maxRedirects: 0,
      timeout: task140UiActionTimeout(),
    });
    expect(logoutResponse.status()).toBe(303);
    expect(logoutResponse.headers()["clear-site-data"]).toBe(
      '"cache", "storage"',
    );
    const logoutLocation = logoutResponse.headers().location;
    expect(logoutLocation).toBeTruthy();
    await gotoTask140Page(
      page,
      new URL(logoutLocation!, runtime.appBaseUrl).toString(),
    );
    await expect(page).toHaveURL((url) => url.pathname === "/auth/login");
    return staffWebSessionId;
  } finally {
    await closeTask140Context(context);
  }
}

async function expectCredentialExpiryEnforced(
  browser: Browser,
  runtime: ReadyRuntime,
  fixture: Task140Fixture,
) {
  const target = fixture.expiring;
  const { context, page } = await openShopCodeLogin(
    browser,
    runtime.appBaseUrl,
  );

  try {
    await page
      .getByRole("textbox", { name: "Shop code" })
      .fill(fixture.shopCode);
    await page
      .getByRole("textbox", { name: "Staff code" })
      .fill(target.staffCode);
    await page.getByLabel("PIN / password").fill(target.pin);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/shop", {
        timeout: task140UiActionTimeout(),
      }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);

    const posSession = await firstLoginPos(runtime, {
      credential: target.pin,
      deviceIdentifier: fixture.posDeviceIdentifiers.expiring,
      shopCode: fixture.shopCode,
      staffCode: target.staffCode,
    });

    executeTask140Sql(
      runtime.supabaseUrl,
      "CREDENTIAL_EXPIRE",
      [
        "update public.staff_accounts set",
        "credential_expires_at = now() - interval '1 minute', updated_at = now()",
        `where staff_id = ${task140SqlUuid(target.staffId, "EXPIRING_STAFF")}`,
        `and credential_version = ${target.initialCredentialVersion}`,
      ].join(" "),
    );

    await gotoTask140Page(page, "/shop");
    await expect(page).toHaveURL((url) => url.pathname === "/shop");
    await expect(
      page.getByRole("heading", { level: 1, name: /access required/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Shop Overview" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Shop sections" }),
    ).toHaveCount(0);
    await expectPosHeartbeatDenied(runtime, posSession);
    await expectShopCodeLoginBlockedWhileSuspended(browser, runtime, {
      credential: target.pin,
      shopCode: fixture.shopCode,
      staffCode: target.staffCode,
    });
    await expectPosFirstLoginDenied(runtime, {
      credential: target.pin,
      deviceIdentifier: `${fixture.posDeviceIdentifiers.expiring}_NEW`.slice(
        0,
        32,
      ),
      shopCode: fixture.shopCode,
      staffCode: target.staffCode,
    });
  } finally {
    await closeTask140Context(context);
  }
}

async function assertOldCredentialRejectedThenNewAccepted(
  browser: Browser,
  runtime: ReadyRuntime,
  input: {
    newCredential: string;
    oldCredential: string;
    shopCode: string;
    staffCode: string;
  },
) {
  const { context, page } = await openShopCodeLogin(
    browser,
    runtime.appBaseUrl,
  );

  try {
    await page.getByRole("textbox", { name: "Shop code" }).fill(input.shopCode);
    await page
      .getByRole("textbox", { name: "Staff code" })
      .fill(input.staffCode);
    await page.getByLabel("PIN / password").fill(input.oldCredential);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText(
        "Sign-in was blocked. Check the credentials or try again later.",
      ),
    ).toBeVisible({ timeout: task140UiActionTimeout() });
    const credentialFieldValue = await page
      .getByLabel("PIN / password")
      .inputValue();

    if (credentialFieldValue !== "") {
      throw new Error("TASK140_REJECTED_CREDENTIAL_FIELD_NOT_CLEARED");
    }

    await page.getByLabel("PIN / password").fill(input.newCredential);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/shop", {
        timeout: task140UiActionTimeout(),
      }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    await expect(
      page.getByRole("heading", { level: 1, name: "Shop Overview" }),
    ).toBeVisible();
    const logoutResponse = await page.request.post("/shop/staff-logout", {
      headers: {
        origin: runtime.appBaseUrl,
        "sec-fetch-site": "same-origin",
      },
      maxRedirects: 0,
      timeout: task140UiActionTimeout(),
    });
    expect(logoutResponse.status()).toBe(303);
    expect(logoutResponse.headers()["clear-site-data"]).toBe(
      '"cache", "storage"',
    );
    const logoutLocation = logoutResponse.headers().location;
    expect(logoutLocation).toBeTruthy();
    await gotoTask140Page(
      page,
      new URL(logoutLocation!, runtime.appBaseUrl).toString(),
    );
    await expect(page).toHaveURL((url) => url.pathname === "/auth/login");
  } finally {
    await closeTask140Context(context);
  }
}

test("TASK-140 POS Admin owner guard and exact permissions preserve manager PIN/reset and legacy Shop Code compatibility", async ({
  browser,
}) => {
  test.setTimeout(process.env.TEST_TARGET === "staging" ? 1_800_000 : 240_000);
  const runtime = runtimeFromEnv();

  if (runtime.status !== "ready") {
    test.skip(true, runtime.reason);
    return;
  }

  const fixture = await createTask140Fixture(runtime);
  console.info("[task140] PASS synthetic fixture ready");
  let managerContext: BrowserContext | null = null;
  let ownerContext: BrowserContext | null = null;

  try {
    ownerContext = await browser.newContext({
      baseURL: runtime.appBaseUrl,
      locale: "en-US",
    });
    const ownerPage = await ownerContext.newPage();

    await signInOwner(ownerPage, fixture);
    await expectOwnerOnlySharedRoleControlsHidden(ownerPage, fixture);
    const manager = await signInStaffManager(browser, runtime, fixture);
    console.info("[task140] PASS owner and staff-manager sessions ready");
    managerContext = manager.context;
    await expectAtomicConcurrentLockout(runtime, fixture);
    await expectShopCodeLockExpiry(browser, runtime, fixture);
    await expectCredentialExpiryEnforced(browser, runtime, fixture);
    console.info("[task140] PASS lockout and expiry scenarios");

    const posAdminPin = await createPinStaffViaUi(ownerPage, fixture, {
      displayName: "TASK140 Created POS Admin",
      roleKey: "pos_admin",
      staffCode: fixture.posAdminCreateStaffCode,
    });
    const posAdminStaff = loadStaffStateByCode(
      runtime.supabaseUrl,
      fixture.shopId,
      fixture.posAdminCreateStaffCode,
    );

    expect(posAdminStaff.status).toBe("active");
    expect(posAdminStaff.role_key).toBe("pos_admin");
    expect(posAdminStaff.credential_kind).toBe("pin");
    expect(posAdminStaff.credential_status).toBe("active");
    expect(posAdminStaff.must_change_credential).toBe(false);
    expect(posAdminStaff.failed_attempts).toBe(0);
    expect(posAdminStaff.locked_until).toBeNull();
    expectExactPosAdminPermissions(runtime.supabaseUrl, fixture.shopId);
    await expectWebAttemptCleared(
      runtime.supabaseUrl,
      fixture.shopCode,
      fixture.posAdminCreateStaffCode,
    );
    await expectShopCodeLoginBlockedWhileSuspended(browser, runtime, {
      credential: posAdminPin,
      shopCode: fixture.shopCode,
      staffCode: fixture.posAdminCreateStaffCode,
    });
    await assertShopManagerCannotManagePosAdmin(
      runtime,
      fixture,
      posAdminStaff,
    );
    await assertStaffManagerRpcCannotManagePosAdmin(
      runtime,
      fixture,
      posAdminStaff,
      manager.staffWebSessionId,
    );
    await expectStaffManagerProtectedActionsHidden(
      manager.page,
      fixture,
      fixture.posAdminCreateStaffCode,
    );

    await resetPinViaUi(
      ownerPage,
      runtime,
      fixture,
      fixture.posAdminCreateStaffCode,
      "owner POS Admin reset",
    );
    const resetPosAdmin = loadStaffState(
      runtime.supabaseUrl,
      posAdminStaff.staff_id,
    );

    expect(resetPosAdmin.status).toBe("active");
    expect(resetPosAdmin.role_key).toBe("pos_admin");
    expect(resetPosAdmin.credential_kind).toBe("pin");
    expect(resetPosAdmin.credential_status).toBe("active");
    expect(resetPosAdmin.must_change_credential).toBe(false);
    expect(resetPosAdmin.failed_attempts).toBe(0);
    expect(resetPosAdmin.locked_until).toBeNull();
    expect(resetPosAdmin.credential_version).toBe(
      posAdminStaff.credential_version + 1,
    );
    expect(resetPosAdmin.session_invalidated_at).not.toBeNull();
    expectExactPosAdminPermissions(runtime.supabaseUrl, fixture.shopId);
    console.info("[task140] PASS owner-only POS Admin create and reset");

    const createdPin = await createPinStaffViaUi(ownerPage, fixture, {
      displayName: "TASK140 Created Manager",
      roleKey: "manager",
      staffCode: fixture.createStaffCode,
    });
    console.info("[task140] PASS owner-only manager UI create");
    const createdStaff = loadStaffStateByCode(
      runtime.supabaseUrl,
      fixture.shopId,
      fixture.createStaffCode,
    );

    expect(createdStaff.status).toBe("active");
    expect(createdStaff.role_key).toBe("manager");
    expect(createdStaff.credential_kind).toBe("pin");
    expect(createdStaff.credential_status).toBe("active");
    expect(createdStaff.must_change_credential).toBe(false);
    expect(createdStaff.failed_attempts).toBe(0);
    expect(createdStaff.locked_until).toBeNull();
    await expectWebAttemptCleared(
      runtime.supabaseUrl,
      fixture.shopCode,
      fixture.createStaffCode,
    );
    console.info("[task140] PASS manager database state");
    await loginShopCodeSuccessfully(browser, runtime, {
      credential: createdPin,
      shopCode: fixture.shopCode,
      staffCode: fixture.createStaffCode,
    });
    console.info("[task140] PASS owner-created manager Shop Code login");

    const suspendedUiResetPin = await suspendThenResetSelectedStaffViaUi(
      ownerPage,
      fixture,
      {
        staff_code: fixture.createStaffCode,
        staff_id: createdStaff.staff_id,
      },
    );
    const suspendedUiResetState = loadStaffState(
      runtime.supabaseUrl,
      createdStaff.staff_id,
    );

    expect(suspendedUiResetState.status).toBe("suspended");
    expect(suspendedUiResetState.credential_kind).toBe("pin");
    expect(suspendedUiResetState.credential_status).toBe("active");
    expect(suspendedUiResetState.must_change_credential).toBe(false);
    expect(suspendedUiResetState.credential_version).toBe(
      createdStaff.credential_version + 1,
    );
    expect(suspendedUiResetState.failed_attempts).toBe(0);
    expect(suspendedUiResetState.locked_until).toBeNull();
    await expectShopCodeLoginBlockedWhileSuspended(browser, runtime, {
      credential: suspendedUiResetPin,
      shopCode: fixture.shopCode,
      staffCode: fixture.createStaffCode,
    });

    await reactivateSelectedStaffViaUi(ownerPage, createdStaff.staff_id);
    const reactivatedUiResetState = loadStaffState(
      runtime.supabaseUrl,
      createdStaff.staff_id,
    );

    expect(reactivatedUiResetState.status).toBe("active");
    expect(reactivatedUiResetState.credential_status).toBe("active");
    expect(reactivatedUiResetState.must_change_credential).toBe(false);
    expect(reactivatedUiResetState.credential_version).toBe(
      suspendedUiResetState.credential_version,
    );
    await loginShopCodeSuccessfully(browser, runtime, {
      credential: suspendedUiResetPin,
      shopCode: fixture.shopCode,
      staffCode: fixture.createStaffCode,
    });
    console.info("[task140] PASS suspended reset and reactivation");

    const resetPin = await resetPinViaUi(
      ownerPage,
      runtime,
      fixture,
      fixture.activeReset.staffCode,
      "active reset",
    );
    await expectResetCredentialBoundToSelectedTarget(
      ownerPage,
      fixture.activeReset.staffCode,
      fixture.legacyFive.staffCode,
    );

    await expectCredentialResetState(
      runtime.supabaseUrl,
      fixture.activeReset,
      "active",
    );
    await expectWebAttemptCleared(
      runtime.supabaseUrl,
      fixture.shopCode,
      fixture.activeReset.staffCode,
    );
    await assertOldCredentialRejectedThenNewAccepted(browser, runtime, {
      newCredential: resetPin,
      oldCredential: fixture.activeReset.pin,
      shopCode: fixture.shopCode,
      staffCode: fixture.activeReset.staffCode,
    });

    const canonicalPosAuth = await firstLoginPos(runtime, {
      credential: resetPin,
      deviceIdentifier: fixture.posDeviceIdentifiers.canonicalSix,
      shopCode: fixture.shopCode,
      staffCode: fixture.activeReset.staffCode,
    });
    await expectPosFirstLoginState(runtime.supabaseUrl, fixture, {
      auth: canonicalPosAuth,
      credentialVersion: fixture.activeReset.initialCredentialVersion + 1,
      deviceIdentifier: fixture.posDeviceIdentifiers.canonicalSix,
      staffId: fixture.activeReset.staffId,
    });
    console.info("[task140] PASS active reset and canonical POS login");

    await resetPinViaUi(
      ownerPage,
      runtime,
      fixture,
      fixture.suspendedReset.staffCode,
      "suspended reset",
    );
    await expectCredentialResetState(
      runtime.supabaseUrl,
      fixture.suspendedReset,
      "suspended",
    );
    await expectWebAttemptCleared(
      runtime.supabaseUrl,
      fixture.shopCode,
      fixture.suspendedReset.staffCode,
    );
    console.info("[task140] PASS owner-only suspended credential reset");

    if (
      fixture.legacyFive.pin.length !== 5 ||
      fixture.legacyEight.pin.length !== 8 ||
      new Set(Object.values(fixture.posDeviceIdentifiers)).size !== 4
    ) {
      throw new Error("TASK140_LEGACY_FIXTURE_LENGTH_INVALID");
    }

    await loginShopCodeSuccessfully(browser, runtime, {
      credential: fixture.legacyFive.pin,
      shopCode: fixture.shopCode,
      staffCode: fixture.legacyFive.staffCode,
    });
    await loginShopCodeSuccessfully(browser, runtime, {
      credential: fixture.legacyEight.pin,
      shopCode: fixture.shopCode,
      staffCode: fixture.legacyEight.staffCode,
    });

    const legacyFivePosAuth = await firstLoginPos(runtime, {
      credential: fixture.legacyFive.pin,
      deviceIdentifier: fixture.posDeviceIdentifiers.legacyFive,
      shopCode: fixture.shopCode,
      staffCode: fixture.legacyFive.staffCode,
    });
    await expectPosFirstLoginState(runtime.supabaseUrl, fixture, {
      auth: legacyFivePosAuth,
      credentialVersion: fixture.legacyFive.initialCredentialVersion,
      deviceIdentifier: fixture.posDeviceIdentifiers.legacyFive,
      staffId: fixture.legacyFive.staffId,
    });

    const legacyEightPosAuth = await firstLoginPos(runtime, {
      credential: fixture.legacyEight.pin,
      deviceIdentifier: fixture.posDeviceIdentifiers.legacyEight,
      shopCode: fixture.shopCode,
      staffCode: fixture.legacyEight.staffCode,
    });
    await expectPosFirstLoginState(runtime.supabaseUrl, fixture, {
      auth: legacyEightPosAuth,
      credentialVersion: fixture.legacyEight.initialCredentialVersion,
      deviceIdentifier: fixture.posDeviceIdentifiers.legacyEight,
      staffId: fixture.legacyEight.staffId,
    });
    console.info("[task140] PASS legacy Shop Code and POS compatibility");
  } finally {
    let cleanupFailed = false;

    async function attemptCleanup(action: () => Promise<void>) {
      try {
        await action();
      } catch {
        cleanupFailed = true;
      }
    }

    await attemptCleanup(async () => {
      await closeTask140Context(managerContext);
    });
    await attemptCleanup(async () => {
      await closeTask140Context(ownerContext);
    });
    await attemptCleanup(fixture.cleanup);
    console.info("[task140] PASS exact synthetic cleanup");

    if (cleanupFailed) {
      throw new Error("TASK140_FINAL_CLEANUP_FAILED");
    }
  }
});
