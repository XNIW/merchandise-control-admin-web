import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();

async function loadCredentialModule() {
  const source = readFileSync(
    join(root, "src/server/shop-admin/staff-credentials.ts"),
    "utf8",
  ).replace(/^import "server-only";\r?\n\r?\n/, "");
  const tempDir = await mkdtemp(join(tmpdir(), "task-014-staff-credentials-"));
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
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
  };
}

test("TASK-014 staff credential hashes verify and stay redacted", async () => {
  const { cleanup, module } = await loadCredentialModule();

  try {
    const plaintext = "temporary-redacted-credential";
    const firstHash = await module.hashStaffCredential(plaintext);
    const secondHash = await module.hashStaffCredential(plaintext);

    assert.match(firstHash, /^\$scrypt-v1\$n=16384,r=8,p=1,l=64\$/);
    assert.notEqual(firstHash, secondHash, "random salt must change the hash");
    assert.equal(firstHash.includes(plaintext), false);
    assert.equal(await module.verifyStaffCredential(plaintext, firstHash), true);
    assert.equal(
      await module.verifyStaffCredential("different-redacted-credential", firstHash),
      false,
    );
    assert.equal(module.needsStaffCredentialRehash(firstHash), false);
  } finally {
    await cleanup();
  }
});

test("TASK-014 staff credential invalid formats fail closed", async () => {
  const { cleanup, module } = await loadCredentialModule();

  try {
    const validHash = await module.hashStaffCredential(
      "another-redacted-credential",
    );
    const invalidHashes = [
      "",
      "not-a-hash",
      validHash.replace("scrypt-v1", "scrypt-v0"),
      validHash.replace("n=16384", "n=abc"),
      `${validHash}$extra`,
    ];

    for (const invalidHash of invalidHashes) {
      assert.equal(
        await module.verifyStaffCredential("another-redacted-credential", invalidHash),
        false,
      );
      assert.equal(module.needsStaffCredentialRehash(invalidHash), true);
    }

    await assert.rejects(
      () => module.hashStaffCredential("short"),
      /STAFF_CREDENTIAL_TOO_SHORT/,
    );
  } finally {
    await cleanup();
  }
});
