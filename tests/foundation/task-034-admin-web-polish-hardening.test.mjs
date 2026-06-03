import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
}

test("TASK-034 import/export panel makes preview-first apply semantics explicit", () => {
  const panel = readProjectFile("src/app/shop/_components/ImportExportActionPanel.tsx");

  for (const required of [
    "Preview first",
    "No catalog rows are changed in preview.",
    "Use the preview digest returned by the preview step.",
    "APPLY only after reviewing errors, warnings and counts.",
  ]) {
    assertContains(panel, required);
  }
});

test("TASK-034 device revoke/reactivate actions require a reason in UI and server boundary", () => {
  const panel = readProjectFile("src/app/shop/_components/DeviceActionPanel.tsx");
  const mutations = readProjectFile("src/server/shop-admin/device-mutations.ts");

  assert.match(
    panel,
    /Revoke device[\s\S]*<TextInput label="Reason" name="reason" required \/>/,
  );
  assert.match(
    panel,
    /Reactivate device[\s\S]*<TextInput label="Reason" name="reason" required \/>/,
  );
  assert.match(mutations, /function reasonRequired/);
  assert.match(mutations, /reason_required/);
  assert.match(mutations, /A reason is required for device status actions\./);
});
