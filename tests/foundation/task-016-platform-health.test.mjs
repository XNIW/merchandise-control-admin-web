import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-016 system and data health expose real safe states without raw env", () => {
  const systemPagePath = "src/app/platform/system/page.tsx";
  const dataPagePath = "src/app/platform/data/page.tsx";
  const readModelPath = "src/server/platform-admin/read-model.ts";
  const sectionDataPath = "src/server/platform-admin/platform-section-data.ts";

  for (const relativePath of [systemPagePath, dataPagePath, readModelPath, sectionDataPath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const systemPage = readProjectFile(systemPagePath);
  const dataPage = readProjectFile(dataPagePath);
  const readModel = readProjectFile(readModelPath);
  const sectionData = readProjectFile(sectionDataPath);

  assert.match(systemPage, /getPlatformSectionForRequest\("system"/);
  assert.match(dataPage, /getPlatformSectionForRequest\("data"/);
  assert.match(readModel, /PlatformDataHealth/);
  assert.match(sectionData, /shops without owner|profiles without membership|orphaned memberships|audit coverage|migration drift/i);
  assert.match(sectionData, /NOT_RUN|BLOCKED|not_configured/i);
  assert.doesNotMatch(`${systemPage}\n${dataPage}\n${readModel}\n${sectionData}`, /process\.env|\.env\.local|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE/i);
});

test("TASK-016 data health uses server-side aggregate inputs only", () => {
  const readModel = readProjectFile("src/server/platform-admin/read-model.ts");

  assert.match(readModel, /shopOwnerMappings/);
  assert.match(readModel, /platformAdmins/);
  assert.match(readModel, /auditLogs/);
  assert.match(readModel, /shopDevices/);
  assert.match(readModel, /syncEvents/);
  assert.doesNotMatch(readModel, /select\("\*"\)|select\('\*'\)/);
});
