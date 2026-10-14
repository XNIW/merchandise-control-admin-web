// Contratti nullable documentati, inclusi in tsc --noEmit. Nessun cast permissivo.
import type { Database } from '../../src/lib/supabase/database.types';
type Args<F extends keyof Database['public']['Functions']> = Database['public']['Functions'][F]['Args'];
const address: Args<'customer_address_upsert_v2'> = {p_address_id: null, p_expected_version: null, p_payload: {addressLine1: 'Via Test'}};
const addressCreate: Args<'customer_address_create_v3'> = {p_intent_id: 'fixture-intent', p_payload: address.p_payload};
const addressReconcile: Args<'customer_address_create_reconcile_v3'> = {p_intent_id: addressCreate.p_intent_id};
// @ts-expect-error il nuovo create richiede sempre l'identità durevole
const missingAddressIntent: Args<'customer_address_create_v3'> = {p_payload: address.p_payload};
// @ts-expect-error gli indirizzi sono account-global: nessuna authority shop
const addressShopInjection: Args<'customer_address_create_reconcile_v3'> = {...addressReconcile, p_shop_slug: 'other'};
const pickup: Args<'customer_checkout_quote_create_v2'> = {p_address_id: null, p_cart_version: 1, p_expected_context_version: 1, p_fulfillment_mode: 'pickup', p_idempotency_key: 'fixture-key', p_pickup_point_id: 'fixture-point', p_shop_slug: 'fixture-shop', p_slot_id: 'fixture-slot'};
const delivery: Args<'customer_checkout_quote_create_v2'> = {...pickup, p_fulfillment_mode: 'delivery', p_address_id: 'fixture-address', p_pickup_point_id: null};
const context: Args<'customer_delivery_context_select_v1'> = {p_shop_slug: 'fixture-shop', p_mode: 'pickup', p_address_id: null, p_pickup_point_id: 'fixture-point'};
const preview: Args<'storefront_delivery_context_preview_v1'> = {p_shop_slug: 'fixture-shop', p_mode: 'delivery', p_address_id: null, p_pickup_point_id: null, p_commune: null};
const page: Args<'customer_notifications_list_v1'> = {p_shop_slug: 'fixture-shop', p_before_created_at: null, p_before_id: null};
const orderPage: Args<'customer_order_list_v1'> = {p_shop_slug: 'fixture-shop', p_before_placed_at: null, p_before_order_id: null};
const revoked: Args<'customer_record_privacy_consent_v1'> = {p_accepted: false, p_version: null};
// @ts-expect-error versione obbligatoria non accetta stringhe
const wrongVersion: Args<'customer_address_upsert_v2'> = {...address, p_expected_version: '1'};
// @ts-expect-error il payload è obbligatorio
const missingPayload: Args<'customer_address_upsert_v2'> = {p_address_id: null, p_expected_version: null};
// @ts-expect-error nessuna authority owner client-supplied
const ownerInjection: Args<'customer_delivery_context_select_v1'> = {...context, p_user_id: 'other'};
void [address, addressCreate, addressReconcile, missingAddressIntent, addressShopInjection, pickup, delivery, context, preview, page, orderPage, revoked, wrongVersion, missingPayload, ownerInjection];
