import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = process.cwd();
const SHOP = "10000000-0000-4000-8000-000000000019";
const OTHER_SHOP = "10000000-0000-4000-8000-000000000020";

function loadModule(path, dependencies = {}) {
  const loadedModule = { exports: {} };
  const source = readFileSync(join(root, path), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: path,
  }).outputText;
  runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    Error,
    require(specifier) {
      if (specifier === "server-only") return {};
      assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected dependency: ${specifier}`);
      return dependencies[specifier];
    },
  }, { filename: path });
  return loadedModule.exports;
}

function personalShopRow() {
  return {
    shop_id: SHOP,
    shop_code: "SYNTHETIC-019",
    shop_name: "Synthetic shop profile",
    shop_status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    status_changed_at: null,
    suspended_at: null,
    archived_at: null,
  };
}

function harness({ principalKind = "pos_staff_manager", shopResult, memberRows = [] } = {}) {
  const queries = [];
  const accessRequests = [];
  const identityRequests = [];
  const client = {
    from(table) {
      const query = { table, filters: [] };
      queries.push(query);
      return {
        select(columns) { query.columns = columns; return this; },
        eq(column, value) { query.filters.push([column, value]); return this; },
        order() { return this; },
        async maybeSingle() {
          assert.equal(table, "shops");
          return shopResult ?? { data: personalShopRow(), error: null };
        },
        async limit() {
          assert.equal(table, "shop_members");
          return { data: memberRows, error: null };
        },
      };
    },
  };
  const state = {
    access: {
      status: "ready",
      principalKind,
      selectedShop: { shopId: SHOP, role: "shop_owner" },
      principal: {staff:{staffId:OTHER_SHOP},staffWebSession:{sessionId:OTHER_SHOP,credentialVersion:1,sessionTokenHash:"synthetic"}},
      supabase: client,
    },
  };
  const readModel = loadModule("src/server/shop-admin/read-model.ts", {
    "./staff-profile-read-model": loadModule("src/server/shop-admin/staff-profile-read-model.ts", {
      "./data-access": {async revalidateShopAdminDataAccessForPublish(){return true;}},
      "./staff-web-lease-bound-rpc": {async callStaffWebShopProfileRead(){return {data:null,error:{code:"PGRST202"}};}},
      "@/lib/account-identity": {createAccountIdentitySummary(){throw Error("Unexpected identity read");}},
    }),
    "./data-access": {
      async resolveShopAdminDataAccess(options) {
        accessRequests.push(options);
        return state.access;
      },
    },
    "@/lib/account-identity": {
      createAccountIdentitySummary() { throw new Error("Unexpected account identity read"); },
    },
    "@/server/platform-admin/auth-identities": {
      async loadAuthIdentitySummariesByIds(ids) {
        identityRequests.push(ids);
        assert.equal(ids.length, 0, "No identities are needed for an empty member list");
        return { identities: [] };
      },
    },
  });
  const sections = loadModule("src/server/shop-admin/shop-section-data.ts", {
    "@/components/shop/shopSections": loadModule("src/components/shop/shopSections.ts"),
    "./audit-read-model": {},
    "./device-read-model": {},
    "./history-read-model": {},
    "./import-export-readiness": {},
    "./inventory-read-model": {},
    "./permissions": {},
    "./pos-live-read-model": {},
    "./read-model": readModel,
    "./staff-read-model": {},
  });
  return { state, queries, accessRequests, identityRequests, readModel, sections };
}

for (const view of ["overview", "members", "settings"]) {
  test(`ASUS-019 ${view}: eligible staff gets a distinct unavailable state without a table read`, async () => {
    const h = harness();
    const model = await h.readModel.getShopAdminReadModel({ view, requestedShopId: SHOP });
    assert.equal(model.status, "staff_surface_unavailable");
    assert.equal(model.readOnly, true);
    assert.equal(model.selectedShop, null);
    assert.equal(model.members.length, 0);
    assert.equal(h.queries.length, 0);
    assert.equal(h.identityRequests.length, 0);
    assert.equal(h.accessRequests[0].requiredPermission, view === "members" ? "members.view" : "settings.view");
    assert.equal(h.accessRequests[0].requestedShopId, SHOP);
    const section = await h.sections.getShopSectionForRequest(view, SHOP);
    assert.equal(section.status, "Unavailable for staff access");
    assert.equal(section.liveData.rows.length, 0);
    assert.equal(section.metrics.find((m) => m.label === "Rows shown").value, "Unavailable");
    assert.ok(section.metrics.every((m) => m.value !== "0" && m.label !== "Writes"));
    assert.match(section.description, /available section in the menu/);
    assert.doesNotMatch(JSON.stringify(section), /lease-bound|Writes Off|Read-only contract/);
    assert.equal(h.queries.length, 0);
  });
}

for (const status of ["unauthorized", "session_expired", "no_active_session"]) {
  test(`ASUS-019 ${status}: an access denial never becomes staff capability or an empty result`, async () => {
    const h = harness();
    h.state.access = {
      status,
      // Identical diagnostic text must not classify the state.
      reason: "Shop and member reads require a lease-bound staff read operation that is not available for this surface.",
    };
    const model = await h.readModel.getShopAdminReadModel({ view: "overview", requestedShopId: OTHER_SHOP });
    assert.equal(model.status, "unauthorized");
    const section = h.sections.buildOverviewSection(model);
    assert.equal(section.status, "Unauthorized");
    assert.equal(section.liveData.emptyState.title, "Page data unavailable");
    assert.equal(section.metrics.find((m) => m.label === "Rows shown").value, "Unavailable");
    assert.match(section.description, /required permission/);
    assert.equal(h.queries.length, 0);
  });
}

test("ASUS-019 personal-account overview still reads only the verified shop and renders its real profile", async () => {
  const h = harness({ principalKind: "personal_account" });
  const model = await h.readModel.getShopAdminReadModel({ view: "overview", requestedShopId: OTHER_SHOP });
  assert.equal(model.status, "ready");
  assert.equal(model.selectedShop.shopId, SHOP);
  assert.deepEqual(h.queries.map((q) => q.table), ["shops"]);
  assert.deepEqual(h.queries[0].filters, [["shop_id", SHOP]]);
  const section = h.sections.buildOverviewSection(model);
  assert.equal(section.status, "Read-only");
  assert.ok(section.liveData.rows.some((r) => r.field === "Shop code" && r.value === "SYNTHETIC-019"));
});

test("ASUS-019 authorized empty read keeps zero distinct from unavailable or failed data", async () => {
  const h = harness({ principalKind: "personal_account", shopResult: { data: null, error: null } });
  const model = await h.readModel.getShopAdminReadModel({ view: "overview", requestedShopId: SHOP });
  assert.equal(model.status, "empty");
  assert.equal(h.queries.length, 1);
  const section = h.sections.buildOverviewSection(model);
  assert.equal(section.status, "No rows returned");
  assert.equal(section.metrics.find((m) => m.label === "Rows shown").value, "0");
  assert.equal(section.liveData.emptyState.title, "No rows returned");
  assert.match(section.description, /authorized read completed/);
  assert.ok(section.metrics.every((m) => m.label !== "Writes"));
});

test("ASUS-019 a failed personal-account query is not shown as zero or as a staff limitation", async () => {
  const h = harness({ principalKind: "personal_account", shopResult: { data: null, error: new Error("synthetic read failure") } });
  const model = await h.readModel.getShopAdminReadModel({ view: "overview", requestedShopId: SHOP });
  assert.equal(model.status, "error");
  const section = h.sections.buildOverviewSection(model);
  assert.equal(section.status, "Read blocked");
  assert.equal(section.metrics.find((m) => m.label === "Rows shown").value, "Unavailable");
  assert.match(section.description, /Try again later/);
  assert.doesNotMatch(JSON.stringify(section), /synthetic read failure/);
});

test("ASUS-019 an unconfigured backend does not claim an authorized zero-row read", async () => {
  const h = harness();
  h.state.access = { status: "not_configured", reason: "Synthetic backend is unavailable" };
  const model = await h.readModel.getShopAdminReadModel({ view: "overview", requestedShopId: SHOP });
  assert.equal(model.status, "not_configured");
  const section = h.sections.buildOverviewSection(model);
  assert.equal(section.status, "Not configured");
  assert.equal(section.metrics.find((m) => m.label === "Rows shown").value, "Unavailable");
  assert.equal(section.liveData.rows.length, 0);
  assert.equal(h.queries.length, 0);
});

test("ASUS-019 access loss removes the prior personal profile instead of preserving stale rows", async () => {
  const h = harness({ principalKind: "personal_account" });
  const first = await h.sections.getShopSectionForRequest("overview", SHOP);
  assert.ok(first.liveData.rows.some((r) => r.value === "SYNTHETIC-019"));
  h.state.access = { status: "session_expired", reason: "Synthetic session expired" };
  const next = await h.sections.getShopSectionForRequest("overview", SHOP);
  assert.equal(next.status, "Unauthorized");
  assert.equal(next.liveData.rows.length, 0);
  assert.doesNotMatch(JSON.stringify(next), /SYNTHETIC-019|Synthetic shop profile/);
  assert.equal(h.queries.length, 1);
});

test("ASUS-019 personal members still performs the scoped read and may return an authorized empty list", async () => {
  const h = harness({ principalKind: "personal_account" });
  const model = await h.readModel.getShopAdminReadModel({ view: "members", requestedShopId: SHOP });
  assert.equal(model.status, "ready");
  assert.equal(model.members.length, 0);
  assert.deepEqual(h.queries.map((q) => q.table), ["shops", "shop_members"]);
  assert.deepEqual(h.queries[1].filters, [["shop_id", SHOP]]);
  const section = h.sections.buildMembersSection(model);
  assert.equal(section.status, "Members empty");
});

test("ASUS-019 all added page-state copy has Italian, Spanish and Chinese translations", () => {
  const { dictionaries } = loadModule("src/i18n/dictionaries.ts");
  const copy = [
    "Unavailable for staff access", "Page data", "Page actions",
    "This page provides no editing actions.", "No rows returned", "Page data unavailable",
    "This page is not available with a staff sign-in. Use an available section in the menu.",
    "Access to this page is not authorized. Use an account with the required permission.",
    "This page could not load its data. Try again later.",
    "Page data is not configured for this environment.",
    "The authorized read completed without returning rows for this page.",
    "Rows are unavailable because this page has not completed an authorized read.",
  ];
  for (const locale of ["it", "es", "zh-CN"]) {
    for (const key of copy) {
      assert.ok(dictionaries[locale].exact[key]?.trim(), `${locale}: ${key}`);
      assert.notEqual(dictionaries[locale].exact[key], key, `${locale}: untranslated copy`);
    }
  }
});
