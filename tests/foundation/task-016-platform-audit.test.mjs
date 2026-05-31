import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-016 global audit has list, detail, filters, and redacted metadata", () => {
  const listPagePath = "src/app/platform/audit/page.tsx";
  const detailPagePath = "src/app/platform/audit/[eventId]/page.tsx";
  const readModelPath = "src/server/platform-admin/read-model.ts";
  const sectionDataPath = "src/server/platform-admin/platform-section-data.ts";

  for (const relativePath of [listPagePath, detailPagePath, readModelPath, sectionDataPath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const listPage = readProjectFile(listPagePath);
  const detailPage = readProjectFile(detailPagePath);
  const readModel = readProjectFile(readModelPath);
  const sectionData = readProjectFile(sectionDataPath);

  assert.match(listPage, /getPlatformSectionForRequest\("audit"/);
  assert.match(detailPage, /getPlatformAuditDetailForRequest/);
  assert.match(detailPage, /eventId/);
  assert.match(readModel, /\.from\("audit_logs"\)/);
  assert.match(readModel, /metadata_redacted/);
  assert.match(readModel, /redactPlatformMetadata/);
  assert.match(sectionData, /actor|shop|area|action|target|severity|date/i);
  assert.doesNotMatch(`${detailPage}\n${sectionData}\n${readModel}`, /credential_hash|access_token|refresh_token|magic_link|pin_hash|password_hash/i);
});
