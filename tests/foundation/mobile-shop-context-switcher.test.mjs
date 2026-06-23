import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

test("Mobile Shop Context evidence starts with Android/iOS architecture parity gate", () => {
  const evidencePath =
    "docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-SWITCHER-20260622/README.md";

  assert.equal(existsSync(join(root, evidencePath)), true);

  const evidence = read(evidencePath);

  for (const required of [
    "Android/iOS Architecture Parity",
    "Account identity",
    "Linked shops fetch",
    "Selected shop state",
    "Selected shop persistence",
    "Sync context",
    "Local database scope",
    "Legacy compatibility",
    "UI Inventory Home",
    "Error/loading states",
    "Tests",
    "Android target",
    "iOS target",
    "READY_FOR_FINAL_REVIEW",
    "NOT_DONE",
  ]) {
    assertContains(evidence, required);
  }
});

test("Mobile Shop Context Admin contract exposes one linked-shops and selected-shop RPC set", () => {
  const migrationPath =
    "supabase/migrations/20260622160000_mobile_shop_context_switcher.sql";
  const typesPath = "src/lib/supabase/database.types.ts";

  assert.equal(existsSync(join(root, migrationPath)), true);

  const migration = read(migrationPath);
  const types = read(typesPath);

  for (const required of [
    "create or replace function public.mobile_linked_shops()",
    "from public.shop_members sm",
    "join public.shops s on s.shop_id = sm.shop_id",
    "where sm.profile_id = actor_id\n      and sm.membership_status = 'active'\n      and s.shop_status = 'active'",
    "'shop_id', linked.shop_id",
    "'shop_code', linked.shop_code",
    "'shop_name', linked.shop_name",
    "'role_key', linked.role_key",
    "'membership_status', linked.membership_status",
    "'shop_status', linked.shop_status",
    "'can_select', linked.can_select",
    "'can_write', linked.can_write",
    "where sm.profile_id = actor_id",
    "and sm.membership_status = 'active'",
    "and s.shop_status = 'active'",
    "sm.role_key in ('shop_owner', 'shop_manager') as can_write",
    "create or replace function public.shop_device_register_for_shop",
    "create or replace function public.shop_device_status_for_shop",
    "public.shop_device_register(",
    "grant execute on function public.mobile_linked_shops()",
    "grant execute on function public.shop_device_register_for_shop",
    "grant execute on function public.shop_device_status_for_shop",
    "mobile_linked_shops",
    "shop_device_register_for_shop",
    "shop_device_status_for_shop",
  ]) {
    assertContains(`${migration}\n${types}`, required);
  }

  assert.doesNotMatch(migration, /android_linked_shops|ios_linked_shops/i);
});

test("Mobile Shop Context sync event contract is shop-scoped and legacy-compatible", () => {
  const migration = read(
    "supabase/migrations/20260622160000_mobile_shop_context_switcher.sql",
  );
  const types = read("src/lib/supabase/database.types.ts");

  assert.match(
    migration,
    /drop function if exists public\.record_sync_event\([\s\S]*?text,\s*jsonb\s*\);/,
    "migration must drop the old 10-argument function before creating the defaulted 11-argument replacement",
  );
  assert.match(
    migration,
    /p_metadata jsonb default '\{\}'::jsonb,\s*p_shop_id uuid default null/,
    "p_shop_id must be a trailing default argument to preserve existing positional call order",
  );
  assert.match(
    migration,
    /from public\.shop_members sm[\s\S]*join public\.shops s on s\.shop_id = sm\.shop_id[\s\S]*sm\.role_key in \('shop_owner', 'shop_manager'\)[\s\S]*s\.shop_status = 'active'/,
    "record_sync_event must authorize selected shop writes through active owner/manager membership",
  );
  assert.match(
    migration,
    /insert into public\.sync_events \([\s\S]*owner_user_id,\s*shop_id,\s*store_id/,
    "record_sync_event must persist shop_id on sync_events",
  );
  assert.match(
    migration,
    /where owner_user_id = v_owner[\s\S]*client_event_id = p_client_event_id[\s\S]*\(p_shop_id is null and shop_id is null\)[\s\S]*or shop_id = p_shop_id/,
    "client_event_id idempotency must not mix selected shops",
  );
  assertContains(types, "p_shop_id?: string");
});

test("Mobile Shop Context sync idempotency and status metadata are shop-safe", () => {
  const migration = read(
    "supabase/migrations/20260622160000_mobile_shop_context_switcher.sql",
  );

  for (const required of [
    "drop index if exists public.sync_events_owner_client_event_id_unique",
    "create unique index if not exists sync_events_owner_client_event_id_no_shop_unique",
    "on public.sync_events (owner_user_id, client_event_id)",
    "where client_event_id is not null\n    and shop_id is null",
    "create unique index if not exists sync_events_owner_shop_client_event_id_unique",
    "on public.sync_events (owner_user_id, shop_id, client_event_id)",
    "where client_event_id is not null\n    and shop_id is not null",
  ]) {
    assertContains(migration, required);
  }

  const statusFunction = migration.match(
    /create or replace function public\.shop_device_status_for_shop\([\s\S]*?\nend;\n\$\$;/,
  );
  assert.notEqual(statusFunction, null, "missing status-for-shop function");
  const statusSql = statusFunction[0];

  const nonMemberBlock = statusSql.match(
    /if v_shop_status is null or v_membership_status is null then([\s\S]*?)end if;/,
  );
  assert.notEqual(nonMemberBlock, null, "missing non-member status branch");
  assertContains(nonMemberBlock[1], "'code', 'unauthorized'");
  assertContains(nonMemberBlock[1], "'reason_code', 'not_linked_to_shop'");
  assert.doesNotMatch(
    nonMemberBlock[1],
    /shop_code|shop_name|shop_status|role_key|membership_status/,
    "not-found or non-member status checks must not receive shop metadata",
  );
  assert.doesNotMatch(
    statusSql,
    /'code', 'shop_not_found'|'reason_code', 'shop_not_found'/,
    "status_for_shop must not expose whether an arbitrary shop id exists",
  );

  const inactiveMemberBlock = statusSql.match(
    /if v_membership_status is distinct from 'active' then([\s\S]*?)end if;/,
  );
  assert.notEqual(
    inactiveMemberBlock,
    null,
    "missing inactive-member status branch",
  );
  assertContains(inactiveMemberBlock[1], "'code', 'membership_not_active'");
  assertContains(inactiveMemberBlock[1], "'membership_status', v_membership_status");
  assert.doesNotMatch(
    inactiveMemberBlock[1],
    /shop_code|shop_name|shop_status|role_key/,
    "inactive members must not receive shop metadata",
  );

  const inactiveShopBlock = statusSql.match(
    /if v_shop_status <> 'active' then([\s\S]*?)end if;/,
  );
  assert.notEqual(inactiveShopBlock, null, "missing inactive-shop status branch");
  assertContains(inactiveShopBlock[1], "'code', 'shop_not_active'");
  assert.doesNotMatch(
    inactiveShopBlock[1],
    /shop_code|shop_name|shop_status|role_key|membership_status/,
    "inactive shops must not expose shop or membership metadata",
  );
});

test("Mobile Shop Context device register checks membership before shop state", () => {
  const migration = read(
    "supabase/migrations/20260622160000_mobile_shop_context_switcher.sql",
  );

  const registerFunction = migration.match(
    /create or replace function public\.shop_device_register_for_shop\([\s\S]*?\nend;\n\$\$;/,
  );
  assert.notEqual(registerFunction, null, "missing register-for-shop function");

  const registerSql = registerFunction[0];
  assert.match(
    registerSql,
    /left join public\.shop_members sm[\s\S]*and sm\.profile_id = actor_id/,
    "register_for_shop must evaluate caller membership inside the selected shop",
  );
  assert.match(
    registerSql,
    /if v_membership_status is null then[\s\S]*'unauthorized'[\s\S]*end if;[\s\S]*if v_membership_status is distinct from 'active' then[\s\S]*'membership_not_active'[\s\S]*end if;[\s\S]*if v_role_key not in \('shop_owner', 'shop_manager'\) then[\s\S]*'write_not_allowed'[\s\S]*end if;[\s\S]*if v_shop_status <> 'active' then[\s\S]*'shop_not_active'/,
    "register_for_shop must fail closed on membership and role before distinguishing inactive shop state",
  );
  assert.doesNotMatch(
    registerSql,
    /shop_not_found/,
    "register_for_shop must not expose shop existence to non-members",
  );
});
