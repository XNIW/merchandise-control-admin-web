import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-015 mobile history read model is mapped, redacted, and distinct from audit logs", () => {
  const readModelPath = "src/server/shop-admin/history-read-model.ts";

  assert.equal(existsSync(join(root, readModelPath)), true, `${readModelPath} is missing`);

  const readModel = readProjectFile(readModelPath);

  assert.match(readModel, /import "server-only"/);
  assert.match(readModel, /resolveCurrentShopAdminShellAccess/);
  assert.match(readModel, /\.from\("shop_inventory_sources"\)/);
  assert.match(readModel, /\.from\("sync_events"\)/);
  assert.match(readModel, /\.from\("shared_sheet_sessions"\)/);
  assert.match(readModel, /\.eq\("owner_user_id", mapping\.ownerUserId\)/);
  assert.match(readModel, /\.in\("domain", \["history", "catalog", "prices"\]\)/);
  assert.match(readModel, /redactShopAdminJson/);
  assert.doesNotMatch(readModel, /\.from\("audit_logs"\)/);
  assert.doesNotMatch(readModel, /credential_hash|access_token|refresh_token|magic_link/i);
  assert.doesNotMatch(readModel, /select\("\*"\)|\.(insert|update|delete|upsert|rpc)\s*\(/);
});

test("TASK-015 history route is part of Shop Admin navigation", () => {
  const pagePath = "src/app/shop/history/page.tsx";

  assert.equal(existsSync(join(root, pagePath)), true, `${pagePath} is missing`);

  const sections = readProjectFile("src/components/shop/shopSections.ts");
  const page = readProjectFile(pagePath);

  assert.match(sections, /key: "history"/);
  assert.match(sections, /href: "\/shop\/history"/);
  assert.match(page, /getShopSectionForRequest\(\s*"history"/);
});

test("TASK-015 history detail is shop-scoped and recursively redacted", () => {
  const detailPagePath = "src/app/shop/history/[entryId]/page.tsx";
  const readModelPath = "src/server/shop-admin/history-read-model.ts";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";

  assert.equal(
    existsSync(join(root, detailPagePath)),
    true,
    `${detailPagePath} is missing`,
  );

  const detailPage = readProjectFile(detailPagePath);
  const readModel = readProjectFile(readModelPath);
  const sectionData = readProjectFile(sectionDataPath);

  assert.match(detailPage, /export const dynamic = "force-dynamic"/);
  assert.match(detailPage, /params/);
  assert.match(detailPage, /searchParams/);
  assert.match(detailPage, /getShopHistoryDetailSectionForRequest/);

  assert.match(readModel, /getShopHistoryDetailReadModel/);
  assert.match(readModel, /parseHistoryEntryId/);
  assert.match(readModel, /try\s*{[\s\S]*decodeURIComponent\(entryId\)/);
  assert.match(readModel, /catch\s*{[\s\S]*kind: "invalid"/);
  assert.match(readModel, /\.from\("sync_events"\)/);
  assert.match(readModel, /\.from\("shared_sheet_sessions"\)/);
  assert.match(readModel, /\.eq\("owner_user_id", mapping\.ownerUserId\)/);
  assert.match(
    readModel,
    /parsedEntry\.kind === "sync_event"[\s\S]*\.eq\("id", parsedEntry\.value\)[\s\S]*\.in\("domain", \["history", "catalog", "prices"\]\)/,
  );
  assert.match(readModel, /\.eq\("remote_id", parsedEntry\.value\)/);
  assert.match(readModel, /redactShopAdminJson/);
  assert.match(readModel, /stringifyRedactedJson/);
  assert.doesNotMatch(readModel, /\.from\("audit_logs"\)/);
  assert.doesNotMatch(readModel, /credential_hash|access_token|refresh_token|magic_link/i);
  assert.doesNotMatch(readModel, /select\("\*"\)|\.(insert|update|delete|upsert|rpc)\s*\(/);

  assert.match(sectionData, /buildHistoryDetailSection/);
  assert.match(sectionData, /getShopHistoryDetailSectionForRequest/);
  assert.match(sectionData, /deviceDetailHref/);
});
