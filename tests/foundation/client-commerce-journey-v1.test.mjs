import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260823023037_client_commerce_journey_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

test("address v2 remains additive, owner-scoped and coordinate-optional", () => {
  assert.match(migration, /add column recipient_phone_e164 text/);
  assert.match(migration, /add column latitude numeric\(9, 6\)/);
  assert.match(migration, /add column longitude numeric\(9, 6\)/);
  assert.match(migration, /recipient_phone_e164 is null/);
  assert.match(migration, /num_nonnulls\(latitude, longitude\) in \(0, 2\)/);
  assert.match(migration, /'validatedAt'/);
  assert.match(migration, /revoke select on table public\.customer_addresses from authenticated/);
  assert.match(migration, /owner_user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /set latitude = .*random|backfill.*latitude/i);
});

test("delivery context delegates to existing zones, slots and capacity", () => {
  assert.match(migration, /storefront_delivery_context_preview_v1/);
  assert.match(migration, /public\.storefront_delivery_zones/);
  assert.match(migration, /public\.storefront_fulfillment_slots/);
  assert.match(migration, /storefront_fulfillment_slot_active_uses_v1/);
  assert.match(migration, /estimatedFeeClp', v_zone\.fee_clp/);
  assert.match(migration, /stale_context/);
  assert.doesNotMatch(migration, /haversine|route_distance|client_distance/i);
});

test("notification inbox extends the existing event ledger with safe destinations", () => {
  assert.match(migration, /alter table public\.customer_notification_events/);
  assert.match(migration, /destination_type in \('order', 'after_sales', 'product', 'notifications'\)/);
  assert.match(migration, /customer_notification_arguments_safe_v1/);
  assert.match(migration, /unsafe_notification_destination/);
  assert.match(migration, /\(notification_event\.created_at, notification_event\.id\)/);
  assert.match(migration, /customer_notifications_mark_all_read_v1/);
  assert.match(
    migration,
    /destination_id = coalesce\(\s*notification_event\.order_id,\s*notification_event\.shop_id\s*\)/,
  );
  assert.doesNotMatch(migration, /create table public\.customer_notifications\b/);
});

test("reorder uses current Storefront projection and never creates an order", () => {
  const functionBody = migration.match(
    /create or replace function public\.customer_order_reorder_apply_v1[\s\S]*?\nend;\n\$\$;/,
  )?.[0];
  assert.ok(functionBody);
  assert.match(functionBody, /public\.storefront_catalog_items/);
  assert.match(functionBody, /public\.customer_cart_items/);
  assert.match(functionBody, /idempotency_conflict/);
  assert.doesNotMatch(functionBody, /insert into public\.customer_orders/);
});

test("after-sales keeps evidence private and refund completion service-authoritative", () => {
  assert.match(migration, /customer-after-sales-evidence/);
  assert.match(migration, /customer_service_case_evidence_upload_tickets/);
  assert.match(migration, /service_after_sales_evidence_cleanup_claim_v1/);
  assert.match(migration, /service_after_sales_evidence_cleanup_ack_v1/);
  assert.match(migration, /delegated to the supported Storage API/);
  assert.doesNotMatch(migration, /delete from storage\.objects/i);
  assert.match(migration, /public, anon, authenticated/);
  assert.match(migration, /scan_status in \('pending_scan', 'safe', 'rejected'\)/);
  assert.match(migration, /exif_removed/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /payment_ack_required/);
  assert.match(migration, /no_money_collected/);
  assert.doesNotMatch(
    migration,
    /v_case\.status = 'refundPending' and p_target_status = 'closed'/,
  );
});

test("verified reviews require a completed owner order and server moderation", () => {
  assert.match(migration, /v_order\.status <> 'completed'/);
  assert.match(migration, /unique \(user_id, order_item_id\)/);
  assert.match(migration, /moderation_status in \('pending', 'published', 'rejected', 'withdrawn'\)/);
  assert.match(migration, /storefront_review_aggregate_refresh_v1/);
  assert.match(migration, /'storefront\.publish'/);
  assert.match(migration, /\(review\.submitted_at, review\.id\)/);
  assert.doesNotMatch(migration, /anonymous_review|seller_reply/i);
});

test("Admin exposes bounded after-sales and review queues", () => {
  const afterSalesPage = readFileSync(
    new URL("../../src/app/shop/after-sales/page.tsx", import.meta.url),
    "utf8",
  );
  const reviewsPage = readFileSync(
    new URL("../../src/app/shop/reviews/page.tsx", import.meta.url),
    "utf8",
  );
  const evidenceService = readFileSync(
    new URL(
      "../../src/server/shop-admin/customer-commerce-evidence.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const readModel = readFileSync(
    new URL(
      "../../src/server/shop-admin/customer-commerce-read-model.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(afterSalesPage, /Nuovi/);
  assert.match(afterSalesPage, /Rimborso in attesa/);
  assert.match(afterSalesPage, /ACK provider/);
  assert.match(afterSalesPage, /Visualizza prova/);
  assert.match(evidenceService, /EVIDENCE_READ_TTL_SECONDS = 60/);
  assert.match(evidenceService, /revalidateShopAdminDataAccessForPublish/);
  assert.match(evidenceService, /\.from\(EVIDENCE_BUCKET\)\s*\.remove\(objectPaths\)/);
  assert.match(evidenceService, /service_after_sales_evidence_cleanup_ack_v1/);
  assert.match(reviewsPage, /Recensioni verificate/);
  assert.match(reviewsPage, /Pubblica/);
  assert.match(reviewsPage, /Motivo rifiuto/);
  assert.match(readModel, /"storefront\.publish"/);
  assert.match(readModel, /revalidateShopAdminDataAccessForPublish/);
});

test("search assist uses only published projection and persists no query history", () => {
  const functionBody = migration.match(
    /create or replace function public\.storefront_search_suggestions_v1[\s\S]*?\nend;\n\$\$;/,
  )?.[0];
  assert.ok(functionBody);
  assert.match(functionBody, /public\.storefront_catalog_items/);
  assert.match(functionBody, /storefront_enabled/);
  assert.doesNotMatch(functionBody, /insert into|update public|user_id|auth\.uid/);
});
