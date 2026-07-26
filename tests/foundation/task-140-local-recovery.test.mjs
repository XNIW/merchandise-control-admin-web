import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

async function loadCredentialModule() {
  const source = readProjectFile(
    "src/server/shop-admin/staff-credentials.ts",
  ).replace(/^import "server-only";\r?\n\r?\n/, "");
  const tempDir = await mkdtemp(join(tmpdir(), "task-140-local-recovery-"));
  const modulePath = join(tempDir, "staff-credentials.mjs");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "staff-credentials.ts",
  });

  await writeFile(modulePath, outputText, "utf8");

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    module: await import(pathToFileURL(modulePath).href),
  };
}

test("TASK-140 recovered PIN contract remains six-digit and leading-zero safe", async () => {
  const credentials = readProjectFile(
    "src/server/shop-admin/staff-credentials.ts",
  );
  const mutations = readProjectFile(
    "src/server/shop-admin/staff-mutations.ts",
  );
  const managerPin = readProjectFile(
    "src/server/platform-admin/temporary-manager-pin.ts",
  );
  const { cleanup, module } = await loadCredentialModule();

  try {
    assert.equal(module.STAFF_PIN_LENGTH, 6);
    assert.equal(module.STAFF_PIN_PATTERN.test("000042"), true);

    for (let index = 0; index < 128; index += 1) {
      assert.match(module.generateStaffPin(), /^\d{6}$/);
    }

    const storedHash = await module.hashStaffCredential("000042", {
      allowTemporaryPin: true,
    });
    assert.equal(await module.verifyStaffCredential("000042", storedHash), true);
    assert.equal(await module.verifyStaffCredential("100042", storedHash), false);
  } finally {
    await cleanup();
  }

  assert.match(credentials, /randomInt\(0,\s*1_000_000\)/);
  assert.match(credentials, /\.padStart\(STAFF_PIN_LENGTH,\s*"0"\)/);
  assert.match(mutations, /kind === "pin"[\s\S]*generateStaffPin\(\)/);
  assert.match(mutations, /allowTemporaryPin:\s*true/);
  assert.match(managerPin, /return generateStaffPin\(\)/);
});

test("TASK-140 recovered staff web authorization keeps owner-only boundaries", () => {
  const principal = readProjectFile(
    "src/server/shop-admin/access-principal.ts",
  );
  const staffWebAuth = readProjectFile(
    "src/server/shop-admin/staff-web-auth.ts",
  );
  const permissions = readProjectFile(
    "src/server/shop-admin/staff-web-permissions.ts",
  );

  assert.match(permissions, /OWNER_ONLY_STAFF_WEB_PERMISSIONS/);
  assert.match(permissions, /"pos_admin"/);
  assert.match(principal, /isStaffCredentialLockStateUsable/);
  assert.match(principal, /credentialExpiresAt/);
  assert.match(principal, /OWNER_ONLY_STAFF_WEB_PERMISSIONS/);
  assert.match(staffWebAuth, /credentialExpiresAt:\s*staff\.credentialExpiresAt/);
});
