-- Mantiene la deduplicazione storica per reservation_hold_id; nessuna riga rimossa.
-- Prerequisito: client_commerce_journey_v1 e order_lines_v1 già applicate.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop index public.customer_notification_events_safe_dedup_idx;
create unique index customer_notification_events_safe_dedup_idx
  on public.customer_notification_events(
    user_id, shop_id, source_kind, destination_id, event_key, event_version
  ) where source_kind <> 'reservation_hold';
comment on index public.customer_notification_events_safe_dedup_idx is
  'Le prenotazioni usano customer_notification_events_hold_source_idx per hold distinto.';
commit;
