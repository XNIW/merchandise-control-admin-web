import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

const requiredFiles = [
  ".env.example",
  "src/lib/supabase/server.ts",
  "src/server/platform-admin/authz.ts",
  "src/server/platform-admin/read-model.ts",
  "src/server/platform-admin/mappers.ts",
  "src/server/platform-admin/inventory-sources.ts",
  "scripts/security-checks.mjs",
  "docs/TASKS/TASK-005E-supabase-foundation-execution.md",
  "docs/TASKS/EVIDENCE/TASK-005E/README.md",
];

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-005E foundation files exist", () => {
  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }
});

test(".env.example declares only empty future Supabase variables", () => {
  const envTemplate = readProjectFile(".env.example");
  const requiredNames = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PROJECT_REF",
  ];

  for (const name of requiredNames) {
    assert.match(envTemplate, new RegExp(`^${name}=\\s*$`, "m"), `${name} must be present without a value`);
  }

  for (const line of envTemplate.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [, value = ""] = line.split("=", 2);
    assert.equal(value.trim(), "", `env template value must stay empty: ${line}`);
  }
});

test("package scripts wire the static security harness into verify", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));

  assert.equal(pkg.scripts["security:scan"], "node scripts/security-checks.mjs");
  assert.match(pkg.scripts.verify, /security:scan/);
});

test("server Supabase boundary remains server-side and service-role free", () => {
  const serverBoundary = readProjectFile("src/lib/supabase/server.ts");

  assert.match(serverBoundary, /not_configured/);
  assert.doesNotMatch(serverBoundary, /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role/i);
});

test("owner source mapping keeps the TASK-005D initial 1:1 cardinality", () => {
  const taskDoc = readProjectFile("docs/TASKS/TASK-005E-supabase-foundation-execution.md");
  const mapper = readProjectFile("src/server/platform-admin/mappers.ts");

  assert.doesNotMatch(taskDoc, /owner_user_id -> shop_id`:\s*puo mappare piu shop/);
  assert.match(taskDoc, /owner_user_id -> shop_id`:\s*inizialmente massimo 1 shop attivo/);
  assert.match(mapper, /validateInitialShopOwnerMappingCardinality/);
  assert.match(mapper, /duplicate_active_owner/);
  assert.match(mapper, /duplicate_active_shop/);
});
